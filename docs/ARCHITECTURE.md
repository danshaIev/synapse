# Architecture

Synapse turns an agent's reasoning into a typed graph and enforces protocol rules against it. Five components.

## 1. Graph store

In-memory typed graph (`src/graph/store.ts`).

**Node types:** `INTENT`, `PLAN`, `STEP`, `TOOL_CALL`, `OBSERVATION`, `REASONING`, `RULE`.

**Edge types:** `DECOMPOSES_TO`, `CONTAINS`, `INVOKES`, `RETURNS`, `INFORMS`, `CONSTRAINED_BY`, `VIOLATES`, `DEPENDS_ON`, `SUPERSEDES`, `SUPPORTS_GOAL`.

The `SUPPORTS_GOAL` edge is the load-bearing one — every step must trace back to the root `INTENT` node, and drift detection is a graph reachability check.

A SQLite-backed store is on the roadmap for persistence across sessions.

## 2. Tracer

Wraps each agent step (`src/tracer/index.ts`). Every `synapse.step({...})` call:
1. Creates a `STEP` node
2. Adds a `SUPPORTS_GOAL` edge to the parent sub-goal or root intent
3. Emits typed events for the visualizer and decay tracker

## 3. Validator

Checks every proposed step before execution (`src/validator/index.ts`).

Two-phase check:
- **Drift detection:** does the step have a graph path back to `INTENT`? If no → block.
- **Rule check:** for every rule whose `scope` matches the step's scope, run its predicate. HARD violations block. SOFT violations log and trigger re-injection. INFO violations log only.

## 4. Decay tracker + projector

The decay tracker (`src/reinjector/index.ts`) records per-rule violation rate over a sliding window. When recent violation rate crosses the threshold, the rule is marked decaying.

The projector (`src/projector/index.ts`) builds the next-step context fragment:
- Original intent (always)
- Rules applicable to the current scope (decaying ones get extra emphasis)
- Recent steps and observations relevant to scope
- Failed attempts (so the agent doesn't repeat them)

## 5. Visualizer (basic)

A minimal HTTP server (`src/visualizer/server.ts`) that serves the graph as JSON and renders a live text view. The polished version (React + Cytoscape) is on the roadmap.

## Why this design

Three principles drove the architecture:

1. **External feedback is the only working fix for self-correction.** The validator is a separate process from the agent — it can catch what the agent rationalizes.
2. **Linear context is the wrong substrate.** The graph stores everything; the projector serves only the relevant subgraph.
3. **Rules must be enforced contracts, not suggestions.** Static text in CLAUDE.md decays. Predicate checks don't.
