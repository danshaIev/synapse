import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Synapse } from "../src/index.js";

const protocol = {
  intent: { immutable: true, text: "Test intent" },
  rules: [
    {
      id: "needs-foo",
      priority: "HARD" as const,
      scope: ["write"],
      predicate: "must include `foo`",
      on_violation: "block_and_revise" as const,
    },
    {
      id: "dead-rule",
      priority: "SOFT" as const,
      scope: ["never-used-scope"],
      predicate: "never evaluated",
      on_violation: "log_only" as const,
    },
  ],
};

describe("Analytics", () => {
  it("reports step outcomes and rule metrics", async () => {
    const s = Synapse.fromObject(protocol);

    await s.step({
      scope: "write",
      description: "good",
      metadata: { content: "foo bar" },
      action: async () => "ok",
    });
    await s.step({
      scope: "write",
      description: "bad",
      metadata: { content: "nope" },
      action: async () => "should not run",
    });

    const report = s.getAnalytics().report();
    assert.equal(report.steps.total, 2);
    assert.equal(report.steps.completed, 1);
    assert.equal(report.steps.blocked, 1);
    assert.equal(report.steps.ruleBlocks, 1);
    assert.equal(report.steps.driftBlocks, 0);

    const needsFoo = report.rules.find((r) => r.id === "needs-foo")!;
    assert.equal(needsFoo.evaluations, 2);
    assert.equal(needsFoo.violations, 1);

    const dead = report.rules.find((r) => r.id === "dead-rule")!;
    assert.equal(dead.dead, true);
    assert.equal(report.deadRuleCount, 1);
  });

  it("computes trajectory across halves", async () => {
    const s = Synapse.fromObject(protocol);
    // first half: all violations
    for (let i = 0; i < 4; i++) {
      await s.step({
        scope: "write",
        description: `bad ${i}`,
        metadata: { content: "miss" },
        action: async () => "x",
      });
    }
    // second half: all passing
    for (let i = 0; i < 4; i++) {
      await s.step({
        scope: "write",
        description: `good ${i}`,
        metadata: { content: "foo" },
        action: async () => "x",
      });
    }
    const report = s.getAnalytics().report();
    const needsFoo = report.rules.find((r) => r.id === "needs-foo")!;
    assert.equal(needsFoo.trajectory, "improving");
    assert.ok((report.reinjectionImpact ?? 0) > 0);
  });

  it("renders a summary string", async () => {
    const s = Synapse.fromObject(protocol);
    await s.step({
      scope: "write",
      description: "good",
      metadata: { content: "foo" },
      action: async () => "ok",
    });
    const text = s.getAnalytics().summary();
    assert.match(text, /Synapse Analytics/);
    assert.match(text, /Steps/);
    assert.match(text, /needs-foo/);
  });
});
