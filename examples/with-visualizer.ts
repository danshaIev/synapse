import { Synapse } from "../src/index.js";
import { startVisualizer } from "../src/visualizer/server.js";

async function main() {
  const synapse = await Synapse.fromProtocolFile(
    new URL("./synapse.protocol.yaml", import.meta.url).pathname,
  );

  startVisualizer(synapse.getStore(), {
    port: 3000,
    title: "Synapse — Customer Support Demo",
    decayingRules: () => synapse.getDecayingRules(),
  });

  console.log("Open http://localhost:3000\n");

  const sequence = [
    {
      scope: "lookup_account",
      description: "Pull account 12345",
      content: "name: Jane Doe, plan: pro, balance: $42 overdue",
    },
    {
      scope: "draft_response",
      description: "Polite response with policy reference",
      content: "Hi Jane, your $42 balance is overdue. policy: pay within 14 days.",
    },
    {
      scope: "draft_response",
      description: "Refund guarantee response",
      content: "Hi Jane, we guarantee a refund within 24h. policy: prompt processing.",
    },
    {
      scope: "draft_response",
      description: "Response missing policy",
      content: "Hi Jane, please pay your balance soon.",
    },
    {
      scope: "draft_response",
      description: "Another guarantee response",
      content: "I guarantee this will be resolved today. policy: same-day handling.",
    },
    {
      scope: "draft_response",
      description: "Compliant follow-up",
      content: "Following up — policy: payment due within 14 days. Reply if you need help.",
    },
  ];

  for (const s of sequence) {
    await new Promise((r) => setTimeout(r, 1500));
    const result = await synapse.step({
      scope: s.scope,
      description: s.description,
      metadata: { content: s.content },
      action: async () => s.content,
    });
    const status = result.ok
      ? "ALLOWED"
      : `BLOCKED (${result.blocked?.blockingViolations.map((v) => v.ruleId).join(", ")})`;
    console.log(`${status} — ${s.description}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
