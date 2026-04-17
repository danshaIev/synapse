import type { EdgeType, GraphEdge } from "./types.js";

export interface ReadableGraph {
  getEdgesFrom(nodeId: string, type?: EdgeType): GraphEdge[];
  getEdgesTo(nodeId: string, type?: EdgeType): GraphEdge[];
}

export function reachableFrom(
  store: ReadableGraph,
  startId: string,
  via: EdgeType[],
): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edgeType of via) {
      for (const edge of store.getEdgesFrom(current, edgeType)) {
        if (!visited.has(edge.to)) queue.push(edge.to);
      }
    }
  }
  return visited;
}

export function ancestorsVia(
  store: ReadableGraph,
  startId: string,
  via: EdgeType[],
): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edgeType of via) {
      for (const edge of store.getEdgesTo(current, edgeType)) {
        if (!visited.has(edge.from)) queue.push(edge.from);
      }
    }
  }
  return visited;
}

export function tracesToIntent(
  store: ReadableGraph,
  stepId: string,
  intentId: string,
): boolean {
  const reachable = reachableFrom(store, stepId, ["SUPPORTS_GOAL"]);
  return reachable.has(intentId);
}
