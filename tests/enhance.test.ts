import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enhance, Synapse } from "../src/index.js";

describe("enhance (drop-in wrapper)", () => {
  it("passes through simple calls with zero config", async () => {
    const fakeLLM = async (p: string) => `answered: ${p}`;
    const smart = enhance(fakeLLM, { goal: "be helpful" });
    const out = await smart("hello world");
    assert.match(out, /answered: /);
    assert.match(out, /hello world/);
  });

  it("retries when a HARD rule is violated, then succeeds", async () => {
    let calls = 0;
    const flipLLM = async (_p: string) => {
      calls += 1;
      return calls === 1 ? "" : "non-empty answer";
    };
    const smart = enhance(flipLLM, { goal: "respond" });
    const out = await smart("anything");
    assert.equal(calls, 2);
    assert.equal(out, "non-empty answer");
  });

  it("tracks AI-slop as a soft violation (non-blocking but counted)", async () => {
    const slopLLM = async (_p: string) => "As an AI language model, here goes.";
    const smart = enhance(slopLLM, { goal: "answer" });
    await smart("question");
    const report = smart.synapse.getAnalytics().report();
    const slopRule = report.rules.find((r) => r.id === "no-ai-slop");
    assert.equal(slopRule?.violations, 1);
    assert.equal(report.steps.blocked, 0);
  });

  it("exposes synapse instance for analytics", async () => {
    const llm = async (_p: string) => "fine response";
    const smart = enhance(llm, { goal: "test" });
    await smart("a");
    await smart("b");
    const report = smart.synapse.getAnalytics().report();
    assert.equal(report.steps.total, 2);
    assert.equal(report.steps.completed, 2);
  });

  it("gives up after maxRetries and returns blocked", async () => {
    const alwaysBadLLM = async (_p: string) => "";
    const smart = enhance(alwaysBadLLM, { goal: "respond", maxRetries: 1 });
    const out = await smart("x");
    assert.equal(out, "");
    const report = smart.synapse.getAnalytics().report();
    assert.equal(report.steps.blocked, 1);
  });
});

describe("Synapse.withDefaults", () => {
  it("creates a usable synapse with only a goal", async () => {
    const s = Synapse.withDefaults({ goal: "some task" });
    const r = await s.run({
      scope: "default",
      description: "test",
      call: async () => "a valid response",
    });
    assert.equal(r.ok, true);
    assert.equal(r.retries, 0);
  });

  it("applies wildcard-scope rules to any scope", async () => {
    const s = Synapse.withDefaults({ goal: "g", requirePhrases: ["[source]"] });
    const r = await s.run({
      scope: "anything-here",
      description: "needs source",
      call: async () => "response without citation",
    });
    assert.equal(r.ok, false);
    assert.ok(r.blocked?.blockingViolations.some((v) => v.ruleId === "required-phrases"));
  });
});
