import {
  AnalyticsSnapshotStatus,
  AutomationRecommendationStatus,
  DealStage,
  IntegrationConnectionStatus,
  WorkflowApprovalStatus,
  WorkflowRunStatus,
  WorkflowScope,
  WorkflowStatus,
} from "@/generated/prisma/client";
import { getCredentials, hasIntegrationCredential } from "@/lib/analytics/credentials";
import { snapshotKeysForIntegrationProvider } from "@/lib/analytics/provider-health";
import { listIntegrationDefinitions } from "@/lib/integrations/catalog";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import type { WorkspaceId } from "@/lib/platform/workspaces";
import { prisma } from "@/lib/prisma";

export interface DashboardOverviewPayload {
  generatedAt: string;
  workSummary: {
    workspaceId: WorkspaceId;
    activeTasks: number;
    overdueTasks: number;
    blockedTasks: number;
    dueSoonTasks: number;
    openAlerts: number;
  };
  revenueSummary: {
    workspaceId: WorkspaceId;
    openDeals: number;
    pipelineValue: number;
    closingThisMonth: number;
    wonThisQuarter: number;
  };
  integrationHealth: {
    workspaceId: WorkspaceId;
    totalConnections: number;
    connectedConnections: number;
    degradedConnections: number;
    errorConnections: number;
    staleConnections: number;
    missingConnections: number;
  };
  automationAttention: {
    workspaceId: WorkspaceId;
    activeWorkflows: number;
    pendingApprovals: number;
    pendingRecommendations: number;
    failingRuns: number;
    waitingExternalRuns: number;
  };
  analyticsFreshness: {
    workspaceId: WorkspaceId;
    latestSnapshotAt: string | null;
    healthyDomains: number;
    staleDomains: number;
    errorDomains: number;
    missingDomains: number;
  };
}

interface LoadDashboardOverviewInput {
  userId: string;
  organizationId: string | null;
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function startOfNextUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function startOfUtcQuarter(now: Date): Date {
  const quarterMonth = Math.floor(now.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(now.getUTCFullYear(), quarterMonth, 1));
}

function startOfNextUtcQuarter(now: Date): Date {
  const quarterMonth = Math.floor(now.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(now.getUTCFullYear(), quarterMonth + 3, 1));
}

export async function loadDashboardOverview(
  input: LoadDashboardOverviewInput,
): Promise<DashboardOverviewPayload> {
  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const staleSyncThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const monthStart = startOfUtcMonth(now);
  const nextMonthStart = startOfNextUtcMonth(now);
  const quarterStart = startOfUtcQuarter(now);
  const nextQuarterStart = startOfNextUtcQuarter(now);
  const organizationFilter = input.organizationId ? { organizationId: input.organizationId } : {};
  const ownerUserId = resolveIntegrationOwnerUserId(input.userId);
  const workflowVisibilityFilter = {
    OR: [{ ownerId: input.userId }, { scope: WorkflowScope.SHARED }],
  };
  const integrationDefinitions = listIntegrationDefinitions();
  const expectedSnapshotKeys = Array.from(
    new Set(
      integrationDefinitions.flatMap((definition) =>
        snapshotKeysForIntegrationProvider(definition.provider),
      ),
    ),
  );

  const [
    activeTasks,
    overdueTasks,
    blockedTasks,
    dueSoonTasks,
    openAlerts,
    openDeals,
    pipelineAggregate,
    closingThisMonth,
    wonThisQuarter,
    activeWorkflows,
    pendingApprovals,
    pendingRecommendations,
    failingRuns,
    waitingExternalRuns,
    connections,
    credentials,
    latestRows,
  ] = await Promise.all([
    prisma.task.count({
      where: {
        ...organizationFilter,
        status: { in: ["WORKING_ON_TODAY", "ACTIVE", "QUEUED"] },
      },
    }),
    prisma.task.count({
      where: {
        ...organizationFilter,
        status: { notIn: ["DONE"] },
        dueDate: { lt: now },
      },
    }),
    prisma.task.count({
      where: {
        ...organizationFilter,
        status: "NOT_DONE",
      },
    }),
    prisma.task.count({
      where: {
        ...organizationFilter,
        status: { notIn: ["DONE"] },
        dueDate: { gte: now, lte: in7d },
      },
    }),
    prisma.customerSuccessAlertRecord.count({
      where: {
        ...organizationFilter,
        status: "OPEN",
      },
    }),
    prisma.deal.count({
      where: {
        ...organizationFilter,
        stage: { notIn: [DealStage.CLOSED_WON, DealStage.CLOSED_LOST] },
      },
    }),
    prisma.deal.aggregate({
      _sum: { amount: true },
      where: {
        ...organizationFilter,
        stage: { notIn: [DealStage.CLOSED_WON, DealStage.CLOSED_LOST] },
      },
    }),
    prisma.deal.count({
      where: {
        ...organizationFilter,
        stage: { notIn: [DealStage.CLOSED_WON, DealStage.CLOSED_LOST] },
        expectedCloseDate: { gte: monthStart, lt: nextMonthStart },
      },
    }),
    prisma.deal.count({
      where: {
        ...organizationFilter,
        stage: DealStage.CLOSED_WON,
        closedAt: { gte: quarterStart, lt: nextQuarterStart },
      },
    }),
    prisma.workflowDefinition.count({
      where: {
        ...workflowVisibilityFilter,
        status: WorkflowStatus.ACTIVE,
      },
    }),
    prisma.workflowApproval.count({
      where: {
        status: WorkflowApprovalStatus.PENDING,
        run: {
          workflow: workflowVisibilityFilter,
        },
      },
    }),
    prisma.automationRecommendation.count({
      where: {
        status: AutomationRecommendationStatus.PENDING_APPROVAL,
        workflow: workflowVisibilityFilter,
      },
    }),
    prisma.workflowRun.count({
      where: {
        status: WorkflowRunStatus.FAILED,
        workflow: workflowVisibilityFilter,
      },
    }),
    prisma.workflowRun.count({
      where: {
        status: WorkflowRunStatus.WAITING_EXTERNAL,
        workflow: workflowVisibilityFilter,
      },
    }),
    prisma.integrationConnection.findMany({
      where: { userId: ownerUserId },
      select: {
        provider: true,
        status: true,
        lastSyncedAt: true,
      },
    }),
    getCredentials(ownerUserId),
    expectedSnapshotKeys.length === 0
      ? Promise.resolve([])
      : prisma.analyticsSnapshot.groupBy({
          by: ["providerKey"],
          where: {
            userId: ownerUserId,
            providerKey: { in: expectedSnapshotKeys },
          },
          _max: { capturedAt: true },
        }),
  ]);

  const latestSnapshotSelectors = latestRows
    .map((row) =>
      row._max.capturedAt
        ? { providerKey: row.providerKey, capturedAt: row._max.capturedAt }
        : null,
    )
    .filter(Boolean) as Array<{ providerKey: string; capturedAt: Date }>;

  const latestSnapshots =
    latestSnapshotSelectors.length === 0
      ? []
      : await prisma.analyticsSnapshot.findMany({
          where: {
            userId: ownerUserId,
            OR: latestSnapshotSelectors,
          },
          select: {
            providerKey: true,
            status: true,
            capturedAt: true,
            expiresAt: true,
          },
        });

  const latestSnapshotByKey = new Map(
    latestSnapshots.map((snapshot) => [snapshot.providerKey, snapshot]),
  );

  let latestSnapshotAt: string | null = null;
  let healthyDomains = 0;
  let staleDomains = 0;
  let errorDomains = 0;
  let missingDomains = 0;

  for (const providerKey of expectedSnapshotKeys) {
    const snapshot = latestSnapshotByKey.get(providerKey);
    if (!snapshot) {
      missingDomains += 1;
      continue;
    }

    if (!latestSnapshotAt || snapshot.capturedAt.toISOString() > latestSnapshotAt) {
      latestSnapshotAt = snapshot.capturedAt.toISOString();
    }

    if (snapshot.status === AnalyticsSnapshotStatus.ERROR) {
      errorDomains += 1;
      continue;
    }

    if (snapshot.expiresAt.getTime() <= now.getTime()) {
      staleDomains += 1;
      continue;
    }

    healthyDomains += 1;
  }

  const connectionsByProvider = new Map(
    connections.map((connection) => [connection.provider, connection]),
  );

  let connectedConnections = 0;
  let errorConnections = 0;
  let staleConnections = 0;
  let missingConnections = 0;

  for (const definition of integrationDefinitions) {
    const connection = connectionsByProvider.get(definition.provider);
    const hasCredential = hasIntegrationCredential(definition.provider, credentials);
    const isError = connection?.status === IntegrationConnectionStatus.ERROR;
    const isConnected =
      connection?.status === IntegrationConnectionStatus.CONNECTED || hasCredential;

    if (isConnected) {
      connectedConnections += 1;
    }

    if (isError) {
      errorConnections += 1;
      continue;
    }

    if (connection && isConnected) {
      if (
        !connection.lastSyncedAt ||
        connection.lastSyncedAt.getTime() < staleSyncThreshold.getTime()
      ) {
        staleConnections += 1;
      }
      continue;
    }

    if (!isConnected) {
      missingConnections += 1;
    }
  }

  return {
    generatedAt: now.toISOString(),
    workSummary: {
      workspaceId: "work",
      activeTasks,
      overdueTasks,
      blockedTasks,
      dueSoonTasks,
      openAlerts,
    },
    revenueSummary: {
      workspaceId: "deals",
      openDeals,
      pipelineValue: pipelineAggregate._sum.amount ?? 0,
      closingThisMonth,
      wonThisQuarter,
    },
    integrationHealth: {
      workspaceId: "integrations",
      totalConnections: integrationDefinitions.length,
      connectedConnections,
      degradedConnections: errorConnections + staleConnections,
      errorConnections,
      staleConnections,
      missingConnections,
    },
    automationAttention: {
      workspaceId: "automations",
      activeWorkflows,
      pendingApprovals,
      pendingRecommendations,
      failingRuns,
      waitingExternalRuns,
    },
    analyticsFreshness: {
      workspaceId: "analytics",
      latestSnapshotAt,
      healthyDomains,
      staleDomains,
      errorDomains,
      missingDomains,
    },
  };
}
