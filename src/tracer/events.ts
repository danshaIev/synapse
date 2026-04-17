export interface StepEvent {
  type: "step.proposed" | "step.allowed" | "step.blocked" | "step.completed" | "step.failed";
  stepId: string;
  scope: string;
  description: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ObservationEvent {
  type: "observation.recorded";
  observationId: string;
  fromStepId: string;
  content: string;
  timestamp: number;
}

export interface RuleEvent {
  type: "rule.violated" | "rule.respected";
  ruleId: string;
  stepId: string;
  timestamp: number;
}

export type SynapseEvent = StepEvent | ObservationEvent | RuleEvent;

export type EventListener = (event: SynapseEvent) => void;
