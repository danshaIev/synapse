import type { GraphStoreAPI } from "../graph/interface.js";
import type { GraphNode } from "../graph/types.js";
import type { EventListener, SynapseEvent } from "./events.js";

export class Tracer {
  private listeners: EventListener[] = [];

  constructor(private store: GraphStoreAPI) {}

  on(listener: EventListener): void {
    this.listeners.push(listener);
  }

  emit(event: SynapseEvent): void {
    for (const l of this.listeners) l(event);
  }

  recordStep(input: {
    scope: string;
    description: string;
    parentSubGoalId?: string;
    intentId: string;
    metadata?: Record<string, unknown>;
  }): GraphNode {
    const node = this.store.addNode({
      type: "STEP",
      scope: input.scope,
      content: input.description,
      metadata: input.metadata ?? {},
    });
    this.store.addEdge({
      type: "SUPPORTS_GOAL",
      from: node.id,
      to: input.parentSubGoalId ?? input.intentId,
    });
    this.emit({
      type: "step.proposed",
      stepId: node.id,
      scope: input.scope,
      description: input.description,
      timestamp: node.createdAt,
    });
    return node;
  }

  markStepAllowed(stepId: string, scope: string, description: string): void {
    this.emit({
      type: "step.allowed",
      stepId,
      scope,
      description,
      timestamp: Date.now(),
    });
  }

  markStepBlocked(
    stepId: string,
    scope: string,
    description: string,
    metadata: Record<string, unknown>,
  ): void {
    const node = this.store.getNode(stepId);
    if (node) {
      node.metadata["blocked"] = true;
      for (const [k, v] of Object.entries(metadata)) {
        node.metadata[k] = v;
      }
    }
    this.emit({
      type: "step.blocked",
      stepId,
      scope,
      description,
      timestamp: Date.now(),
      metadata,
    });
  }

  markStepCompleted(stepId: string, scope: string, description: string): void {
    this.emit({
      type: "step.completed",
      stepId,
      scope,
      description,
      timestamp: Date.now(),
    });
  }

  markStepFailed(
    stepId: string,
    scope: string,
    description: string,
    reason: string,
  ): void {
    const node = this.store.getNode(stepId);
    if (node) {
      node.metadata["failed"] = true;
      node.metadata["failureReason"] = reason;
    }
    this.emit({
      type: "step.failed",
      stepId,
      scope,
      description,
      timestamp: Date.now(),
      metadata: { reason },
    });
  }

  recordObservation(input: { fromStepId: string; content: string }): GraphNode {
    const node = this.store.addNode({
      type: "OBSERVATION",
      content: input.content,
    });
    this.store.addEdge({
      type: "RETURNS",
      from: input.fromStepId,
      to: node.id,
    });
    this.emit({
      type: "observation.recorded",
      observationId: node.id,
      fromStepId: input.fromStepId,
      content: input.content,
      timestamp: node.createdAt,
    });
    return node;
  }
}

export * from "./events.js";
