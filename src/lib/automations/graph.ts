import type { Prisma } from "@/generated/prisma/client";

export interface WorkflowGraphNode {
  key: string;
  type: "TRIGGER" | "CONDITION" | "ACTION" | "APPROVAL" | "DELAY";
  label: string;
  config?: Record<string, unknown>;
  positionX?: number;
  positionY?: number;
}

export interface WorkflowGraphEdge {
  source: string;
  target: string;
  conditionLabel?: string;
  conditionExpr?: Record<string, unknown>;
  priority?: number;
}

export interface WorkflowGraph {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
}

export interface WorkflowGraphValidationResult {
  graph: WorkflowGraph;
  valid: boolean;
  errors: string[];
}

export interface WorkflowExecutionContext {
  trigger: {
    provider: string;
    eventType: string;
    externalId?: string | null;
    payload: Record<string, unknown>;
  };
  state: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNode(value: unknown): WorkflowGraphNode | null {
  const record = asRecord(value);
  if (!record) return null;
  const key = typeof record.key === "string" ? record.key.trim() : "";
  const type = typeof record.type === "string" ? record.type.trim().toUpperCase() : "";
  const label = typeof record.label === "string" ? record.label.trim() : "";
  const config = asRecord(record.config) ?? {};

  const normalizedType =
    type === "TRIGGER" ||
    type === "CONDITION" ||
    type === "ACTION" ||
    type === "APPROVAL" ||
    type === "DELAY"
      ? type
      : null;

  if (!key || !normalizedType || !label) return null;

  const positionX =
    typeof record.positionX === "number" && Number.isFinite(record.positionX)
      ? Math.trunc(record.positionX)
      : 0;
  const positionY =
    typeof record.positionY === "number" && Number.isFinite(record.positionY)
      ? Math.trunc(record.positionY)
      : 0;

  return {
    key,
    type: normalizedType,
    label,
    config,
    positionX,
    positionY,
  };
}

function asEdge(value: unknown): WorkflowGraphEdge | null {
  const record = asRecord(value);
  if (!record) return null;
  const source = typeof record.source === "string" ? record.source.trim() : "";
  const target = typeof record.target === "string" ? record.target.trim() : "";
  if (!source || !target) return null;

  const priority =
    typeof record.priority === "number" && Number.isFinite(record.priority)
      ? Math.trunc(record.priority)
      : 0;

  return {
    source,
    target,
    conditionLabel:
      typeof record.conditionLabel === "string" && record.conditionLabel.trim().length > 0
        ? record.conditionLabel.trim()
        : undefined,
    conditionExpr: asRecord(record.conditionExpr) ?? undefined,
    priority,
  };
}

export function normalizeWorkflowGraph(input: unknown): WorkflowGraph {
  const record = asRecord(input) ?? {};
  const nodes = Array.isArray(record.nodes)
    ? record.nodes.map(asNode).filter((node): node is WorkflowGraphNode => Boolean(node))
    : [];
  const edges = Array.isArray(record.edges)
    ? record.edges.map(asEdge).filter((edge): edge is WorkflowGraphEdge => Boolean(edge))
    : [];

  return { nodes, edges };
}

function findCycle(graph: WorkflowGraph): string[] {
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node.key, []);
  for (const edge of graph.edges) {
    adjacency.get(edge.source)?.push(edge.target);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  const dfs = (node: string): boolean => {
    if (inStack.has(node)) {
      path.push(node);
      return true;
    }
    if (visited.has(node)) return false;

    visited.add(node);
    inStack.add(node);

    for (const next of adjacency.get(node) ?? []) {
      if (dfs(next)) {
        path.push(node);
        return true;
      }
    }

    inStack.delete(node);
    return false;
  };

  for (const node of adjacency.keys()) {
    if (dfs(node)) {
      return path.reverse();
    }
  }

  return [];
}

export function validateWorkflowGraph(input: unknown): WorkflowGraphValidationResult {
  const graph = normalizeWorkflowGraph(input);
  const errors: string[] = [];

  if (graph.nodes.length === 0) {
    errors.push("Graph must include at least one node.");
  }

  const nodeByKey = new Map<string, WorkflowGraphNode>();
  for (const node of graph.nodes) {
    if (nodeByKey.has(node.key)) {
      errors.push(`Duplicate node key: ${node.key}`);
    } else {
      nodeByKey.set(node.key, node);
    }
  }

  const triggerNodes = graph.nodes.filter((node) => node.type === "TRIGGER");
  if (triggerNodes.length !== 1) {
    errors.push("Graph must include exactly one trigger node.");
  }

  for (const edge of graph.edges) {
    if (!nodeByKey.has(edge.source)) {
      errors.push(`Edge source node does not exist: ${edge.source}`);
    }
    if (!nodeByKey.has(edge.target)) {
      errors.push(`Edge target node does not exist: ${edge.target}`);
    }
  }

  const cycle = findCycle(graph);
  if (cycle.length > 0) {
    errors.push(`Graph contains cycle: ${cycle.join(" -> ")}`);
  }

  return {
    graph,
    valid: errors.length === 0,
    errors,
  };
}

export function graphToPrismaJson(graph: WorkflowGraph): Prisma.JsonObject {
  return {
    nodes: graph.nodes.map((node) => ({
      key: node.key,
      type: node.type,
      label: node.label,
      config: (node.config ?? {}) as Prisma.JsonObject,
      positionX: node.positionX ?? 0,
      positionY: node.positionY ?? 0,
    })),
    edges: graph.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      conditionLabel: edge.conditionLabel,
      conditionExpr: edge.conditionExpr ? (edge.conditionExpr as Prisma.JsonObject) : null,
      priority: edge.priority ?? 0,
    })),
  } as unknown as Prisma.JsonObject;
}

function getPath(context: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let current: unknown = context;

  for (const part of parts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

export function evaluateConditionExpression(
  expression: Record<string, unknown> | null | undefined,
  context: Record<string, unknown>
): boolean {
  if (!expression) return true;

  const field = typeof expression.field === "string" ? expression.field : null;
  const op = typeof expression.op === "string" ? expression.op : "exists";
  const expected = expression.value;

  if (!field) return true;

  const actual = getPath(context, field);

  switch (op) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gt":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "gte":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "lt":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "lte":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case "contains":
      if (typeof actual === "string" && typeof expected === "string") {
        return actual.toLowerCase().includes(expected.toLowerCase());
      }
      if (Array.isArray(actual)) {
        return actual.includes(expected);
      }
      return false;
    case "exists":
    default:
      return actual !== null && actual !== undefined;
  }
}

export function renderTemplatedString(
  template: string,
  context: Record<string, unknown>
): string {
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, token: string) => {
    const value = getPath(context, token.trim());
    if (value === null || value === undefined) return "";
    return String(value);
  });
}
