export interface ModelProvider {
  id: string;
  label: string;
  costPerKToken: number;
  strengths: string[];
  call: (prompt: string, options?: ModelCallOptions) => Promise<ModelCallResult>;
}

export interface ModelCallOptions {
  maxTokens?: number;
  temperature?: number;
  metadata?: Record<string, unknown>;
}

export interface ModelCallResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface RouteRequest {
  scope: string;
  promptTokens: number;
  budgetUsd?: number;
  latencyBudgetMs?: number;
  preferStrengths?: string[];
}

export interface RouteDecision {
  provider: ModelProvider;
  reason: string;
  estimatedCostUsd: number;
}
