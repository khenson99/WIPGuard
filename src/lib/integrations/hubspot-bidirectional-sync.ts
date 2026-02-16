import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  Prisma,
  type IntegrationConnection,
  type IntegrationRule,
  type TaskStatus,
} from "@/generated/prisma/client";
import { buildOutboxIdempotencyKey, publishDomainEvent } from "@/lib/event-bus";
import { prisma } from "@/lib/prisma";
import { getNextColumnOrder } from "@/lib/task-order";
import { protectIntegrationSecret, unprotectIntegrationSecret } from "@/lib/integrations/token-crypto";

export const HUBSPOT_BIDIRECTIONAL_RULE_KEY = "hubspot_bidirectional_sync";

const HUBSPOT_DEALS_ENDPOINT = "https://api.hubapi.com/crm/v3/objects/deals";
const HUBSPOT_TOKEN_ENDPOINT = "https://api.hubapi.com/oauth/v1/token";

type HubSpotConflictResolution = "hubspot_wins" | "task_wins" | "newest_wins";

interface HubSpotDeal {
  id: string;
  properties?: {
    dealname?: string;
    dealstage?: string;
    pipeline?: string;
    hs_lastmodifieddate?: string;
  };
}

interface HubSpotCheckpoint {
  lastDealModifiedAt?: string;
  lastDealId?: string;
  lastTaskUpdatedAt?: string;
  lastTaskId?: string;
}

interface LinkedTask {
  id: string;
  title: string;
  status: TaskStatus;
  updatedAt: Date;
  completedOn: Date | null;
}

export interface HubSpotBidirectionalSyncConfig {
  monitoredPipelines: string[];
  maxResults: number;
  taskStatusToDealStage: Record<TaskStatus, string>;
  dealStageToTaskStatus: Record<string, TaskStatus>;
  conflictResolution: HubSpotConflictResolution;
}

export interface HubSpotBidirectionalRuleState {
  id: string;
  key: string;
  enabled: boolean;
  config: HubSpotBidirectionalSyncConfig;
  checkpoint: HubSpotCheckpoint;
  lastObservedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface HubSpotBidirectionalRulePatch {
  enabled?: boolean;
  config?: Partial<HubSpotBidirectionalSyncConfig>;
}

export interface HubSpotSyncConflict {
  dealId: string;
  taskId: string;
  dealStage: string;
  mappedTaskStatus: TaskStatus;
  taskStatus: TaskStatus;
  mappedDealStage: string;
  resolution: HubSpotConflictResolution;
  winner: "deal" | "task";
  reason: string;
}

export interface HubSpotSyncDrift {
  dealId: string;
  taskId: string | null;
  kind:
    | "missing_local_task"
    | "missing_hubspot_deal"
    | "unmapped_deal_stage"
    | "unmapped_task_status";
  detail: string;
}

export interface HubSpotBidirectionalRunResult {
  ruleId: string;
  enabled: boolean;
  scannedDeals: number;
  scannedLinkedTasks: number;
  dealToTaskApplied: number;
  taskToDealApplied: number;
  dedupedTransitions: number;
  conflicts: HubSpotSyncConflict[];
  drifts: HubSpotSyncDrift[];
  errors: Array<{ dealId: string | null; taskId: string | null; error: string }>;
  checkpoint: HubSpotCheckpoint;
}

export class HubSpotBidirectionalAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HubSpotBidirectionalAuthError";
  }
}

export function defaultHubSpotBidirectionalConfig(): HubSpotBidirectionalSyncConfig {
  return {
    monitoredPipelines: [],
    maxResults: 150,
    taskStatusToDealStage: {
      BACKLOG: "appointmentscheduled",
      QUEUED: "appointmentscheduled",
      WORKING_ON_TODAY: "presentationscheduled",
      ACTIVE: "qualifiedtobuy",
      NOT_DONE: "contractsent",
      DONE: "closedwon",
    },
    dealStageToTaskStatus: {
      appointmentscheduled: "QUEUED",
      qualifiedtobuy: "ACTIVE",
      presentationscheduled: "WORKING_ON_TODAY",
      decisionmakerboughtin: "ACTIVE",
      contractsent: "NOT_DONE",
      closedwon: "DONE",
      closedlost: "NOT_DONE",
    },
    conflictResolution: "newest_wins",
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeTaskStatus(value: unknown): TaskStatus | null {
  if (
    value === "BACKLOG" ||
    value === "QUEUED" ||
    value === "WORKING_ON_TODAY" ||
    value === "ACTIVE" ||
    value === "NOT_DONE" ||
    value === "DONE"
  ) {
    return value;
  }
  return null;
}

function normalizeConfig(raw: unknown): HubSpotBidirectionalSyncConfig {
  const input = asRecord(raw);
  const fallback = defaultHubSpotBidirectionalConfig();

  const monitoredPipelines = Array.isArray(input.monitoredPipelines)
    ? input.monitoredPipelines.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0
      )
    : fallback.monitoredPipelines;

  const maxResults =
    typeof input.maxResults === "number" && Number.isInteger(input.maxResults)
      ? Math.max(25, Math.min(500, input.maxResults))
      : fallback.maxResults;

  const taskStatusToDealStageInput = asRecord(input.taskStatusToDealStage);
  const taskStatusToDealStage: Record<TaskStatus, string> = {
    ...fallback.taskStatusToDealStage,
  };
  for (const status of Object.keys(taskStatusToDealStage) as TaskStatus[]) {
    const stage = taskStatusToDealStageInput[status];
    if (typeof stage === "string" && stage.trim().length > 0) {
      taskStatusToDealStage[status] = stage.trim();
    }
  }

  const dealStageToTaskStatusInput = asRecord(input.dealStageToTaskStatus);
  const dealStageToTaskStatus: Record<string, TaskStatus> = {
    ...fallback.dealStageToTaskStatus,
  };
  for (const [stage, status] of Object.entries(dealStageToTaskStatusInput)) {
    const normalizedStatus = normalizeTaskStatus(status);
    if (normalizedStatus && stage.trim().length > 0) {
      dealStageToTaskStatus[stage.trim()] = normalizedStatus;
    }
  }

  const conflictResolution: HubSpotConflictResolution =
    input.conflictResolution === "hubspot_wins" ||
    input.conflictResolution === "task_wins" ||
    input.conflictResolution === "newest_wins"
      ? input.conflictResolution
      : fallback.conflictResolution;

  return {
    monitoredPipelines,
    maxResults,
    taskStatusToDealStage,
    dealStageToTaskStatus,
    conflictResolution,
  };
}

function normalizeCheckpoint(raw: unknown): HubSpotCheckpoint {
  const input = asRecord(raw);
  const checkpoint: HubSpotCheckpoint = {};

  if (typeof input.lastDealModifiedAt === "string" && input.lastDealModifiedAt.length > 0) {
    checkpoint.lastDealModifiedAt = input.lastDealModifiedAt;
  }
  if (typeof input.lastDealId === "string" && input.lastDealId.length > 0) {
    checkpoint.lastDealId = input.lastDealId;
  }
  if (typeof input.lastTaskUpdatedAt === "string" && input.lastTaskUpdatedAt.length > 0) {
    checkpoint.lastTaskUpdatedAt = input.lastTaskUpdatedAt;
  }
  if (typeof input.lastTaskId === "string" && input.lastTaskId.length > 0) {
    checkpoint.lastTaskId = input.lastTaskId;
  }

  return checkpoint;
}

function parseDate(value: string | undefined): Date | null {
  if (!value || value.trim().length === 0) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function parseDealIdFromExternalObjectId(externalObjectId: string): string | null {
  const [first] = externalObjectId.split(":");
  return first && first.trim().length > 0 ? first.trim() : null;
}

function buildTaskToDealDedupeKey(input: {
  taskId: string;
  dealId: string;
  targetStage: string;
}): string {
  return ["hubspot", "hubspot_bidirectional", input.taskId, input.dealId, `to-stage-${input.targetStage}`].join(":");
}

function buildDealToTaskDedupeKey(input: {
  taskId: string;
  dealId: string;
  targetStatus: TaskStatus;
}): string {
  return ["hubspot", "hubspot_bidirectional", input.dealId, input.taskId, `to-status-${input.targetStatus}`].join(":");
}

function chooseConflictWinner(input: {
  resolution: HubSpotConflictResolution;
  dealUpdatedAt: Date | null;
  taskUpdatedAt: Date;
}): { winner: "deal" | "task"; reason: string } {
  if (input.resolution === "hubspot_wins") {
    return { winner: "deal", reason: "Configured strategy: hubspot_wins" };
  }
  if (input.resolution === "task_wins") {
    return { winner: "task", reason: "Configured strategy: task_wins" };
  }

  if (!input.dealUpdatedAt) {
    return { winner: "task", reason: "Deal modified timestamp missing; defaulting to task" };
  }

  if (input.taskUpdatedAt.getTime() >= input.dealUpdatedAt.getTime()) {
    return { winner: "task", reason: "Newest update is local task" };
  }

  return { winner: "deal", reason: "Newest update is HubSpot deal" };
}

async function markConnectionError(userId: string, message: string): Promise<void> {
  await prisma.integrationConnection.updateMany({
    where: {
      userId,
      provider: IntegrationProvider.HUBSPOT,
    },
    data: {
      status: IntegrationConnectionStatus.ERROR,
      lastError: message,
      lastSyncedAt: null,
    },
  });
}

async function extractHubSpotAuth(input: {
  userId: string;
}): Promise<{ accessToken: string; connection: IntegrationConnection }> {
  const connection = await prisma.integrationConnection.findUnique({
    where: {
      userId_provider: {
        userId: input.userId,
        provider: IntegrationProvider.HUBSPOT,
      },
    },
  });

  if (!connection) {
    throw new HubSpotBidirectionalAuthError("HubSpot is not connected");
  }

  const token = unprotectIntegrationSecret(connection.accessToken);
  if (!token) {
    throw new HubSpotBidirectionalAuthError("HubSpot access token is missing");
  }

  const expired = connection.expiresAt ? connection.expiresAt.getTime() <= Date.now() + 30_000 : false;
  if (!expired) {
    return { accessToken: token, connection };
  }

  const refreshToken = unprotectIntegrationSecret(connection.refreshToken);
  if (!refreshToken) {
    throw new HubSpotBidirectionalAuthError("HubSpot refresh token is missing");
  }

  if (!process.env.HUBSPOT_CLIENT_ID || !process.env.HUBSPOT_CLIENT_SECRET) {
    throw new HubSpotBidirectionalAuthError("HubSpot OAuth client credentials are missing");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.HUBSPOT_CLIENT_ID,
    client_secret: process.env.HUBSPOT_CLIENT_SECRET,
    refresh_token: refreshToken,
  });

  const response = await fetch(HUBSPOT_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  const payloadRecord = asRecord(payload);

  if (!response.ok) {
    const message =
      (typeof payloadRecord.error_description === "string" && payloadRecord.error_description) ||
      (typeof payloadRecord.error === "string" && payloadRecord.error) ||
      `HubSpot token refresh failed (${response.status})`;
    throw new HubSpotBidirectionalAuthError(message);
  }

  const accessToken =
    typeof payloadRecord.access_token === "string" && payloadRecord.access_token.length > 0
      ? payloadRecord.access_token
      : null;
  if (!accessToken) {
    throw new HubSpotBidirectionalAuthError("HubSpot token refresh response missing access token");
  }

  const expiresIn =
    typeof payloadRecord.expires_in === "number" && Number.isFinite(payloadRecord.expires_in)
      ? payloadRecord.expires_in
      : null;

  const refreshed = await prisma.integrationConnection.update({
    where: {
      userId_provider: {
        userId: input.userId,
        provider: IntegrationProvider.HUBSPOT,
      },
    },
    data: {
      accessToken: protectIntegrationSecret(accessToken),
      refreshToken:
        typeof payloadRecord.refresh_token === "string" && payloadRecord.refresh_token.length > 0
          ? protectIntegrationSecret(payloadRecord.refresh_token)
          : connection.refreshToken,
      tokenType:
        typeof payloadRecord.token_type === "string" ? payloadRecord.token_type : connection.tokenType,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : connection.expiresAt,
      status: IntegrationConnectionStatus.CONNECTED,
      lastError: null,
    },
  });

  return {
    accessToken,
    connection: refreshed,
  };
}

async function hubspotFetchJson<T>(accessToken: string, url: URL): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new HubSpotBidirectionalAuthError("HubSpot access token is invalid or expired");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(`HubSpot API failed (${response.status})`);
  }
  return payload as T;
}

async function listDeals(input: {
  accessToken: string;
  config: HubSpotBidirectionalSyncConfig;
}): Promise<HubSpotDeal[]> {
  const deals: HubSpotDeal[] = [];
  let after: string | undefined;

  while (deals.length < input.config.maxResults) {
    const url = new URL(HUBSPOT_DEALS_ENDPOINT);
    url.searchParams.set("limit", String(Math.min(100, input.config.maxResults - deals.length)));
    url.searchParams.set("properties", "dealname,dealstage,pipeline,hs_lastmodifieddate");
    if (after) {
      url.searchParams.set("after", after);
    }

    const payload = await hubspotFetchJson<{
      results?: HubSpotDeal[];
      paging?: { next?: { after?: string } };
    }>(input.accessToken, url);

    const batch = Array.isArray(payload.results) ? payload.results : [];
    for (const deal of batch) {
      const pipeline = deal.properties?.pipeline;
      if (
        input.config.monitoredPipelines.length > 0 &&
        (!pipeline || !input.config.monitoredPipelines.includes(pipeline))
      ) {
        continue;
      }
      deals.push(deal);
      if (deals.length >= input.config.maxResults) {
        break;
      }
    }

    after = payload.paging?.next?.after;
    if (!after) {
      break;
    }
  }

  return deals;
}

async function updateHubSpotDealStage(input: {
  accessToken: string;
  dealId: string;
  stageId: string;
}): Promise<void> {
  const response = await fetch(`${HUBSPOT_DEALS_ENDPOINT}/${encodeURIComponent(input.dealId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        dealstage: input.stageId,
      },
    }),
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new HubSpotBidirectionalAuthError("HubSpot access token is invalid or expired");
  }

  if (!response.ok) {
    throw new Error(`HubSpot deal update failed (${response.status})`);
  }
}

async function fetchLinkedTasks(userId: string): Promise<Map<string, LinkedTask[]>> {
  const receipts = await prisma.integrationReceipt.findMany({
    where: {
      rule: {
        userId,
        provider: IntegrationProvider.HUBSPOT,
      },
      taskId: {
        not: null,
      },
    },
    select: {
      externalObjectId: true,
      task: {
        select: {
          id: true,
          title: true,
          status: true,
          updatedAt: true,
          completedOn: true,
        },
      },
    },
  });

  const byDealId = new Map<string, LinkedTask[]>();
  const dedupe = new Set<string>();

  for (const receipt of receipts) {
    if (!receipt.task) continue;
    const dealId = parseDealIdFromExternalObjectId(receipt.externalObjectId);
    if (!dealId) continue;

    const dedupeKey = `${dealId}:${receipt.task.id}`;
    if (dedupe.has(dedupeKey)) continue;
    dedupe.add(dedupeKey);

    const bucket = byDealId.get(dealId) ?? [];
    bucket.push(receipt.task);
    byDealId.set(dealId, bucket);
  }

  for (const [dealId, tasks] of byDealId.entries()) {
    tasks.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    byDealId.set(dealId, tasks);
  }

  return byDealId;
}

async function getOrCreateHubSpotBidirectionalRule(userId: string): Promise<IntegrationRule> {
  return prisma.integrationRule.upsert({
    where: {
      userId_provider_key: {
        userId,
        provider: IntegrationProvider.HUBSPOT,
        key: HUBSPOT_BIDIRECTIONAL_RULE_KEY,
      },
    },
    update: {},
    create: {
      userId,
      provider: IntegrationProvider.HUBSPOT,
      key: HUBSPOT_BIDIRECTIONAL_RULE_KEY,
      enabled: true,
      statusOverride: null,
      config: defaultHubSpotBidirectionalConfig() as unknown as Prisma.InputJsonValue,
      checkpoint: {} as unknown as Prisma.InputJsonValue,
    },
  });
}

export function serializeHubSpotBidirectionalRule(rule: IntegrationRule): HubSpotBidirectionalRuleState {
  return {
    id: rule.id,
    key: rule.key,
    enabled: rule.enabled,
    config: normalizeConfig(rule.config),
    checkpoint: normalizeCheckpoint(rule.checkpoint),
    lastObservedAt: rule.lastObservedAt?.toISOString() ?? null,
    lastRunAt: rule.lastRunAt?.toISOString() ?? null,
    lastError: rule.lastError,
  };
}

export async function patchHubSpotBidirectionalRule(
  userId: string,
  patch: HubSpotBidirectionalRulePatch
): Promise<HubSpotBidirectionalRuleState> {
  const current = await getOrCreateHubSpotBidirectionalRule(userId);
  const currentConfig = normalizeConfig(current.config);

  const mergedConfig = patch.config
    ? normalizeConfig({
        ...currentConfig,
        ...patch.config,
      })
    : currentConfig;

  const updated = await prisma.integrationRule.update({
    where: { id: current.id },
    data: {
      enabled: typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
      config: mergedConfig as unknown as Prisma.InputJsonValue,
      lastError: null,
    },
  });

  return serializeHubSpotBidirectionalRule(updated);
}

export async function runHubSpotBidirectionalSync(input: {
  userId: string;
  dryRun?: boolean;
}): Promise<HubSpotBidirectionalRunResult> {
  const rule = await getOrCreateHubSpotBidirectionalRule(input.userId);
  const config = normalizeConfig(rule.config);
  const checkpoint = normalizeCheckpoint(rule.checkpoint);

  if (!rule.enabled) {
    return {
      ruleId: rule.id,
      enabled: false,
      scannedDeals: 0,
      scannedLinkedTasks: 0,
      dealToTaskApplied: 0,
      taskToDealApplied: 0,
      dedupedTransitions: 0,
      conflicts: [],
      drifts: [],
      errors: [],
      checkpoint,
    };
  }

  let accessToken: string;
  try {
    const auth = await extractHubSpotAuth({ userId: input.userId });
    accessToken = auth.accessToken;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markConnectionError(input.userId, message);
    await prisma.integrationRule.update({
      where: { id: rule.id },
      data: {
        lastRunAt: new Date(),
        lastError: message,
      },
    });
    throw error;
  }

  const deals = await listDeals({ accessToken, config });
  const linkedTasksByDeal = await fetchLinkedTasks(input.userId);

  let scannedLinkedTasks = 0;
  for (const tasks of linkedTasksByDeal.values()) {
    scannedLinkedTasks += tasks.length;
  }

  let dealToTaskApplied = 0;
  let taskToDealApplied = 0;
  let dedupedTransitions = 0;
  const conflicts: HubSpotSyncConflict[] = [];
  const drifts: HubSpotSyncDrift[] = [];
  const errors: Array<{ dealId: string | null; taskId: string | null; error: string }> = [];

  const touchedDealIds = new Set<string>();

  for (const deal of deals) {
    const dealStage = deal.properties?.dealstage?.trim() ?? "";
    if (!dealStage) {
      drifts.push({
        dealId: deal.id,
        taskId: null,
        kind: "unmapped_deal_stage",
        detail: "HubSpot deal is missing dealstage",
      });
      continue;
    }

    const dealUpdatedAt = parseDate(deal.properties?.hs_lastmodifieddate);
    const mappedTaskStatus = config.dealStageToTaskStatus[dealStage] ?? null;

    const linkedTasks = linkedTasksByDeal.get(deal.id) ?? [];
    const task = linkedTasks[0] ?? null;

    touchedDealIds.add(deal.id);

    if (!task) {
      drifts.push({
        dealId: deal.id,
        taskId: null,
        kind: "missing_local_task",
        detail: `No local task linked to HubSpot deal ${deal.id}`,
      });
      continue;
    }

    const mappedDealStage = config.taskStatusToDealStage[task.status] ?? null;
    if (!mappedTaskStatus) {
      drifts.push({
        dealId: deal.id,
        taskId: task.id,
        kind: "unmapped_deal_stage",
        detail: `No local status mapping configured for stage ${dealStage}`,
      });
      continue;
    }

    if (!mappedDealStage) {
      drifts.push({
        dealId: deal.id,
        taskId: task.id,
        kind: "unmapped_task_status",
        detail: `No HubSpot stage mapping configured for task status ${task.status}`,
      });
      continue;
    }

    if (task.status === mappedTaskStatus && dealStage === mappedDealStage) {
      continue;
    }

    const winner = chooseConflictWinner({
      resolution: config.conflictResolution,
      dealUpdatedAt,
      taskUpdatedAt: task.updatedAt,
    });

    conflicts.push({
      dealId: deal.id,
      taskId: task.id,
      dealStage,
      mappedTaskStatus,
      taskStatus: task.status,
      mappedDealStage,
      resolution: config.conflictResolution,
      winner: winner.winner,
      reason: winner.reason,
    });

    if (winner.winner === "deal") {
      const dedupeKey = buildDealToTaskDedupeKey({
        taskId: task.id,
        dealId: deal.id,
        targetStatus: mappedTaskStatus,
      });

      const existing = await prisma.integrationReceipt.findUnique({ where: { dedupeKey } });
      if (existing) {
        dedupedTransitions += 1;
        continue;
      }

      if (input.dryRun) {
        dealToTaskApplied += 1;
        continue;
      }

      try {
        await prisma.$transaction(async (transaction) => {
          await transaction.integrationReceipt.create({
            data: {
              ruleId: rule.id,
              dedupeKey,
              externalObjectType: "hubspot_bidirectional_deal_to_task",
              externalObjectId: `${deal.id}:${task.id}`,
              sourceUrl: `https://app.hubspot.com/contacts/record/0-3/${deal.id}`,
              taskId: task.id,
              lastObservedAt: dealUpdatedAt ?? new Date(),
              metadata: {
                direction: "deal_to_task",
                fromStatus: task.status,
                toStatus: mappedTaskStatus,
                fromStage: dealStage,
                strategy: config.conflictResolution,
              },
            },
          });

          const nextColumnOrder = await getNextColumnOrder(
            transaction as unknown as typeof prisma,
            mappedTaskStatus
          );

          await transaction.task.update({
            where: { id: task.id },
            data: {
              status: mappedTaskStatus,
              columnOrder: nextColumnOrder,
              completedOn:
                mappedTaskStatus === "DONE"
                  ? task.completedOn ?? new Date()
                  : task.completedOn,
              statusHistory: {
                create: {
                  fromStatus: task.status,
                  toStatus: mappedTaskStatus,
                  changedBy: input.userId,
                },
              },
              metadata: {
                integration: {
                  provider: "hubspot",
                  externalId: deal.id,
                  externalObjectType: "hubspot_deal",
                  ruleId: rule.id,
                  sourceUrl: `https://app.hubspot.com/contacts/record/0-3/${deal.id}`,
                  lastObservedAt: (dealUpdatedAt ?? new Date()).toISOString(),
                  dedupeKey,
                  direction: "deal_to_task",
                },
              },
            },
          });

          await publishDomainEvent(
            {
              eventType: "integration.hubspot.bidirectional.deal_to_task_applied",
              aggregateType: "integration_rule",
              aggregateId: rule.id,
              payload: {
                dealId: deal.id,
                taskId: task.id,
                fromStatus: task.status,
                toStatus: mappedTaskStatus,
                strategy: config.conflictResolution,
              },
              idempotencyKey: buildOutboxIdempotencyKey({
                aggregateType: "integration_rule",
                aggregateId: rule.id,
                eventType: `hubspot_deal_to_task_${deal.id}_${task.id}_${mappedTaskStatus}`,
              }),
            },
            transaction
          );
        });

        dealToTaskApplied += 1;
      } catch (error) {
        errors.push({
          dealId: deal.id,
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      const dedupeKey = buildTaskToDealDedupeKey({
        taskId: task.id,
        dealId: deal.id,
        targetStage: mappedDealStage,
      });

      const existing = await prisma.integrationReceipt.findUnique({ where: { dedupeKey } });
      if (existing) {
        dedupedTransitions += 1;
        continue;
      }

      if (input.dryRun) {
        taskToDealApplied += 1;
        continue;
      }

      try {
        await updateHubSpotDealStage({
          accessToken,
          dealId: deal.id,
          stageId: mappedDealStage,
        });

        await prisma.$transaction(async (transaction) => {
          await transaction.integrationReceipt.create({
            data: {
              ruleId: rule.id,
              dedupeKey,
              externalObjectType: "hubspot_bidirectional_task_to_deal",
              externalObjectId: `${deal.id}:${task.id}`,
              sourceUrl: `https://app.hubspot.com/contacts/record/0-3/${deal.id}`,
              taskId: task.id,
              lastObservedAt: new Date(),
              metadata: {
                direction: "task_to_deal",
                fromStage: dealStage,
                toStage: mappedDealStage,
                fromStatus: task.status,
                strategy: config.conflictResolution,
              },
            },
          });

          await publishDomainEvent(
            {
              eventType: "integration.hubspot.bidirectional.task_to_deal_applied",
              aggregateType: "integration_rule",
              aggregateId: rule.id,
              payload: {
                dealId: deal.id,
                taskId: task.id,
                fromStage: dealStage,
                toStage: mappedDealStage,
                strategy: config.conflictResolution,
              },
              idempotencyKey: buildOutboxIdempotencyKey({
                aggregateType: "integration_rule",
                aggregateId: rule.id,
                eventType: `hubspot_task_to_deal_${task.id}_${deal.id}_${mappedDealStage}`,
              }),
            },
            transaction
          );
        });

        taskToDealApplied += 1;
      } catch (error) {
        errors.push({
          dealId: deal.id,
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  for (const [dealId, tasks] of linkedTasksByDeal.entries()) {
    if (touchedDealIds.has(dealId)) continue;

    const task = tasks[0] ?? null;
    drifts.push({
      dealId,
      taskId: task?.id ?? null,
      kind: "missing_hubspot_deal",
      detail: `No HubSpot deal found for linked local task(s) on deal ${dealId}`,
    });

    if (!task) continue;
    const mappedDealStage = config.taskStatusToDealStage[task.status] ?? null;
    if (!mappedDealStage) {
      drifts.push({
        dealId,
        taskId: task.id,
        kind: "unmapped_task_status",
        detail: `No HubSpot stage mapping configured for task status ${task.status}`,
      });
    }
  }

  for (const conflict of conflicts) {
    if (input.dryRun) break;

    await publishDomainEvent({
      eventType: "integration.hubspot.bidirectional.conflict_detected",
      aggregateType: "integration_rule",
      aggregateId: rule.id,
      payload: conflict as unknown as Prisma.InputJsonValue,
      idempotencyKey: buildOutboxIdempotencyKey({
        aggregateType: "integration_rule",
        aggregateId: rule.id,
        eventType: `hubspot_conflict_${conflict.dealId}_${conflict.taskId}_${conflict.winner}`,
      }),
    });
  }

  const newestDeal = deals
    .map((deal) => ({
      dealId: deal.id,
      modifiedAt: parseDate(deal.properties?.hs_lastmodifieddate),
    }))
    .filter((item) => item.modifiedAt)
    .sort((a, b) => b.modifiedAt!.getTime() - a.modifiedAt!.getTime())[0];

  let newestTask: LinkedTask | null = null;
  for (const tasks of linkedTasksByDeal.values()) {
    for (const task of tasks) {
      if (!newestTask || task.updatedAt.getTime() > newestTask.updatedAt.getTime()) {
        newestTask = task;
      }
    }
  }

  const checkpointOut: HubSpotCheckpoint = {
    lastDealModifiedAt: newestDeal?.modifiedAt?.toISOString() ?? checkpoint.lastDealModifiedAt,
    lastDealId: newestDeal?.dealId ?? checkpoint.lastDealId,
    lastTaskUpdatedAt: newestTask?.updatedAt.toISOString() ?? checkpoint.lastTaskUpdatedAt,
    lastTaskId: newestTask?.id ?? checkpoint.lastTaskId,
  };

  await prisma.integrationRule.update({
    where: { id: rule.id },
    data: {
      checkpoint: checkpointOut as unknown as Prisma.InputJsonValue,
      lastObservedAt: checkpointOut.lastDealModifiedAt
        ? new Date(checkpointOut.lastDealModifiedAt)
        : rule.lastObservedAt,
      lastRunAt: new Date(),
      lastError: errors.length > 0 ? `${errors.length} sync operation(s) failed` : null,
    },
  });

  await prisma.integrationConnection.updateMany({
    where: {
      userId: input.userId,
      provider: IntegrationProvider.HUBSPOT,
    },
    data: {
      status: errors.length > 0 ? IntegrationConnectionStatus.ERROR : IntegrationConnectionStatus.CONNECTED,
      lastError: errors.length > 0 ? `${errors.length} sync operation(s) failed` : null,
      lastSyncedAt: new Date(),
    },
  });

  return {
    ruleId: rule.id,
    enabled: true,
    scannedDeals: deals.length,
    scannedLinkedTasks,
    dealToTaskApplied,
    taskToDealApplied,
    dedupedTransitions,
    conflicts,
    drifts,
    errors,
    checkpoint: checkpointOut,
  };
}

export { getOrCreateHubSpotBidirectionalRule, parseDealIdFromExternalObjectId };

export const __private__ = {
  normalizeConfig,
  normalizeCheckpoint,
  chooseConflictWinner,
  parseDealIdFromExternalObjectId,
  buildTaskToDealDedupeKey,
  buildDealToTaskDedupeKey,
};
