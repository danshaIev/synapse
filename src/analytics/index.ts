import type { GraphStoreAPI } from "../graph/interface.js";
import type { Protocol } from "../protocol/types.js";
import type { DecayTracker } from "../reinjector/index.js";

export interface StepOutcomes {
  total: number;
  completed: number;
  blocked: number;
  failed: number;
  driftBlocks: number;
  ruleBlocks: number;
  inFlight: number;
}

export interface RuleMetrics {
  id: string;
  priority: string;
  scope: string[];
  evaluations: number;
  violations: number;
  violationRate: number;
  firstHalfRate: number | null;
  secondHalfRate: number | null;
  trajectory: "improving" | "worsening" | "stable" | "insufficient_data";
  currentlyDecaying: boolean;
  dead: boolean;
}

export interface ScopeMetrics {
  scope: string;
  steps: number;
  blocked: number;
  completed: number;
}

export interface AnalyticsReport {
  steps: StepOutcomes;
  rules: RuleMetrics[];
  scopes: ScopeMetrics[];
  driftBlockRate: number;
  ruleEnforcementRate: number;
  deadRuleCount: number;
  reinjectionImpact: number | null;
  interventionsPerStep: number;
}

export class Analytics {
  constructor(
    private store: GraphStoreAPI,
    private protocol: Protocol,
    private decay: DecayTracker,
  ) {}

  report(): AnalyticsReport {
    const steps = this.computeStepOutcomes();
    const rules = this.computeRuleMetrics();
    const scopes = this.computeScopeMetrics();

    const driftBlockRate = steps.total ? steps.driftBlocks / steps.total : 0;
    const totalViolations = rules.reduce((s, r) => s + r.violations, 0);
    const totalEvaluations = rules.reduce((s, r) => s + r.evaluations, 0);
    const ruleEnforcementRate = totalEvaluations
      ? 1 - totalViolations / totalEvaluations
      : 1;
    const deadRuleCount = rules.filter((r) => r.dead).length;

    const trajRules = rules.filter(
      (r) => r.firstHalfRate !== null && r.secondHalfRate !== null,
    );
    const reinjectionImpact = trajRules.length
      ? trajRules.reduce(
          (s, r) => s + (r.firstHalfRate! - r.secondHalfRate!),
          0,
        ) / trajRules.length
      : null;

    const interventions = steps.blocked + steps.failed;
    const interventionsPerStep = steps.total ? interventions / steps.total : 0;

    return {
      steps,
      rules,
      scopes,
      driftBlockRate,
      ruleEnforcementRate,
      deadRuleCount,
      reinjectionImpact,
      interventionsPerStep,
    };
  }

  summary(): string {
    const r = this.report();
    const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
    const lines: string[] = [];
    lines.push(`# Synapse Analytics`);
    lines.push("");
    lines.push(`## Steps`);
    lines.push(`- total: ${r.steps.total}`);
    lines.push(`- completed: ${r.steps.completed}`);
    lines.push(
      `- blocked: ${r.steps.blocked} (drift: ${r.steps.driftBlocks}, rule: ${r.steps.ruleBlocks})`,
    );
    lines.push(`- failed: ${r.steps.failed}`);
    if (r.steps.inFlight) lines.push(`- in-flight: ${r.steps.inFlight}`);
    lines.push("");
    lines.push(`## Signal`);
    lines.push(`- drift block rate: ${pct(r.driftBlockRate)}`);
    lines.push(`- rule enforcement rate: ${pct(r.ruleEnforcementRate)}`);
    lines.push(`- interventions/step: ${pct(r.interventionsPerStep)}`);
    if (r.reinjectionImpact !== null) {
      const delta = r.reinjectionImpact;
      const label =
        delta > 0.05 ? "reinjection helping" : delta < -0.05 ? "decay winning" : "flat";
      lines.push(
        `- reinjection impact: Δ ${(delta * 100).toFixed(1)}pp first→second half (${label})`,
      );
    }
    if (r.deadRuleCount) {
      lines.push(`- dead rules (never fired): ${r.deadRuleCount}`);
    }
    lines.push("");
    if (r.rules.length) {
      lines.push(`## Rules`);
      for (const rule of r.rules) {
        const traj =
          rule.trajectory === "improving"
            ? "↓"
            : rule.trajectory === "worsening"
            ? "↑"
            : rule.trajectory === "stable"
            ? "→"
            : "·";
        const tag = rule.dead
          ? " [DEAD]"
          : rule.currentlyDecaying
          ? " [DECAYING]"
          : "";
        lines.push(
          `- ${rule.id} (${rule.priority}) ${traj} ${rule.violations}/${rule.evaluations} = ${pct(rule.violationRate)}${tag}`,
        );
      }
      lines.push("");
    }
    if (r.scopes.length) {
      lines.push(`## Scopes`);
      for (const s of r.scopes) {
        lines.push(
          `- ${s.scope}: ${s.steps} steps (${s.completed} completed, ${s.blocked} blocked)`,
        );
      }
    }
    return lines.join("\n");
  }

  private computeStepOutcomes(): StepOutcomes {
    const stepNodes = this.store.getNodesByType("STEP");
    let completed = 0;
    let blocked = 0;
    let failed = 0;
    let driftBlocks = 0;
    let ruleBlocks = 0;
    let inFlight = 0;

    for (const n of stepNodes) {
      const isBlocked = n.metadata["blocked"] === true;
      const isFailed = n.metadata["failed"] === true;
      if (isBlocked) {
        blocked += 1;
        const blockType = n.metadata["blockType"];
        if (blockType === "drift") driftBlocks += 1;
        else ruleBlocks += 1;
        continue;
      }
      if (isFailed) {
        failed += 1;
        continue;
      }
      const hasObservation = this.store
        .getEdgesFrom(n.id, "RETURNS")
        .length > 0;
      if (hasObservation) completed += 1;
      else inFlight += 1;
    }

    return {
      total: stepNodes.length,
      completed,
      blocked,
      failed,
      driftBlocks,
      ruleBlocks,
      inFlight,
    };
  }

  private computeRuleMetrics(): RuleMetrics[] {
    const totals = this.decay.totals();
    return this.protocol.rules.map((rule) => {
      const s = totals[rule.id] ?? {
        evaluations: 0,
        violations: 0,
        recentViolations: [],
        history: [],
      };
      const violationRate = s.evaluations ? s.violations / s.evaluations : 0;
      const { firstHalfRate, secondHalfRate, trajectory } = splitHalfTrajectory(
        s.history,
      );
      return {
        id: rule.id,
        priority: rule.priority,
        scope: rule.scope,
        evaluations: s.evaluations,
        violations: s.violations,
        violationRate,
        firstHalfRate,
        secondHalfRate,
        trajectory,
        currentlyDecaying: this.decay.isDecaying(rule.id),
        dead: s.evaluations === 0,
      };
    });
  }

  private computeScopeMetrics(): ScopeMetrics[] {
    const stepNodes = this.store.getNodesByType("STEP");
    const byScope = new Map<string, ScopeMetrics>();
    for (const n of stepNodes) {
      const scope = n.scope ?? "unscoped";
      if (!byScope.has(scope)) {
        byScope.set(scope, { scope, steps: 0, blocked: 0, completed: 0 });
      }
      const m = byScope.get(scope)!;
      m.steps += 1;
      if (n.metadata["blocked"] === true) m.blocked += 1;
      else if (this.store.getEdgesFrom(n.id, "RETURNS").length > 0) {
        m.completed += 1;
      }
    }
    return [...byScope.values()].sort((a, b) => b.steps - a.steps);
  }
}

function splitHalfTrajectory(history: number[]): {
  firstHalfRate: number | null;
  secondHalfRate: number | null;
  trajectory: RuleMetrics["trajectory"];
} {
  if (history.length < 4) {
    return {
      firstHalfRate: null,
      secondHalfRate: null,
      trajectory: "insufficient_data",
    };
  }
  const mid = Math.floor(history.length / 2);
  const first = history.slice(0, mid);
  const second = history.slice(mid);
  const firstRate = first.reduce((s, v) => s + v, 0) / first.length;
  const secondRate = second.reduce((s, v) => s + v, 0) / second.length;
  const delta = firstRate - secondRate;
  const trajectory: RuleMetrics["trajectory"] =
    delta > 0.1 ? "improving" : delta < -0.1 ? "worsening" : "stable";
  return { firstHalfRate: firstRate, secondHalfRate: secondRate, trajectory };
}
