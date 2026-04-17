import type { GraphStore } from "../graph/store.js";
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

  constructor(
    private rules: Rule[],
    _store: GraphStore,
  ) {
    for (const rule of rules) {
      this.predicates.set(rule.id, compilePredicate(rule));
    }
  }

  async validate(ctx: PredicateContext): Promise<ValidationResult> {
    const applicable = this.rules.filter((r) => r.scope.includes(ctx.scope));
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
    return this.rules.filter((r) => r.scope.includes(scope));
  }
}
