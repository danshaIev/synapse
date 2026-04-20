/**
 * The minimum viable Synapse integration.
 *
 *   1. Wrap your LLM call with `enhance()`
 *   2. Give it a goal
 *   3. Done — Synapse validates every response, retries on violations,
 *      and tracks how often it had to intervene
 */
import { enhance } from "../src/index.js";

// Your existing LLM call — any function that takes a prompt and returns a
// string. Anthropic SDK, OpenAI SDK, fetch wrapper, local model — whatever.
const callLLM = async (prompt: string): Promise<string> => {
  // Replace with real API call. This fake one simulates occasional AI slop.
  if (Math.random() < 0.3) return "As an AI language model, I cannot help.";
  return `Response to: ${prompt.slice(-80)}`;
};

async function main() {
  const agent = enhance(callLLM, {
    goal: "Help the user ship a landing page",
    // Optional: customize the default protocol
    defaults: {
      goal: "Help the user ship a landing page",
      requirePhrases: [], // e.g. ["[citation]"] to force sourcing
      maxOutputChars: 4000,
    },
  });

  for (const prompt of [
    "Outline a hero section",
    "Suggest a call-to-action",
    "Draft copy for the pricing page",
  ]) {
    const out = await agent(prompt);
    console.log(`\n▸ ${prompt}\n  ${out}`);
  }

  console.log("\n" + agent.synapse.getAnalytics().summary());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
