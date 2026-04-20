import { Synapse, type SynapseOptions } from "./index.js";
import type { DefaultProtocolOptions } from "./defaults.js";
import type { Protocol } from "./protocol/types.js";

export type LLMFn = (prompt: string) => Promise<string>;

export interface EnhanceOptions extends SynapseOptions {
  /**
   * Either a goal string (shortcut for default protocol) or a full Protocol
   * object, or DefaultProtocolOptions for configured defaults.
   */
  goal?: string;
  protocol?: Protocol;
  defaults?: DefaultProtocolOptions;
  maxRetries?: number;
  /**
   * Derive a scope string from the prompt. Default returns "default".
   * Scopes let you apply different rules to different kinds of calls.
   */
  inferScope?: (prompt: string) => string;
  /**
   * How to merge Synapse context into your prompt. Default prepends
   * the context followed by a newline, then the user prompt.
   */
  compose?: (context: string, prompt: string) => string;
}

export interface EnhancedLLM {
  (prompt: string): Promise<string>;
  synapse: Synapse;
}

/**
 * Drop-in wrapper that supervises any `(prompt) => Promise<string>` LLM
 * with Synapse. Validates every response, re-injects rule violations as
 * retry feedback, and exposes analytics.
 *
 *   const smart = enhance(llm, { goal: "build a landing page" });
 *   const answer = await smart("add a hero section");
 *   console.log(smart.synapse.getAnalytics().summary());
 */
export function enhance(llm: LLMFn, options: EnhanceOptions = {}): EnhancedLLM {
  const synapse =
    options.protocol !== undefined
      ? new Synapse(options.protocol, options)
      : options.defaults !== undefined
      ? Synapse.withDefaults(options.defaults, options)
      : Synapse.withDefaults(
          { goal: options.goal ?? "Assist the user correctly and concisely." },
          options,
        );

  const inferScope = options.inferScope ?? (() => "default");
  const compose =
    options.compose ?? ((ctx: string, p: string) => `${ctx}\n\n${p}`);
  const maxRetries = options.maxRetries ?? 2;

  const fn = (async (prompt: string): Promise<string> => {
    const scope = inferScope(prompt);
    const result = await synapse.run({
      scope,
      description: prompt.slice(0, 120),
      maxRetries,
      call: (ctx) => llm(compose(ctx, prompt)),
    });
    return result.value;
  }) as EnhancedLLM;

  fn.synapse = synapse;
  return fn;
}
