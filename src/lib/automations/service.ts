import {
  IntegrationProvider,
  WorkflowScope,
  WorkflowStatus,
  type Prisma,
  type WorkflowDefinition,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getAppRole, type AppRole } from "@/lib/permissions";
import {
  graphToPrismaJson,
  type WorkflowGraph,
  validateWorkflowGraph,
} from "@/lib/automations/graph";
import { workflowGraphContainsRetiredActions } from "@/lib/automations/retired-actions";

export interface WorkflowRolePolicy {
  editRoles: AppRole[];
  approveRoles: AppRole[];
}

export const DEFAULT_WORKFLOW_ROLE_POLICY: WorkflowRolePolicy = {
  editRoles: ["admin"],
  approveRoles: ["admin", "member"],
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toRoleArray(input: unknown, fallback: AppRole[]): AppRole[] {
  if (!Array.isArray(input)) return fallback;
  const mapped = input
    .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
    .filter((value): value is AppRole => value === "admin" || value === "member" || value === "observer");
  return mapped.length > 0 ? Array.from(new Set(mapped)) : fallback;
}

export function normalizeWorkflowRolePolicy(input: unknown): WorkflowRolePolicy {
  const record = asRecord(input) ?? {};
  return {
    editRoles: toRoleArray(record.editRoles, DEFAULT_WORKFLOW_ROLE_POLICY.editRoles),
    approveRoles: toRoleArray(record.approveRoles, DEFAULT_WORKFLOW_ROLE_POLICY.approveRoles),
  };
}

export function integrationProviderFromString(
  value: string | null | undefined
): IntegrationProvider | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  switch (normalized) {
    case "GOOGLE_WORKSPACE":
      return IntegrationProvider.GOOGLE_WORKSPACE;
    case "HUBSPOT":
      return IntegrationProvider.HUBSPOT;
    case "SLACK":
      return IntegrationProvider.SLACK;
    case "CODA":
      return IntegrationProvider.CODA;
    case "REDDIT":
      return IntegrationProvider.REDDIT;
    case "STRIPE":
      return IntegrationProvider.STRIPE;
    case "MERCURY":
      return IntegrationProvider.MERCURY;
    case "WEBFLOW":
      return IntegrationProvider.WEBFLOW;
    case "GOOGLE_ANALYTICS":
      return IntegrationProvider.GOOGLE_ANALYTICS;
    case "GOOGLE_SEARCH_CONSOLE":
      return IntegrationProvider.GOOGLE_SEARCH_CONSOLE;
    case "GOOGLE_ADS":
      return IntegrationProvider.GOOGLE_ADS;
    case "META_ADS":
      return IntegrationProvider.META_ADS;
    case "META_PAGE":
      return IntegrationProvider.META_PAGE;
    case "PYLON":
      return IntegrationProvider.PYLON;
    case "SEMRUSH":
      return IntegrationProvider.SEMRUSH;
    default:
      return null;
  }
}

export function integrationProvidersFromInput(input: unknown): IntegrationProvider[] {
  if (!Array.isArray(input)) return [];
  const providers = input
    .map((item) => integrationProviderFromString(typeof item === "string" ? item : null))
    .filter((item): item is IntegrationProvider => Boolean(item));
  return Array.from(new Set(providers));
}

export async function syncWorkflowGraphRecords(
  workflowId: string,
  graph: WorkflowGraph
): Promise<void> {
  await prisma.$transaction([
    prisma.workflowNode.deleteMany({ where: { workflowId } }),
    prisma.workflowEdge.deleteMany({ where: { workflowId } }),
    ...(graph.nodes.length > 0
      ? [
          prisma.workflowNode.createMany({
            data: graph.nodes.map((node) => ({
              workflowId,
              nodeKey: node.key,
              type: node.type,
              label: node.label,
              config: (node.config ?? {}) as Prisma.InputJsonValue,
              positionX: node.positionX ?? 0,
              positionY: node.positionY ?? 0,
            })),
          }),
        ]
      : []),
    ...(graph.edges.length > 0
      ? [
          prisma.workflowEdge.createMany({
            data: graph.edges.map((edge) => ({
              workflowId,
              sourceNodeKey: edge.source,
              targetNodeKey: edge.target,
              conditionLabel: edge.conditionLabel,
              conditionExpr: edge.conditionExpr
                ? (edge.conditionExpr as Prisma.InputJsonValue)
                : undefined,
              priority: edge.priority ?? 0,
            })),
          }),
        ]
      : []),
  ]);
}

export async function assertCanViewWorkflow(
  userId: string,
  workflowId: string
): Promise<WorkflowDefinition> {
  const workflow = await prisma.workflowDefinition.findUnique({ where: { id: workflowId } });
  if (!workflow) {
    throw new Error("Workflow not found");
  }

  if (workflow.ownerId === userId || workflow.scope === WorkflowScope.SHARED) {
    return workflow;
  }

  throw new Error("Forbidden");
}

export async function assertCanEditWorkflow(
  userId: string,
  workflowId: string
): Promise<WorkflowDefinition> {
  const workflow = await assertCanViewWorkflow(userId, workflowId);
  if (workflow.ownerId === userId) {
    return workflow;
  }

  const role = await getAppRole(userId);
  const rolePolicy = normalizeWorkflowRolePolicy(workflow.rolePolicy);
  if (rolePolicy.editRoles.includes(role)) {
    return workflow;
  }

  throw new Error("Forbidden");
}

export function validateAndNormalizeGraph(input: unknown): {
  graph: WorkflowGraph;
  graphJson: Prisma.JsonObject;
} {
  const result = validateWorkflowGraph(input);
  if (!result.valid) {
    throw new Error(result.errors.join(" | "));
  }

  if (workflowGraphContainsRetiredActions(result.graph)) {
    throw new Error("Task-oriented workflow actions have been retired with the Work section.");
  }

  return {
    graph: result.graph,
    graphJson: graphToPrismaJson(result.graph),
  };
}

export function normalizeWorkflowScope(input: unknown): WorkflowScope {
  return input === "SHARED" ? WorkflowScope.SHARED : WorkflowScope.PRIVATE;
}

export function normalizeWorkflowStatus(input: unknown): WorkflowStatus {
  switch (input) {
    case "ACTIVE":
      return WorkflowStatus.ACTIVE;
    case "PAUSED":
      return WorkflowStatus.PAUSED;
    case "ERROR":
      return WorkflowStatus.ERROR;
    case "ARCHIVED":
      return WorkflowStatus.ARCHIVED;
    default:
      return WorkflowStatus.DRAFT;
  }
}
