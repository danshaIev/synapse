import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SQLiteGraphStore } from "../src/graph/sqlite-store.js";
import { tracesToIntent } from "../src/graph/traversal.js";

describe("SQLiteGraphStore", () => {
  it("persists nodes and edges with reachability", () => {
    const store = new SQLiteGraphStore();

    const intent = store.addNode({ type: "INTENT", content: "Build a thing" });
    const step = store.addNode({
      type: "STEP",
      scope: "code",
      content: "Write the function",
    });
    store.addEdge({ type: "SUPPORTS_GOAL", from: step.id, to: intent.id });

    assert.equal(store.allNodes().length, 2);
    assert.equal(store.allEdges().length, 1);
    assert.equal(tracesToIntent(store, step.id, intent.id), true);

    const orphan = store.addNode({
      type: "STEP",
      scope: "code",
      content: "Detached step",
    });
    assert.equal(tracesToIntent(store, orphan.id, intent.id), false);

    store.close();
  });

  it("survives reopen with same data", () => {
    const path = `/tmp/synapse-test-${Date.now()}.db`;
    const s1 = new SQLiteGraphStore({ path });
    s1.addNode({ type: "INTENT", content: "Persist me", id: "INTENT_main" });
    s1.close();

    const s2 = new SQLiteGraphStore({ path });
    const node = s2.getNode("INTENT_main");
    assert.equal(node?.content, "Persist me");
    s2.close();
  });
});
