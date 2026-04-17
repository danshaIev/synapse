export type Priority = "HARD" | "SOFT" | "INFO";

export type ViolationAction =
  | "block_and_revise"
  | "reinject_with_emphasis"
  | "log_only";

export interface Intent {
  text: string;
  immutable: boolean;
}

export interface Rule {
  id: string;
  priority: Priority;
  scope: string[];
  predicate: string | ((ctx: PredicateContext) => boolean | Promise<boolean>);
  on_violation: ViolationAction;
}

export interface PredicateContext {
  scope: string;
  description: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface DecompositionPattern {
  intent: string;
  required_steps: string[];
}

export interface Protocol {
  intent: Intent;
  rules: Rule[];
  decomposition_patterns?: DecompositionPattern[];
}
