# Synapse

**Cognition graph for LLM agents.** Define rules once. Watch your agent think. Stop nudging.

```bash
npm install @danshaiev/synapse
```

---

## The problem

You write a `CLAUDE.md` (or system prompt). Your agent follows the rules for 20 minutes. Then it drifts. You nudge. It corrects. It drifts again. You nudge again.

This isn't laziness. It's architecture. Multi-turn instruction following degrades **39% on average** across production LLMs. Static text in a system prompt has no enforcement mechanism — the model is *asked* to follow rules but never *checked*.

## What Synapse does

Synapse turns your agent's reasoning into a live **cognition graph** and treats your protocol rules as **first-class enforced contracts** rather than suggestions.

- **Protocol file** — define your rules once in `synapse.protocol.yaml` with priority levels and scope
- **Cognition graph** — every step, tool call, and observation becomes a typed node in a queryable graph
- **Drift detection** — pre-execution check that every proposed step traces back to the original intent (graph reachability, not LLM judgment)
- **Adaptive re-injection** — when a rule starts decaying, the projector boosts it in the next context fragment automatically
- **Visualizer** — Obsidian-style live graph view of your agent's reasoning at `localhost:3000`

## Quickstart

```ts
import { Synapse } from '@danshaiev/synapse';

const synapse = await Synapse.fromProtocolFile('./synapse.protocol.yaml');

const result = await synapse.step({
  scope: 'write_code',
  description: 'Add user authentication',
  action: async () => callYourLLM(synapse.projectContext()),
});
```

That's it. Synapse intercepts the step, validates against your protocol rules, blocks if violated, otherwise records it in the cognition graph and updates the projection for the next call.

## Protocol file

```yaml
intent:
  immutable: true
  text: "Build the noise-control wrapper described in spec.md"

rules:
  - id: ts-strict
    priority: HARD
    scope: ["write_code"]
    predicate: "no `any` types in TypeScript files"
    on_violation: block_and_revise

  - id: no-comments
    priority: SOFT
    scope: ["write_code"]
    predicate: "no inline comments unless explaining non-obvious WHY"
    on_violation: reinject_with_emphasis

  - id: mobile-separate
    priority: HARD
    scope: ["design_ui"]
    predicate: "UI work must produce both mobile and desktop variants"
    on_violation: block_and_revise
```

See [docs/PROTOCOL.md](./docs/PROTOCOL.md) for the full spec.

## Honest scope

Synapse is useful **today** for indie devs and small teams shipping agents. It will likely be partially absorbed by frontier model APIs in 12-24 months as the labs ship native context engineering and instruction adherence. That's fine. Use it now to ship better agents now.

It is **not**:
- A replacement for a real eval pipeline
- A guarantee of agent reliability (it addresses ~30% of why agents fail)
- A wrapper around any specific LLM provider — works with anything

It **is**:
- A drop-in TypeScript library for any agent loop
- An honest attempt to solve the rule-decay problem at the right abstraction level
- Open source, MIT, no telemetry, no hosted dependency

## What it's solving (and what it's not)

| Problem | Synapse helps? |
|---|---|
| Agent forgets CLAUDE.md rules over time | ✅ Yes (adaptive re-injection) |
| Agent drifts from original goal | ✅ Yes (graph reachability check) |
| Agent burns tokens on noise | ✅ Yes (projection only includes relevant subgraph) |
| Hard to debug what went wrong | ✅ Yes (visualizer + queryable graph) |
| Agent fails at multi-step planning | ⚠️ Partial (better at staying on plan, doesn't generate better plans) |
| Agent hallucinates tool params | ❌ No (use structured outputs) |
| Agent gets blocked by Cloudflare | ❌ No (different problem entirely) |

## Visualizer

```ts
import { Synapse } from "@danshaiev/synapse";
import { startVisualizer } from "@danshaiev/synapse/visualizer";

const synapse = await Synapse.fromProtocolFile("./synapse.protocol.yaml");
startVisualizer(synapse.getStore(), {
  port: 3000,
  decayingRules: () => synapse.getDecayingRules(),
});
```

Opens `localhost:3000` with a live Cytoscape graph of your agent's cognition. Color-coded: coral = intent, amber = rule, cyan = step, green = observation. Click any node to inspect. Sidebar surfaces stats and decaying rules in real time.

## Persistent storage (optional)

Default store is in-memory. For persistence across sessions, swap in `SQLiteGraphStore` (uses Node's built-in `node:sqlite`, requires Node 22.5+):

```ts
import { SQLiteGraphStore } from "@danshaiev/synapse/graph";

const store = new SQLiteGraphStore({ path: "./agent.db" });
```

## Step-level model router (optional)

Route each step to the right model based on cost, scope preference, and capability strengths:

```ts
import { Router } from "@danshaiev/synapse/router";

const router = new Router([
  { id: "claude", label: "Claude 4.7", costPerKToken: 0.015, strengths: ["code", "long-context"], call: async (p) => /* ... */ },
  { id: "gpt", label: "GPT-5", costPerKToken: 0.012, strengths: ["chat", "reasoning"], call: async (p) => /* ... */ },
  { id: "haiku", label: "Claude Haiku 4.5", costPerKToken: 0.001, strengths: ["fast", "routing"], call: async (p) => /* ... */ },
]);
router.preferForScope("write_code", ["claude"]);

const result = await router.call(
  { scope: "write_code", promptTokens: 4000, budgetUsd: 0.10 },
  context,
);
```

## Analytics — is it actually helping?

Every Synapse session records its own cognition graph, so you can ask it directly whether the protocol paid off:

```ts
const report = synapse.getAnalytics().report();
// {
//   steps:        { total, completed, blocked, failed, driftBlocks, ruleBlocks },
//   rules:        [{ id, violations, evaluations, firstHalfRate, secondHalfRate,
//                    trajectory, currentlyDecaying, dead }, ...],
//   scopes:       [{ scope, steps, blocked, completed }, ...],
//   driftBlockRate, ruleEnforcementRate, interventionsPerStep,
//   reinjectionImpact, deadRuleCount,
// }

console.log(synapse.getAnalytics().summary());
```

Key signals:
- **`driftBlockRate`** — drift-blocked steps / total. This is the raw "stopped the agent from wandering" number.
- **`ruleEnforcementRate`** — `1 - violations/evaluations` across all rules. How often the agent is in-policy.
- **`reinjectionImpact`** — average Δ (first-half violation rate − second-half) across rules with history. Positive = reinjection is recovering decaying rules. Negative = decay is winning.
- **`rules[].trajectory`** — `improving` / `worsening` / `stable` per rule. Spot which specific rules are decaying even with reinjection.
- **`deadRuleCount`** — rules that never fired. Dead weight in your protocol.

## Architecture

```
your agent loop
      │
      ▼
[ TRACER ]  ← intercepts every step, emits typed graph events
      │
      ▼
[ GRAPH STORE ] ← in-memory by default, SQLite optional
      │
      ├─→ [ VALIDATOR ] ← before each step, checks rules + drift
      │         │
      │         └─→ blocks violations, revises, OR allows
      │
      ├─→ [ PROJECTOR ] ← turns relevant subgraph into compact context
      │
      └─→ [ VISUALIZER ] ← live web UI at localhost:3000
```

## Status

**v0.1 — early but working.** Core flow ships. API may shift. Use it. File issues. PRs welcome.

Roadmap:
- [x] Protocol file format + parser
- [x] Cognition graph (in-memory)
- [x] Drift detection via reachability
- [x] Adaptive rule re-injection
- [x] Projector with scope-aware context fragments
- [x] SQLite persistent store (uses `node:sqlite`, no native deps)
- [x] Cytoscape-based live visualizer with dark mode
- [x] Step-level model router with cost/strength/scope routing
- [x] Session analytics (drift rate, rule trajectory, reinjection impact)
- [ ] LLMLingua-2 compression integration (Python bridge)
- [ ] LoRA adapter recipe (separate repo)
- [ ] Hosted sidecar proxy mode

## License

MIT. Use it however you want.

## Author

Built by [Dan Shalev](https://github.com/danshaIev).
