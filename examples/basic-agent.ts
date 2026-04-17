import { Synapse } from "../src/index.js";

async function main() {
  const synapse = await Synapse.fromProtocolFile(
    new URL("./synapse.protocol.yaml", import.meta.url).pathname,
  );

  synapse.on((event) => {
    const tag =
      event.type === "step.blocked"
        ? "🛑"
        : event.type === "step.allowed"
        ? "✓"
        : event.type === "step.completed"
        ? "✔"
        : event.type === "step.failed"
        ? "✗"
        : "·";
    console.log(`${tag} ${event.type} — ${"description" in event ? event.description : ""}`);
  });

  const lookup = await synapse.step({
    scope: "lookup_account",
    description: "Pull account details for user 12345",
    metadata: { content: "name: Jane Doe, plan: pro, balance: $42 overdue" },
    action: async () => "name: Jane Doe, plan: pro, balance: $42 overdue",
  });
  console.log(" → result:", lookup.value);

  const goodResponse = await synapse.step({
    scope: "draft_response",
    description: "Draft polite response with policy reference",
    metadata: {
      content:
        "Hi Jane, your account shows a $42 overdue balance. policy: full payment due within 14 days.",
    },
    action: async () =>
      "Hi Jane, your account shows a $42 overdue balance. policy: full payment due within 14 days.",
  });
  console.log(" → ok:", goodResponse.ok);

  const badResponse = await synapse.step({
    scope: "draft_response",
    description: "Draft response promising a refund guarantee",
    metadata: {
      content:
        "Hi Jane, we guarantee a full refund within 24 hours. policy: refunds processed promptly.",
    },
    action: async () =>
      "Hi Jane, we guarantee a full refund within 24 hours. policy: refunds processed promptly.",
  });
  console.log(" → ok:", badResponse.ok, "blocked:", badResponse.blocked?.blockingViolations.map((v) => v.ruleId));

  const missingPolicy = await synapse.step({
    scope: "draft_response",
    description: "Draft response without policy citation",
    metadata: { content: "Hi Jane, please pay your balance soon." },
    action: async () => "Hi Jane, please pay your balance soon.",
  });
  console.log(
    " → ok:",
    missingPolicy.ok,
    "blocked:",
    missingPolicy.blocked?.blockingViolations.map((v) => v.ruleId),
  );

  console.log("\n--- PROJECTED CONTEXT for next draft_response step ---");
  console.log(synapse.projectContext("draft_response"));

  console.log("\n--- STATS ---");
  console.log(JSON.stringify(synapse.getStats(), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
