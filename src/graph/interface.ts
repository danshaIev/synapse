import type { EdgeType, GraphEdge, GraphNode, NodeType } from "./types.js";

export interface GraphStoreAPI {
  addNode(input: {
    type: NodeType;
    content: string;
    scope?: string;
    metadata?: Record<string, unknown>;
    id?: string;
  }): GraphNode;
  addEdge(input: {
    type: EdgeType;
    from: string;
    to: string;
    metadata?: Record<string, unknown>;
  }): GraphEdge;
  getNode(id: string): GraphNode | undefined;
  getNodesByType(type: NodeType): GraphNode[];
  getEdgesFrom(nodeId: string, type?: EdgeType): GraphEdge[];
  getEdgesTo(nodeId: string, type?: EdgeType): GraphEdge[];
  allNodes(): GraphNode[];
  allEdges(): GraphEdge[];
  toJSON(): { nodes: GraphNode[]; edges: GraphEdge[] };
}
