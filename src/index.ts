import { GraphStore } from "./graph/store.js";
import type { GraphStoreAPI } from "./graph/interface.js";
import { tracesToIntent } from "./graph/traversal.js";
import { parseProtocolFile, parseProtocolObject } from "./protocol/parser.js";
import type { Protocol } from "./protocol/types.js";
import { Projector } from "./projector/index.js";
import { DecayTracker } from "./reinjector/index.js";
import { Tracer } from "./tracer/index.js";
import type { EventListener } from "./tracer/events.js";
import { Validator, type ValidationResult } from "./validator/index.js";
import { Analytics } from "./analytics/index.js";

export interface StepInput<T> {
  scope: string;
  description: string;
  parentSubGoalId?: string;
  metadata?: Record<string, unknown>;
  action: (context: string) => Promise<T>;
}

export interface StepResult<T> {
  ok: boolean;
  value?: T;
  blocked?: ValidationResult;
  failure?: { reason: string };
  stepId: string;
}

export interface SynapseOptions {
  throwOnBlock?: boolean;
  store?: GraphStoreAPI;
  /**
   * When true, steps whose scope is not referenced by any rule are blocked
   * as drift. Default false (matches v0.1 behavior). Opt-in to get a real
   * drift signal instead of only catching orphaned parent chains.
   */
  strictScopes?: boolean;
}

export class StepBlockedError extends Error {
  constructor(
    public readonly result: ValidationResult,
    public readonly stepId: string,
  ) {
    super(
      `Step blocked. Violations: ${result.blockingViolations
        .map((v) => v.ruleId)
        .join(", ")}`,
    );
    this.name = "StepBlockedError";
  }
}

export class Synapse {
  private store: GraphStoreAPI;
  private tracer: Tracer;
  private validator: Validator;
  private projector: Projector;
  private decay: DecayTracker;
  private analytics: Analytics;
  private intentId: string;
  private throwOnBlock: boolean;
  private strictScopes: boolean;

  constructor(protocol: Protocol, options: SynapseOptions = {}) {
    this.store = options.store ?? new GraphStore();
    this.tracer = new Tracer(this.store);
    this.decay = new DecayTracker(protocol.rules);
    this.validator = new Validator(protocol.rules, this.store);
    this.projector = new Projector(this.store, protocol, this.decay);
    this.analytics = new Analytics(this.store, protocol, this.decay);
    this.throwOnBlock = options.throwOnBlock ?? false;
    this.strictScopes = options.strictScopes ?? false;

    const intent = this.store.addNode({
      type: "INTENT",
      content: protocol.intent.text,
      metadata: { immutable: protocol.intent.immutable },
    });
    this.intentId = intent.id;

    for (const rule of protocol.rules) {
      this.store.addNode({
        type: "RULE",
        content: typeof rule.predicate === "string" ? rule.predicate : "(fn)",
        metadata: { ruleId: rule.id, priority: rule.priority, scope: rule.scope },
        id: `RULE_${rule.id}`,
      });
    }
  }

  static async fromProtocolFile(
    path: string,
    options?: SynapseOptions,
  ): Promise<Synapse> {
    const protocol = await parseProtocolFile(path);
    return new Synapse(protocol, options);
  }

  static fromObject(input: unknown, options?: SynapseOptions): Synapse {
    return new Synapse(parseProtocolObject(input), options);
  }

  on(listener: EventListener): void {
    this.tracer.on(listener);
  }

  projectContext(scope: string): string {
    return this.projector.toContextString({ scope });
  }

  async step<T>(input: StepInput<T>): Promise<StepResult<T>> {
    const node = this.tracer.recordStep({
      scope: input.scope,
      description: input.description,
      parentSubGoalId: input.parentSubGoalId,
      intentId: this.intentId,
      metadata: input.metadata,
    });

    if (
      this.strictScopes &&
      !this.validator.knownScopes().has(input.scope)
    ) {
      const reason = `Step scope "${input.scope}" is not referenced by any rule (drift detected).`;
      return this.blockDrift(node.id, input.scope, input.description, reason);
    }

    const validation = await this.validator.validate({
      scope: input.scope,
      description: input.description,
      content: typeof input.metadata?.["content"] === "string"
        ? (input.metadata["content"] as string)
        : undefined,
      metadata: input.metadata,
    });

    for (const rule of this.validator.applicableRulesFor(input.scope)) {
      const violated =
        validation.blockingViolations.some((v) => v.ruleId === rule.id) ||
        validation.softViolations.some((v) => v.ruleId === rule.id) ||
        validation.infoViolations.some((v) => v.ruleId === rule.id);
      this.decay.recordEvaluation(rule.id, violated);
      this.tracer.emit({
        type: violated ? "rule.violated" : "rule.respected",
        ruleId: rule.id,
        stepId: node.id,
        timestamp: Date.now(),
      });
    }

    const linksToIntent = tracesToIntent(this.store, node.id, this.intentId);
    if (!linksToIntent) {
      return this.blockDrift(
        node.id,
        input.scope,
        input.description,
        "Step does not trace back to original intent (drift detected).",
      );
    }

    if (!validation.allowed) {
      this.tracer.markStepBlocked(node.id, input.scope, input.description, {
        blockType: "rule",
        blockReason: validation.blockingViolations.map((v) => v.message).join("; "),
        ruleIds: validation.blockingViolations.map((v) => v.ruleId),
      });
      if (this.throwOnBlock) throw new StepBlockedError(validation, node.id);
      return { ok: false, blocked: validation, stepId: node.id };
    }

    this.tracer.markStepAllowed(node.id, input.scope, input.description);

    const context = this.projector.toContextString({ scope: input.scope });
    try {
      const value = await input.action(context);
      this.tracer.recordObservation({
        fromStepId: node.id,
        content: typeof value === "string" ? value : JSON.stringify(value),
      });
      this.tracer.markStepCompleted(node.id, input.scope, input.description);
      return { ok: true, value, stepId: node.id };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.tracer.markStepFailed(node.id, input.scope, input.description, reason);
      return { ok: false, failure: { reason }, stepId: node.id };
    }
  }

  private blockDrift<T>(
    stepId: string,
    scope: string,
    description: string,
    reason: string,
  ): StepResult<T> {
    this.tracer.markStepBlocked(stepId, scope, description, {
      blockType: "drift",
      blockReason: reason,
    });
    const blocked: ValidationResult = {
      allowed: false,
      blockingViolations: [
        {
          ruleId: "__drift__",
          scope,
          message: reason,
          action: "block_and_revise",
        },
      ],
      softViolations: [],
      infoViolations: [],
    };
    if (this.throwOnBlock) throw new StepBlockedError(blocked, stepId);
    return { ok: false, blocked, stepId };
  }

  getGraph() {
    return this.store.toJSON();
  }

  getStore(): GraphStoreAPI {
    return this.store;
  }

  getDecayingRules(): string[] {
    return this.decay.decayingRuleIds();
  }

  getAnalytics(): Analytics {
    return this.analytics;
  }

  getStats() {
    return {
      nodes: this.store.allNodes().length,
      edges: this.store.allEdges().length,
      decayingRules: this.decay.decayingRuleIds(),
      ruleStats: this.decay.totals(),
    };
  }
}

export { parseProtocolFile, parseProtocolObject } from "./protocol/parser.js";
export type { Protocol, Rule } from "./protocol/types.js";
export type { ValidationResult, RuleViolation } from "./validator/index.js";
export type { GraphStoreAPI } from "./graph/interface.js";
export { Analytics } from "./analytics/index.js";
export type {
  AnalyticsReport,
  RuleMetrics,
  StepOutcomes,
  ScopeMetrics,
} from "./analytics/index.js";
