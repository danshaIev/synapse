import type { GraphStore } from "../graph/store.js";
import type { GraphNode } from "../graph/types.js";
import type { Protocol, Rule } from "../protocol/types.js";
import type { DecayTracker } from "../reinjector/index.js";

export interface ProjectionInput {
  scope: string;
  recentLimit?: number;
}

export interface Projection {
  intent: string;
  applicableRules: ProjectedRule[];
  recentObservations: string[];
  recentSteps: string[];
  failedAttempts: string[];
  estimatedTokens: number;
}

interface ProjectedRule {
  id: string;
  text: string;
  priority: string;
  emphasis: number;
}

export class Projector {
  constructor(
    private store: GraphStore,
    private protocol: Protocol,
    private decay: DecayTracker,
  ) {}

  project(input: ProjectionInput): Projection {
    const recentLimit = input.recentLimit ?? 5;

    const applicableRules = this.protocol.rules
      .filter((r) => r.scope.includes(input.scope))
      .map((r) => this.projectRule(r));

    const allSteps = this.store
      .getNodesByType("STEP")
      .filter((n) => n.scope === input.scope)
      .sort((a, b) => b.createdAt - a.createdAt);

    const recentSteps = allSteps
      .slice(0, recentLimit)
      .map((n) => `[${n.id}] ${n.content}`);

    const failedAttempts = allSteps
      .filter((n) => n.metadata["failed"] === true)
      .slice(0, recentLimit)
      .map(
        (n) =>
          `[${n.id}] ${n.content}${
            n.metadata["failureReason"] ? ` — ${n.metadata["failureReason"]}` : ""
          }`,
      );

    const recentObservations = this.store
      .getNodesByType("OBSERVATION")
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, recentLimit)
      .map((n) => `[${n.id}] ${truncate(n.content, 200)}`);

    const projection: Projection = {
      intent: this.protocol.intent.text,
      applicableRules,
      recentObservations,
      recentSteps,
      failedAttempts,
      estimatedTokens: 0,
    };

    projection.estimatedTokens = estimateTokens(projection);
    return projection;
  }

  toContextString(input: ProjectionInput): string {
    const proj = this.project(input);
    const lines: string[] = [];
    lines.push(`# INTENT (immutable)`);
    lines.push(proj.intent);
    lines.push("");

    if (proj.applicableRules.length > 0) {
      lines.push(`# RULES (active for scope: ${input.scope})`);
      for (const rule of proj.applicableRules) {
        const tag = rule.emphasis > 1 ? ` [DECAYING — emphasis ${rule.emphasis}]` : "";
        lines.push(`- (${rule.priority}) ${rule.id}${tag}: ${rule.text}`);
      }
      lines.push("");
    }

    if (proj.recentSteps.length > 0) {
      lines.push(`# RECENT STEPS`);
      for (const s of proj.recentSteps) lines.push(`- ${s}`);
      lines.push("");
    }

    if (proj.failedAttempts.length > 0) {
      lines.push(`# FAILED ATTEMPTS (avoid repeating)`);
      for (const f of proj.failedAttempts) lines.push(`- ${f}`);
      lines.push("");
    }

    if (proj.recentObservations.length > 0) {
      lines.push(`# RECENT OBSERVATIONS`);
      for (const o of proj.recentObservations) lines.push(`- ${o}`);
    }

    return lines.join("\n");
  }

  private projectRule(rule: Rule): ProjectedRule {
    const decaying = this.decay.isDecaying(rule.id);
    const emphasis = decaying ? 2 + this.decay.recentViolationCount(rule.id) : 1;
    return {
      id: rule.id,
      text: typeof rule.predicate === "string" ? rule.predicate : "(custom predicate)",
      priority: rule.priority,
      emphasis,
    };
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}

function estimateTokens(proj: Projection): number {
  const text =
    proj.intent +
    proj.applicableRules.map((r) => r.text).join(" ") +
    proj.recentObservations.join(" ") +
    proj.recentSteps.join(" ") +
    proj.failedAttempts.join(" ");
  return Math.ceil(text.length / 4);
}

export function _testEstimate(node: GraphNode): number {
  return Math.ceil(node.content.length / 4);
}
