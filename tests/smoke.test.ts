import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Synapse } from "../src/index.js";
import { SQLiteGraphStore } from "../src/graph/sqlite-store.js";

const protocol = {
  intent: { immutable: true, text: "Test intent" },
  rules: [
    {
      id: "must-include-foo",
      priority: "HARD" as const,
      scope: ["test"],
      predicate: "must include `foo`",
      on_violation: "block_and_revise" as const,
    },
  ],
};

describe("Synapse", () => {
  it("allows steps that satisfy rules", async () => {
    const s = Synapse.fromObject(protocol);
    const r = await s.step({
      scope: "test",
      description: "Step with foo",
      metadata: { content: "this contains foo" },
      action: async () => "ok",
    });
    assert.equal(r.ok, true);
    assert.equal(r.value, "ok");
  });

  it("blocks steps that violate HARD rules", async () => {
    const s = Synapse.fromObject(protocol);
    const r = await s.step({
      scope: "test",
      description: "Step missing foo",
      metadata: { content: "no f-word here" },
      action: async () => "should not run",
    });
    assert.equal(r.ok, false);
    assert.equal(r.blocked?.blockingViolations[0]?.ruleId, "must-include-foo");
  });

  it("tracks decaying rules across multiple violations", async () => {
    const s = Synapse.fromObject(protocol);
    for (let i = 0; i < 4; i++) {
      await s.step({
        scope: "test",
        description: `bad step ${i}`,
        metadata: { content: "missing" },
        action: async () => "x",
      });
    }
    assert.ok(s.getDecayingRules().includes("must-include-foo"));
  });

  it("projects context including intent + rules", async () => {
    const s = Synapse.fromObject(protocol);
    const ctx = s.projectContext("test");
    assert.match(ctx, /Test intent/);
    assert.match(ctx, /must-include-foo/);
  });

  it("accepts a pluggable store (SQLite)", async () => {
    const store = new SQLiteGraphStore();
    const s = Synapse.fromObject(protocol, { store });
    await s.step({
      scope: "test",
      description: "ok",
      metadata: { content: "has foo" },
      action: async () => "x",
    });
    assert.ok(store.getNodesByType("STEP").length >= 1);
    assert.ok(store.getNodesByType("INTENT").length === 1);
  });

  it("blocks drift in strict-scopes mode when scope is unknown", async () => {
    const s = Synapse.fromObject(protocol, { strictScopes: true });
    const r = await s.step({
      scope: "totally-unknown-scope",
      description: "off-plan",
      action: async () => "x",
    });
    assert.equal(r.ok, false);
    assert.equal(r.blocked?.blockingViolations[0]?.ruleId, "__drift__");
    const report = s.getAnalytics().report();
    assert.equal(report.steps.driftBlocks, 1);
    assert.equal(report.steps.ruleBlocks, 0);
  });

  it("emits rule.violated and rule.respected events", async () => {
    const s = Synapse.fromObject(protocol);
    const fired: string[] = [];
    s.on((e) => {
      if (e.type === "rule.violated" || e.type === "rule.respected") {
        fired.push(`${e.type}:${e.ruleId}`);
      }
    });
    await s.step({
      scope: "test",
      description: "good",
      metadata: { content: "has foo" },
      action: async () => "x",
    });
    await s.step({
      scope: "test",
      description: "bad",
      metadata: { content: "nope" },
      action: async () => "x",
    });
    assert.ok(fired.includes("rule.respected:must-include-foo"));
    assert.ok(fired.includes("rule.violated:must-include-foo"));
  });
});
