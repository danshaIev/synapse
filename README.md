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

```bash
npm run viz
```

Opens `localhost:3000` with a live graph view of your agent's cognition. Color-coded: green = on-goal, yellow = applicable rule, red = blocked step.

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

**v0.1 — early.** Core flow works. API may shift. Use it. File issues. PRs welcome.

Roadmap:
- [x] Protocol file format + parser
- [x] Cognition graph (in-memory)
- [x] Drift detection via reachability
- [x] Adaptive rule re-injection
- [x] Basic projector
- [ ] LLMLingua-2 compression integration
- [ ] SQLite persistent store
- [ ] Visualizer (React + Cytoscape)
- [ ] Step-level model router
- [ ] LoRA adapter recipe (separate repo)

## License

MIT. Use it however you want.

## Author

Built by [Dan Shalev](https://github.com/danshaIev).
