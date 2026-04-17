import type { PredicateContext, Rule } from "../protocol/types.js";

export type PredicateFn = (ctx: PredicateContext) => boolean | Promise<boolean>;

const TEXT_RULE_HANDLERS: Array<{
  match: RegExp;
  build: (m: RegExpMatchArray) => PredicateFn;
}> = [
  {
    match: /^no\s+`?([^`]+?)`?\s+(?:types|usage)/i,
    build: (m) => (ctx) => !(ctx.content ?? "").includes(m[1]!),
  },
  {
    match: /^must\s+include\s+`?([^`]+?)`?$/i,
    build: (m) => (ctx) => (ctx.content ?? "").includes(m[1]!),
  },
  {
    match: /^must\s+not\s+exceed\s+(\d+)\s+(?:tokens|chars|characters)/i,
    build: (m) => (ctx) => (ctx.content ?? "").length <= Number(m[1]),
  },
];

export function compilePredicate(rule: Rule): PredicateFn {
  if (typeof rule.predicate === "function") return rule.predicate;
  const text = rule.predicate.trim();
  for (const handler of TEXT_RULE_HANDLERS) {
    const match = text.match(handler.match);
    if (match) return handler.build(match);
  }
  return defaultPredicate(text);
}

function defaultPredicate(text: string): PredicateFn {
  return (ctx) => {
    const description = `${ctx.description} ${ctx.content ?? ""}`.toLowerCase();
    const negativeMarkers = ["don't", "do not", "never", "no ", "avoid"];
    const isNegative = negativeMarkers.some((m) => text.toLowerCase().startsWith(m));
    const hit = description.includes(text.toLowerCase().replace(/^[a-z\s]+/, ""));
    return isNegative ? !hit : true;
  };
}
