import type { Rule } from "../protocol/types.js";

export interface RuleStats {
  evaluations: number;
  violations: number;
  recentViolations: number[];
  history: number[];
}

export class DecayTracker {
  private stats = new Map<string, RuleStats>();
  private readonly windowSize = 10;
  private readonly decayThreshold = 0.3;
  private readonly historyCap = 500;

  constructor(rules: Rule[]) {
    for (const rule of rules) {
      this.stats.set(rule.id, {
        evaluations: 0,
        violations: 0,
        recentViolations: [],
        history: [],
      });
    }
  }

  recordEvaluation(ruleId: string, violated: boolean): void {
    const stat = this.stats.get(ruleId);
    if (!stat) return;
    stat.evaluations += 1;
    if (violated) stat.violations += 1;
    const bit = violated ? 1 : 0;
    stat.history.push(bit);
    if (stat.history.length > this.historyCap) stat.history.shift();
    stat.recentViolations.push(bit);
    if (stat.recentViolations.length > this.windowSize) {
      stat.recentViolations.shift();
    }
  }

  isDecaying(ruleId: string): boolean {
    const stat = this.stats.get(ruleId);
    if (!stat || stat.recentViolations.length < 3) return false;
    const recentRate =
      stat.recentViolations.reduce((s, v) => s + v, 0) /
      stat.recentViolations.length;
    return recentRate >= this.decayThreshold;
  }

  decayingRuleIds(): string[] {
    return [...this.stats.keys()].filter((id) => this.isDecaying(id));
  }

  recentViolationCount(ruleId: string): number {
    const stat = this.stats.get(ruleId);
    if (!stat) return 0;
    return stat.recentViolations.reduce((s, v) => s + v, 0);
  }

  totals(): Record<string, RuleStats> {
    return Object.fromEntries(this.stats.entries());
  }
}
