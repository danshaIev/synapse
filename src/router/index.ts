import type {
  ModelCallOptions,
  ModelCallResult,
  ModelProvider,
  RouteDecision,
  RouteRequest,
} from "./types.js";

interface ProviderStats {
  calls: number;
  failures: number;
  totalLatencyMs: number;
  totalCostUsd: number;
}

export class Router {
  private stats = new Map<string, ProviderStats>();
  private scopePreferences = new Map<string, string[]>();

  constructor(private providers: ModelProvider[]) {
    if (providers.length === 0) throw new Error("Router needs at least one provider");
    for (const p of providers) this.stats.set(p.id, blankStats());
  }

  preferForScope(scope: string, providerIds: string[]): void {
    this.scopePreferences.set(scope, providerIds);
  }

  decide(req: RouteRequest): RouteDecision {
    const candidates = this.providers.filter((p) => this.budgetAllows(p, req));
    if (candidates.length === 0) {
      throw new Error(
        `No provider fits budget for scope "${req.scope}" with ${req.promptTokens} tokens.`,
      );
    }

    const scoped = this.scopePreferences.get(req.scope);
    if (scoped) {
      const preferred = candidates.find((c) => scoped.includes(c.id));
      if (preferred) {
        return {
          provider: preferred,
          reason: `scope preference: ${req.scope}`,
          estimatedCostUsd: this.estimateCost(preferred, req.promptTokens),
        };
      }
    }

    if (req.preferStrengths?.length) {
      const matched = candidates
        .map((c) => ({
          provider: c,
          score: c.strengths.filter((s) => req.preferStrengths!.includes(s)).length,
        }))
        .filter((m) => m.score > 0)
        .sort((a, b) => b.score - a.score);
      if (matched.length > 0) {
        const winner = matched[0]!.provider;
        return {
          provider: winner,
          reason: `strength match: ${req.preferStrengths!.join(",")}`,
          estimatedCostUsd: this.estimateCost(winner, req.promptTokens),
        };
      }
    }

    const ranked = candidates
      .map((p) => ({
        provider: p,
        score: this.reliabilityScore(p) - this.estimateCost(p, req.promptTokens) * 100,
      }))
      .sort((a, b) => b.score - a.score);
    const winner = ranked[0]!.provider;
    return {
      provider: winner,
      reason: "best reliability/cost tradeoff",
      estimatedCostUsd: this.estimateCost(winner, req.promptTokens),
    };
  }

  async call(
    req: RouteRequest,
    prompt: string,
    options?: ModelCallOptions,
  ): Promise<ModelCallResult & { providerId: string; reason: string }> {
    const decision = this.decide(req);
    const stat = this.stats.get(decision.provider.id)!;
    stat.calls += 1;
    try {
      const result = await decision.provider.call(prompt, options);
      stat.totalLatencyMs += result.latencyMs;
      stat.totalCostUsd += this.estimateCost(decision.provider, result.inputTokens);
      return { ...result, providerId: decision.provider.id, reason: decision.reason };
    } catch (err) {
      stat.failures += 1;
      throw err;
    }
  }

  getStats(): Record<string, ProviderStats> {
    return Object.fromEntries(this.stats.entries());
  }

  private budgetAllows(p: ModelProvider, req: RouteRequest): boolean {
    if (req.budgetUsd === undefined) return true;
    return this.estimateCost(p, req.promptTokens) <= req.budgetUsd;
  }

  private estimateCost(p: ModelProvider, promptTokens: number): number {
    return (p.costPerKToken * promptTokens) / 1000;
  }

  private reliabilityScore(p: ModelProvider): number {
    const s = this.stats.get(p.id)!;
    if (s.calls === 0) return 0.5;
    return 1 - s.failures / s.calls;
  }
}

function blankStats(): ProviderStats {
  return { calls: 0, failures: 0, totalLatencyMs: 0, totalCostUsd: 0 };
}

export * from "./types.js";
