import type { Protocol, Rule } from "./protocol/types.js";

export interface DefaultProtocolOptions {
  goal: string;
  /**
   * Phrases the agent should avoid in output (case-insensitive substring match).
   * Defaults catch common AI slop ("as an AI", "I cannot", "certainly!", etc).
   */
  avoidPhrases?: string[];
  /**
   * Phrases the agent MUST include in output. Useful for forcing citations,
   * required disclaimers, or structured tags.
   */
  requirePhrases?: string[];
  /**
   * Hard cap on output length (characters). Default 8000.
   */
  maxOutputChars?: number;
  /**
   * Additional custom rules to merge in.
   */
  extraRules?: Rule[];
}

const AI_SLOP_PHRASES = [
  "as an ai",
  "as a language model",
  "i cannot",
  "i'm sorry, but i",
  "certainly!",
  "great question",
  "i hope this helps",
  "let me know if",
];

export function defaultProtocol(options: DefaultProtocolOptions): Protocol {
  const avoidPhrases = options.avoidPhrases ?? AI_SLOP_PHRASES;
  const requirePhrases = options.requirePhrases ?? [];
  const maxChars = options.maxOutputChars ?? 8000;

  const rules: Rule[] = [
    {
      id: "no-ai-slop",
      priority: "SOFT",
      scope: ["*"],
      predicate: (ctx) => {
        const text = (ctx.content ?? "").toLowerCase();
        return !avoidPhrases.some((p) => text.includes(p.toLowerCase()));
      },
      on_violation: "reinject_with_emphasis",
    },
    {
      id: "output-length",
      priority: "SOFT",
      scope: ["*"],
      predicate: (ctx) => (ctx.content ?? "").length <= maxChars,
      on_violation: "reinject_with_emphasis",
    },
    {
      id: "non-empty-output",
      priority: "HARD",
      scope: ["*"],
      predicate: (ctx) => (ctx.content ?? "").trim().length > 0,
      on_violation: "block_and_revise",
    },
  ];

  if (requirePhrases.length > 0) {
    rules.push({
      id: "required-phrases",
      priority: "HARD",
      scope: ["*"],
      predicate: (ctx) => {
        const text = (ctx.content ?? "").toLowerCase();
        return requirePhrases.every((p) => text.includes(p.toLowerCase()));
      },
      on_violation: "block_and_revise",
    });
  }

  if (options.extraRules) rules.push(...options.extraRules);

  return {
    intent: { text: options.goal, immutable: true },
    rules,
  };
}
