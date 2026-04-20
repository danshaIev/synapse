import { randomUUID } from "node:crypto";
import type { EdgeType, GraphEdge, GraphNode, NodeType } from "./types.js";

export class GraphStore {
  private nodes = new Map<string, GraphNode>();
  private edges = new Map<string, GraphEdge>();
  private outgoing = new Map<string, Set<string>>();
  private incoming = new Map<string, Set<string>>();

  addNode(input: {
    type: NodeType;
    content: string;
    scope?: string;
    metadata?: Record<string, unknown>;
    id?: string;
  }): GraphNode {
    const id = input.id ?? `${input.type}_${randomUUID().slice(0, 8)}`;
    const node: GraphNode = {
      id,
      type: input.type,
      scope: input.scope,
      content: input.content,
      metadata: input.metadata ?? {},
      createdAt: Date.now(),
    };
    this.nodes.set(id, node);
    this.outgoing.set(id, new Set());
    this.incoming.set(id, new Set());
    return node;
  }

  addEdge(input: {
    type: EdgeType;
    from: string;
    to: string;
    metadata?: Record<string, unknown>;
  }): GraphEdge {
    if (!this.nodes.has(input.from)) {
      throw new Error(`Edge from-node missing: ${input.from}`);
    }
    if (!this.nodes.has(input.to)) {
      throw new Error(`Edge to-node missing: ${input.to}`);
    }
    const id = `edge_${randomUUID().slice(0, 8)}`;
    const edge: GraphEdge = {
      id,
      type: input.type,
      from: input.from,
      to: input.to,
      metadata: input.metadata,
      createdAt: Date.now(),
    };
    this.edges.set(id, edge);
    this.outgoing.get(input.from)!.add(id);
    this.incoming.get(input.to)!.add(id);
    return edge;
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  getNodesByType(type: NodeType): GraphNode[] {
    return [...this.nodes.values()]
      .filter((n) => n.type === type)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  getEdgesFrom(nodeId: string, type?: EdgeType): GraphEdge[] {
    const edgeIds = this.outgoing.get(nodeId) ?? new Set();
    const edges = [...edgeIds].map((id) => this.edges.get(id)!);
    return type ? edges.filter((e) => e.type === type) : edges;
  }

  getEdgesTo(nodeId: string, type?: EdgeType): GraphEdge[] {
    const edgeIds = this.incoming.get(nodeId) ?? new Set();
    const edges = [...edgeIds].map((id) => this.edges.get(id)!);
    return type ? edges.filter((e) => e.type === type) : edges;
  }

  allNodes(): GraphNode[] {
    return [...this.nodes.values()];
  }

  allEdges(): GraphEdge[] {
    return [...this.edges.values()];
  }

  toJSON() {
    return {
      nodes: this.allNodes(),
      edges: this.allEdges(),
    };
  }
}
