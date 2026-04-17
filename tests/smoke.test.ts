import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Synapse } from "../src/index.js";

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
});
