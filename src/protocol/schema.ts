import { z } from "zod";

export const PrioritySchema = z.enum(["HARD", "SOFT", "INFO"]);

export const ViolationActionSchema = z.enum([
  "block_and_revise",
  "reinject_with_emphasis",
  "log_only",
]);

export const IntentSchema = z.object({
  text: z.string().min(1),
  immutable: z.boolean().default(true),
});

export const RuleSchema = z.object({
  id: z.string().min(1),
  priority: PrioritySchema,
  scope: z.array(z.string()).min(1),
  predicate: z.string().min(1),
  on_violation: ViolationActionSchema,
});

export const DecompositionPatternSchema = z.object({
  intent: z.string(),
  required_steps: z.array(z.string()),
});

export const ProtocolSchema = z.object({
  intent: IntentSchema,
  rules: z.array(RuleSchema),
  decomposition_patterns: z.array(DecompositionPatternSchema).optional(),
});

export type ProtocolInput = z.infer<typeof ProtocolSchema>;
