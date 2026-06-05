import { prisma } from "@/lib/prisma";

export interface AutomationOperatorDashboard {
  summary?: Record<string, number>;
  workflows: Array<{ id: string; name: string; description?: string | null; status: string; scope: string; isSystemManaged?: boolean; lastRunAt: string | null; lastError: string | null; runs?: Array<{ id: string; status: string; createdAt: string; error: string | null }>; latestRun?: { id: string; status: string; createdAt: string; finishedAt?: string | null; error: string | null } | null; [key: string]: unknown }>;
  approvals: Array<{ id: string; nodeKey: string; status: string; createdAt: string; timeoutAt: string | null; decisionNote?: string | null; [key: string]: unknown }>;
  recommendations: Array<{ id: string; title: string; summary: string; status: string; priority: string | null; requiresApproval: boolean; createdAt: string; recommendationType?: string; detail?: string | null; actionType?: string; [key: string]: unknown }>;
  artifacts: Array<{ id: string; title: string; summary: string | null; status: string; artifactType: string; content: string | null; createdAt: string; [key: string]: unknown }>;
  playbooks?: Array<{ id: string; title: string; summary: string; trigger: string; priority: string; status: string; requiresApproval: boolean; nextAction: string }>;
  recipes?: Array<{ id: string; key: string; provider: string; enabled: boolean; lastRunAt: string | null; lastError: string | null }>;
  systemManagedRecipes?: Array<{ id: string; key: string; provider: string; status?: string; enabled?: boolean; lastRunAt: string | null; lastError: string | null; [key: string]: unknown }>;
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isOptionalTableError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && ["P2021", "P2007", "P2023"].includes(String((error as { code?: unknown }).code));
}

async function safe<T>(query: Promise<T[]>): Promise<T[]> {
  try {
    return await query;
  } catch (error) {
    if (isOptionalTableError(error)) return [];
    throw error;
  }
}

function recommendationText(recommendation: {
  title?: string;
  summary?: string;
  detail?: string | null;
  actionType?: string;
  recommendationType?: string;
}): string {
  return [
    recommendation.title,
    recommendation.summary,
    recommendation.detail,
    recommendation.actionType,
    recommendation.recommendationType,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function countMatchingRecommendations(
  recommendations: AutomationOperatorDashboard["recommendations"],
  patterns: RegExp[],
): number {
  return recommendations.filter((recommendation) => {
    const text = recommendationText(recommendation);
    return patterns.some((pattern) => pattern.test(text));
  }).length;
}

function buildOperatorPlaybooks(input: {
  approvals: AutomationOperatorDashboard["approvals"];
  recommendations: AutomationOperatorDashboard["recommendations"];
  recipes: AutomationOperatorDashboard["recipes"];
}): NonNullable<AutomationOperatorDashboard["playbooks"]> {
  const recipes = input.recipes ?? [];
  const failedRecipes = recipes.filter((recipe) => recipe.lastError);
  const pendingApprovals = input.approvals.length;
  const pipelineSignals = countMatchingRecommendations(input.recommendations, [
    /\bpipeline\b/,
    /\bdemo\b/,
    /\bdeal\b/,
    /\bclose date\b/,
    /\bhubspot\b/,
  ]);
  const retentionSignals = countMatchingRecommendations(input.recommendations, [
    /\bretention\b/,
    /\bchurn\b/,
    /\bcustomer health\b/,
    /\bonboarding\b/,
  ]);
  const burnSignals = countMatchingRecommendations(input.recommendations, [
    /\bburn\b/,
    /\brunway\b/,
    /\bcash\b/,
    /\bexpense\b/,
  ]);

  return [
    {
      id: "source-remediation",
      title: "Source remediation",
      summary:
        failedRecipes.length > 0
          ? `${failedRecipes.length} provider recipe${failedRecipes.length === 1 ? "" : "s"} need retry, credential, or payload review.`
          : "Provider recipes are not currently reporting sync errors.",
      trigger: failedRecipes.length > 0 ? failedRecipes.map((recipe) => recipe.provider).join(", ") : "No failed recipes",
      priority: failedRecipes.length > 0 ? "P1" : "P3",
      status: failedRecipes.length > 0 ? "Needs review" : "Monitoring",
      requiresApproval: true,
      nextAction: "Review source retries and credential fixes before re-running external syncs.",
    },
    {
      id: "pipeline-risk",
      title: "Pipeline risk review",
      summary:
        pipelineSignals > 0
          ? `${pipelineSignals} pipeline recommendation${pipelineSignals === 1 ? "" : "s"} need operator review.`
          : "No pending pipeline-risk recommendations are waiting.",
      trigger: `${pipelineSignals} pipeline signal${pipelineSignals === 1 ? "" : "s"}`,
      priority: pipelineSignals > 0 ? "P1" : "P3",
      status: pipelineSignals > 0 ? "Needs approval" : "Monitoring",
      requiresApproval: true,
      nextAction: "Approve, reject, or revise CRM and pipeline actions from the recommendation queue.",
    },
    {
      id: "retention-risk",
      title: "Retention-risk intervention",
      summary:
        retentionSignals > 0
          ? `${retentionSignals} customer-health signal${retentionSignals === 1 ? "" : "s"} should be reviewed before outreach.`
          : "No pending retention-risk recommendations are waiting.",
      trigger: `${retentionSignals} customer-health signal${retentionSignals === 1 ? "" : "s"}`,
      priority: retentionSignals > 0 ? "P1" : "P3",
      status: retentionSignals > 0 ? "Needs approval" : "Monitoring",
      requiresApproval: true,
      nextAction: "Review retention evidence, then approve any customer-facing draft before execution.",
    },
    {
      id: "burn-risk",
      title: "Burn-risk review",
      summary:
        burnSignals > 0
          ? `${burnSignals} burn or runway recommendation${burnSignals === 1 ? "" : "s"} need finance review.`
          : "No pending burn-risk recommendations are waiting.",
      trigger: `${burnSignals} finance signal${burnSignals === 1 ? "" : "s"}`,
      priority: burnSignals > 0 || pendingApprovals > 5 ? "P2" : "P3",
      status: burnSignals > 0 ? "Needs approval" : "Monitoring",
      requiresApproval: true,
      nextAction: "Review finance assumptions before approving spend, hiring, or runway actions.",
    },
  ];
}

export async function loadAutomationOperatorDashboard({ userId }: { userId: string }): Promise<AutomationOperatorDashboard> {
  const [workflows, approvals, recommendations, artifacts, recipes] = await Promise.all([
    safe(prisma.workflowDefinition.findMany({ where: { OR: [{ ownerId: userId }, { scope: "SHARED" }] }, include: { runs: { take: 3, orderBy: { createdAt: "desc" }, select: { id: true, status: true, createdAt: true, error: true } } }, orderBy: [{ isSystemManaged: "desc" }, { updatedAt: "desc" }], take: 20 })),
    safe(prisma.workflowApproval.findMany({ where: { status: "PENDING", OR: [{ approverId: userId }, { approverId: null }] }, orderBy: { createdAt: "desc" }, take: 20 })),
    safe(prisma.automationRecommendation.findMany({ where: { OR: [{ requestedById: userId }, { approverId: userId }, { executedById: userId }, { requiresApproval: false }] }, orderBy: { createdAt: "desc" }, take: 20 })),
    safe(prisma.automationArtifact.findMany({ orderBy: { createdAt: "desc" }, take: 20 })),
    safe(prisma.integrationRule.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 20 })),
  ]);

  const mappedRecommendations = recommendations.map((rec) => ({
    id: rec.id,
    title: rec.title,
    summary: rec.summary,
    status: String(rec.status),
    priority: rec.priority,
    requiresApproval: rec.requiresApproval,
    createdAt: iso(rec.createdAt) ?? "",
    recommendationType: rec.recommendationType,
    detail: rec.detail,
    actionType: rec.actionType,
  }));
  const mappedApprovals = approvals.map((approval) => ({ id: approval.id, nodeKey: approval.nodeKey, status: String(approval.status), createdAt: iso(approval.createdAt) ?? "", timeoutAt: iso(approval.timeoutAt) }));
  const mappedRecipes = recipes.map((recipe) => ({ id: recipe.id, key: recipe.key, provider: String(recipe.provider), enabled: recipe.enabled, lastRunAt: iso(recipe.lastRunAt), lastError: recipe.lastError }));

  return {
    workflows: workflows.map((workflow) => ({ id: workflow.id, name: workflow.name, status: String(workflow.status), scope: String(workflow.scope), isSystemManaged: workflow.isSystemManaged, lastRunAt: iso(workflow.lastRunAt), lastError: workflow.lastError, runs: workflow.runs.map((run) => ({ id: run.id, status: String(run.status), createdAt: iso(run.createdAt) ?? "", error: run.error })) })),
    approvals: mappedApprovals,
    recommendations: mappedRecommendations,
    artifacts: artifacts.map((artifact) => ({ id: artifact.id, title: artifact.title, summary: artifact.summary, status: String(artifact.status), artifactType: artifact.artifactType, content: artifact.content, createdAt: iso(artifact.createdAt) ?? "" })),
    playbooks: buildOperatorPlaybooks({
      approvals: mappedApprovals,
      recommendations: mappedRecommendations,
      recipes: mappedRecipes,
    }),
    recipes: mappedRecipes,
  };
}
