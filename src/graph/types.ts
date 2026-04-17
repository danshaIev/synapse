export type NodeType =
  | "INTENT"
  | "PLAN"
  | "STEP"
  | "TOOL_CALL"
  | "OBSERVATION"
  | "REASONING"
  | "RULE";

export type EdgeType =
  | "DECOMPOSES_TO"
  | "CONTAINS"
  | "INVOKES"
  | "RETURNS"
  | "INFORMS"
  | "CONSTRAINED_BY"
  | "VIOLATES"
  | "DEPENDS_ON"
  | "SUPERSEDES"
  | "SUPPORTS_GOAL";

export interface GraphNode {
  id: string;
  type: NodeType;
  scope?: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export interface GraphEdge {
  id: string;
  type: EdgeType;
  from: string;
  to: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}
