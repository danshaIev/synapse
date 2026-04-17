import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Router, type ModelProvider } from "../src/router/index.js";

function fakeProvider(over: Partial<ModelProvider> = {}): ModelProvider {
  return {
    id: "fake",
    label: "Fake",
    costPerKToken: 0.01,
    strengths: [],
    call: async () => ({
      content: "ok",
      inputTokens: 100,
      outputTokens: 50,
      latencyMs: 100,
    }),
    ...over,
  };
}

describe("Router", () => {
  it("picks the only candidate when one provider is supplied", () => {
    const r = new Router([fakeProvider({ id: "a" })]);
    const d = r.decide({ scope: "test", promptTokens: 1000 });
    assert.equal(d.provider.id, "a");
  });

  it("respects scope preferences", () => {
    const r = new Router([
      fakeProvider({ id: "a" }),
      fakeProvider({ id: "b" }),
    ]);
    r.preferForScope("write_code", ["b"]);
    const d = r.decide({ scope: "write_code", promptTokens: 100 });
    assert.equal(d.provider.id, "b");
  });

  it("routes by strength match", () => {
    const r = new Router([
      fakeProvider({ id: "a", strengths: ["chat"] }),
      fakeProvider({ id: "b", strengths: ["code", "long-context"] }),
    ]);
    const d = r.decide({
      scope: "anything",
      promptTokens: 100,
      preferStrengths: ["code"],
    });
    assert.equal(d.provider.id, "b");
  });

  it("filters out providers that exceed budget", () => {
    const r = new Router([
      fakeProvider({ id: "expensive", costPerKToken: 1.0 }),
      fakeProvider({ id: "cheap", costPerKToken: 0.001 }),
    ]);
    const d = r.decide({
      scope: "x",
      promptTokens: 10000,
      budgetUsd: 0.05,
    });
    assert.equal(d.provider.id, "cheap");
  });

  it("tracks call stats and failures", async () => {
    let shouldFail = true;
    const r = new Router([
      fakeProvider({
        id: "flaky",
        call: async () => {
          if (shouldFail) throw new Error("boom");
          return { content: "ok", inputTokens: 1, outputTokens: 1, latencyMs: 1 };
        },
      }),
    ]);
    await assert.rejects(() => r.call({ scope: "x", promptTokens: 1 }, "hi"));
    shouldFail = false;
    await r.call({ scope: "x", promptTokens: 1 }, "hi");
    const stats = r.getStats();
    assert.equal(stats.flaky?.calls, 2);
    assert.equal(stats.flaky?.failures, 1);
  });
});
