# Protocol File Specification

The `synapse.protocol.yaml` file defines your agent's enforced contract: the immutable goal, the rules with priority and scope, and the decomposition patterns.

## Top-level structure

```yaml
intent:        # required — the agent's frozen goal
rules:         # required — list of enforced constraints
decomposition_patterns:  # optional — common task templates
```

## `intent`

The user's goal. Set once at session start. Cannot be mutated mid-session.

```yaml
intent:
  immutable: true
  text: "Build the customer support agent that resolves billing issues"
```

## `rules`

Each rule has five fields:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier. Used in violation messages and telemetry. |
| `priority` | enum | `HARD`, `SOFT`, or `INFO`. |
| `scope` | string[] | Step scopes this rule applies to. Multiple values = applies to any. |
| `predicate` | string | Natural-language constraint. Parsed into a checker function. |
| `on_violation` | enum | `block_and_revise`, `reinject_with_emphasis`, or `log_only`. |

### Priority levels

- **HARD** — execution is blocked. Agent must revise the proposed step before continuing.
- **SOFT** — execution proceeds, but the rule is re-injected with extra emphasis on the next step.
- **INFO** — logged for telemetry only. No agent-facing impact.

### Scope

`scope` is a free-form string that the developer assigns to each agent step. Common conventions:

- `write_code`, `read_code`, `refactor_code`
- `draft_response`, `send_response`
- `lookup_account`, `update_record`
- `web_search`, `web_fetch`
- `external_facing_writing`, `internal_writing`

Pick scopes that match the natural surfaces of your agent's work.

### Predicate forms

The v0.1 predicate parser supports:

- `no \`X\` types` — content must not contain `X`
- `no \`X\` usage` — content must not contain `X`
- `must include \`X\`` — content must contain `X`
- `must not exceed N tokens` — length cap
- `must not exceed N chars` — length cap

For anything more complex, pass a JavaScript function via the programmatic API (see `src/index.ts`).

## `decomposition_patterns` (optional)

Templates for common multi-step intents. The validator can verify that the agent followed the required step sequence for a given intent type.

```yaml
decomposition_patterns:
  - intent: "resolve billing issue"
    required_steps:
      - "lookup_account"
      - "diagnose_issue"
      - "draft_response"
      - "send_response"
```

## Best practices

1. **HARD rules are predicates with clear failure modes.** If you can't write a checker for it, don't make it HARD.
2. **Soft rules cover style and norms.** "No comments unless WHY" is a SOFT rule because the agent should respect it but compliance is qualitative.
3. **Scope rules narrowly.** Rules that fire on every scope create noise and erode signal.
4. **Keep CLAUDE.md for voice and identity.** Use Synapse for enforceable contracts.
