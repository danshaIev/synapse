import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { EdgeType, GraphEdge, GraphNode, NodeType } from "./types.js";

export interface SQLiteOptions {
  path?: string;
}

export class SQLiteGraphStore {
  private db: DatabaseSync;
  private stmts!: {
    insertNode: ReturnType<DatabaseSync["prepare"]>;
    insertEdge: ReturnType<DatabaseSync["prepare"]>;
    getNode: ReturnType<DatabaseSync["prepare"]>;
    nodesByType: ReturnType<DatabaseSync["prepare"]>;
    edgesFromAll: ReturnType<DatabaseSync["prepare"]>;
    edgesFromTyped: ReturnType<DatabaseSync["prepare"]>;
    edgesToAll: ReturnType<DatabaseSync["prepare"]>;
    edgesToTyped: ReturnType<DatabaseSync["prepare"]>;
    allNodes: ReturnType<DatabaseSync["prepare"]>;
    allEdges: ReturnType<DatabaseSync["prepare"]>;
    nodeExists: ReturnType<DatabaseSync["prepare"]>;
  };

  constructor(options: SQLiteOptions = {}) {
    this.db = new DatabaseSync(options.path ?? ":memory:");
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        scope TEXT,
        content TEXT NOT NULL,
        metadata TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        from_id TEXT NOT NULL REFERENCES nodes(id),
        to_id TEXT NOT NULL REFERENCES nodes(id),
        metadata TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
      CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
      CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
    `);
    this.stmts = {
      insertNode: this.db.prepare(
        "INSERT INTO nodes (id,type,scope,content,metadata,created_at) VALUES (?,?,?,?,?,?)",
      ),
      insertEdge: this.db.prepare(
        "INSERT INTO edges (id,type,from_id,to_id,metadata,created_at) VALUES (?,?,?,?,?,?)",
      ),
      getNode: this.db.prepare("SELECT * FROM nodes WHERE id=?"),
      nodesByType: this.db.prepare(
        "SELECT * FROM nodes WHERE type=? ORDER BY created_at",
      ),
      edgesFromAll: this.db.prepare(
        "SELECT * FROM edges WHERE from_id=? ORDER BY created_at",
      ),
      edgesFromTyped: this.db.prepare(
        "SELECT * FROM edges WHERE from_id=? AND type=? ORDER BY created_at",
      ),
      edgesToAll: this.db.prepare(
        "SELECT * FROM edges WHERE to_id=? ORDER BY created_at",
      ),
      edgesToTyped: this.db.prepare(
        "SELECT * FROM edges WHERE to_id=? AND type=? ORDER BY created_at",
      ),
      allNodes: this.db.prepare("SELECT * FROM nodes ORDER BY created_at"),
      allEdges: this.db.prepare("SELECT * FROM edges ORDER BY created_at"),
      nodeExists: this.db.prepare("SELECT 1 FROM nodes WHERE id=?"),
    };
  }

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
    this.stmts.insertNode.run(
      node.id,
      node.type,
      node.scope ?? null,
      node.content,
      JSON.stringify(node.metadata),
      node.createdAt,
    );
    return node;
  }

  addEdge(input: {
    type: EdgeType;
    from: string;
    to: string;
    metadata?: Record<string, unknown>;
  }): GraphEdge {
    if (!this.stmts.nodeExists.get(input.from)) {
      throw new Error(`Edge from-node missing: ${input.from}`);
    }
    if (!this.stmts.nodeExists.get(input.to)) {
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
    this.stmts.insertEdge.run(
      edge.id,
      edge.type,
      edge.from,
      edge.to,
      edge.metadata ? JSON.stringify(edge.metadata) : null,
      edge.createdAt,
    );
    return edge;
  }

  getNode(id: string): GraphNode | undefined {
    const row = this.stmts.getNode.get(id) as RawNode | undefined;
    return row ? rowToNode(row) : undefined;
  }

  getNodesByType(type: NodeType): GraphNode[] {
    const rows = this.stmts.nodesByType.all(type) as unknown as RawNode[];
    return rows.map(rowToNode);
  }

  getEdgesFrom(nodeId: string, type?: EdgeType): GraphEdge[] {
    const rows = (
      type
        ? this.stmts.edgesFromTyped.all(nodeId, type)
        : this.stmts.edgesFromAll.all(nodeId)
    ) as unknown as RawEdge[];
    return rows.map(rowToEdge);
  }

  getEdgesTo(nodeId: string, type?: EdgeType): GraphEdge[] {
    const rows = (
      type
        ? this.stmts.edgesToTyped.all(nodeId, type)
        : this.stmts.edgesToAll.all(nodeId)
    ) as unknown as RawEdge[];
    return rows.map(rowToEdge);
  }

  allNodes(): GraphNode[] {
    return (this.stmts.allNodes.all() as unknown as RawNode[]).map(rowToNode);
  }

  allEdges(): GraphEdge[] {
    return (this.stmts.allEdges.all() as unknown as RawEdge[]).map(rowToEdge);
  }

  toJSON() {
    return { nodes: this.allNodes(), edges: this.allEdges() };
  }

  close(): void {
    this.db.close();
  }
}

interface RawNode {
  id: string;
  type: string;
  scope: string | null;
  content: string;
  metadata: string;
  created_at: number;
}

interface RawEdge {
  id: string;
  type: string;
  from_id: string;
  to_id: string;
  metadata: string | null;
  created_at: number;
}

function rowToNode(row: RawNode): GraphNode {
  return {
    id: row.id,
    type: row.type as NodeType,
    scope: row.scope ?? undefined,
    content: row.content,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    createdAt: row.created_at,
  };
}

function rowToEdge(row: RawEdge): GraphEdge {
  return {
    id: row.id,
    type: row.type as EdgeType,
    from: row.from_id,
    to: row.to_id,
    metadata: row.metadata
      ? (JSON.parse(row.metadata) as Record<string, unknown>)
      : undefined,
    createdAt: row.created_at,
  };
}
