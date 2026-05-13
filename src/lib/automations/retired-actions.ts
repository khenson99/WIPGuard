import type { WorkflowGraph } from "@/lib/automations/graph";

export const RETIRED_AUTOMATION_ACTION_TYPES = [
  "create_task",
  "update_task",
  "create_checklist_tasks",
  "logbook_entry",
] as const;

const retiredAutomationActionTypeSet = new Set(RETIRED_AUTOMATION_ACTION_TYPES);

export const RETIRED_AUTOMATION_ACTION_MESSAGE =
  "Task-oriented workflow actions have been retired with the Work section.";

export function isRetiredAutomationActionType(value: unknown): value is string {
  return typeof value === "string" && retiredAutomationActionTypeSet.has(value);
}

export function sanitizeWorkflowGraphRetiredActions(graph: WorkflowGraph): WorkflowGraph {
  const retiredNodeKeys = new Set(
    graph.nodes
      .filter((node) => isRetiredAutomationActionType(node.config?.actionType))
      .map((node) => node.key)
  );

  if (retiredNodeKeys.size === 0) {
    return graph;
  }

  return {
    nodes: graph.nodes.filter((node) => !retiredNodeKeys.has(node.key)),
    edges: graph.edges.filter(
      (edge) => !retiredNodeKeys.has(edge.source) && !retiredNodeKeys.has(edge.target)
    ),
  };
}

export function workflowGraphContainsRetiredActions(graph: WorkflowGraph): boolean {
  return graph.nodes.some((node) => isRetiredAutomationActionType(node.config?.actionType));
}
