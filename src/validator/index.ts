import type { GraphStoreAPI } from "../graph/interface.js";
import type { PredicateContext, Rule } from "../protocol/types.js";
import { compilePredicate } from "./predicates.js";

export interface ValidationResult {
  allowed: boolean;
  blockingViolations: RuleViolation[];
  softViolations: RuleViolation[];
  infoViolations: RuleViolation[];
}

export interface RuleViolation {
  ruleId: string;
  scope: string;
  message: string;
  action: Rule["on_violation"];
}

export class Validator {
  private predicates = new Map<string, ReturnType<typeof compilePredicate>>();
  private byScope = new Map<string, Rule[]>();
  private allScopes: Set<string>;

  constructor(
    private rules: Rule[],
    _store: GraphStoreAPI,
  ) {
    this.allScopes = new Set();
    for (const rule of rules) {
      this.predicates.set(rule.id, compilePredicate(rule));
      for (const scope of rule.scope) {
        if (scope !== "*") this.allScopes.add(scope);
        const existing = this.byScope.get(scope);
        if (existing) existing.push(rule);
        else this.byScope.set(scope, [rule]);
      }
    }
  }

  knownScopes(): Set<string> {
    return this.allScopes;
  }

  private applicable(scope: string): Rule[] {
    const scoped = this.byScope.get(scope) ?? [];
    const wildcard = this.byScope.get("*") ?? [];
    return scoped.concat(wildcard);
  }

  async validate(ctx: PredicateContext): Promise<ValidationResult> {
    const applicable = this.applicable(ctx.scope);
    const blocking: RuleViolation[] = [];
    const soft: RuleViolation[] = [];
    const info: RuleViolation[] = [];

    for (const rule of applicable) {
      const fn = this.predicates.get(rule.id)!;
      const passed = await fn(ctx);
      if (passed) continue;
      const violation: RuleViolation = {
        ruleId: rule.id,
        scope: ctx.scope,
        message: `Rule "${rule.id}" violated: ${
          typeof rule.predicate === "string" ? rule.predicate : "(function)"
        }`,
        action: rule.on_violation,
      };
      if (rule.priority === "HARD") blocking.push(violation);
      else if (rule.priority === "SOFT") soft.push(violation);
      else info.push(violation);
    }

    return {
      allowed: blocking.length === 0,
      blockingViolations: blocking,
      softViolations: soft,
      infoViolations: info,
    };
  }

  applicableRulesFor(scope: string): Rule[] {
    return this.applicable(scope);
  }
}
