import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  Prisma,
  type IntegrationConnection,
  type IntegrationRule,
  type TaskStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getNextColumnOrder } from "@/lib/task-order";
import { buildOutboxIdempotencyKey, publishDomainEvent } from "@/lib/event-bus";
import { withRetries } from "@/lib/integrations/with-retries";
import { isCircuitClosed, recordSuccess, recordFailure, CircuitOpenError, getCircuitState } from "@/lib/integrations/circuit-breaker";
import { getValidIntegrationAccessToken } from "@/lib/integrations/token-refresh";
import { parseHubSpotDatetimeToMs, searchDealsIncremental, type HubSpotDealSearchResult } from "@/lib/integrations/hubspot-search";

export const HUBSPOT_RULE_KEY = "hubspot_stage_transition_checklist";

type SupportedAutoTaskStatus = "QUEUED" | "ACTIVE" | "NOT_DONE";

export interface HubSpotStageChecklistTemplate {
  stageLabel: string;
  dueInDays: number;
  checklistItems: string[];
}

export interface HubSpotStageChecklistConfig {
  monitoredPipelines: string[];
  maxResults: number;
  stageChecklists: Record<string, HubSpotStageChecklistTemplate>;
}

interface HubSpotCheckpoint {
  lastModifiedAt?: string;
  lastDealId?: string;
}

type HubSpotDeal = HubSpotDealSearchResult;

export interface HubSpotRuleState {
  id: string;
  key: string;
  enabled: boolean;
  statusOverride: SupportedAutoTaskStatus | null;
  config: HubSpotStageChecklistConfig;
  checkpoint: HubSpotCheckpoint;
  lastObservedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface HubSpotRulePatch {
  enabled?: boolean;
  statusOverride?: SupportedAutoTaskStatus | null;
  config?: Partial<HubSpotStageChecklistConfig>;
}

export interface HubSpotCreatedTask {
  dealId: string;
  stageId: string;
  taskId: string;
  title: string;
  sourceUrl: string;
}

export interface HubSpotRunResult {
  ruleId: string;
  enabled: boolean;
  scannedDeals: number;
  createdTasks: number;
  dedupedTasks: number;
  failedTasks: number;
  cursor: HubSpotCheckpoint;
  tasks: HubSpotCreatedTask[];
  errors: Array<{ dealId: string; error: string }>;
}

export class HubSpotIntegrationAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HubSpotIntegrationAuthError";
  }
}

export function defaultHubSpotChecklistConfig(): HubSpotStageChecklistConfig {
  return {
    monitoredPipelines: [],
    maxResults: 50,
    stageChecklists: {
      appointmentscheduled: {
        stageLabel: "Appointment Scheduled",
        dueInDays: 1,
        checklistItems: [
          "Confirm meeting agenda and stakeholders",
          "Prepare discovery brief from account history",
          "Define desired next-step commitment",
        ],
      },
      presentationscheduled: {
        stageLabel: "Presentation Scheduled",
        dueInDays: 2,
        checklistItems: [
          "Customize deck to current deal pain points",
          "Validate ROI assumptions and objections",
          "Pre-draft follow-up email with CTA",
        ],
      },
      contractsent: {
        stageLabel: "Contract Sent",
        dueInDays: 2,
        checklistItems: [
          "Schedule contract review follow-up",
          "Confirm procurement/legal blocker owner",
          "Prepare onboarding kickoff checklist",
        ],
      },
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function parseChecklistTemplate(raw: unknown): HubSpotStageChecklistTemplate | null {
  const input = asRecord(raw);
  const stageLabel =
    typeof input.stageLabel === "string" && input.stageLabel.trim().length > 0
      ? input.stageLabel.trim()
      : null;
  const dueInDays =
    typeof input.dueInDays === "number" && Number.isFinite(input.dueInDays)
      ? Math.max(0, Math.min(30, Math.floor(input.dueInDays)))
      : null;
  const checklistItems = Array.isArray(input.checklistItems)
    ? input.checklistItems.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0
      )
    : [];

  if (!stageLabel || dueInDays === null || checklistItems.length === 0) {
    return null;
  }

  return {
    stageLabel,
    dueInDays,
    checklistItems,
  };
}

function normalizeConfig(raw: unknown): HubSpotStageChecklistConfig {
  const input = asRecord(raw);
  const fallback = defaultHubSpotChecklistConfig();

  const monitoredPipelines = Array.isArray(input.monitoredPipelines)
    ? input.monitoredPipelines.filter(
        (pipeline): pipeline is string =>
          typeof pipeline === "string" && pipeline.trim().length > 0
      )
    : fallback.monitoredPipelines;

  const maxResultsRaw = input.maxResults;
  const maxResults =
    typeof maxResultsRaw === "number" && Number.isInteger(maxResultsRaw)
      ? Math.max(1, Math.min(500, maxResultsRaw))
      : fallback.maxResults;

  const stageChecklistsInput = asRecord(input.stageChecklists);
  const normalizedStageChecklists: Record<string, HubSpotStageChecklistTemplate> = {};

  for (const [stageId, template] of Object.entries(stageChecklistsInput)) {
    const normalized = parseChecklistTemplate(template);
    if (normalized) {
      normalizedStageChecklists[stageId] = normalized;
    }
  }

  if (Object.keys(normalizedStageChecklists).length === 0) {
    return fallback;
  }

  return {
    monitoredPipelines,
    maxResults,
    stageChecklists: normalizedStageChecklists,
  };
}

function normalizeCheckpoint(raw: unknown): HubSpotCheckpoint {
  const input = asRecord(raw);
  const checkpoint: HubSpotCheckpoint = {};

  if (typeof input.lastModifiedAt === "string" && input.lastModifiedAt.length > 0) {
    checkpoint.lastModifiedAt = input.lastModifiedAt;
  }
  if (typeof input.lastDealId === "string" && input.lastDealId.length > 0) {
    checkpoint.lastDealId = input.lastDealId;
  }

  return checkpoint;
}

function toSupportedStatus(value: TaskStatus | null | undefined): SupportedAutoTaskStatus {
  if (value === "ACTIVE" || value === "NOT_DONE") {
    return value;
  }
  return "QUEUED";
}

function toOptionalSupportedStatus(
  value: TaskStatus | null | undefined
): SupportedAutoTaskStatus | null {
  if (!value) return null;
  return toSupportedStatus(value);
}

function stageChecklistSourceUrl(portalId: string | null, dealId: string): string {
  if (!portalId) {
    return `https://app.hubspot.com/contacts/record/0-3/${dealId}`;
  }
  return `https://app.hubspot.com/contacts/${portalId}/record/0-3/${dealId}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function buildHubSpotChecklistDedupeKey(input: {
  dealId: string;
  stageId: string;
  checklistIndex: number;
}): string {
  return [
    "hubspot",
    "hubspot_deal_stage",
    `${input.dealId}:${input.stageId}`,
    `checklist-${input.checklistIndex}`,
  ].join(":");
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

async function getHubSpotConnection(userId: string): Promise<IntegrationConnection> {
  const connection = await prisma.integrationConnection.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: IntegrationProvider.HUBSPOT,
      },
    },
  });

  if (!connection || connection.status === IntegrationConnectionStatus.DISCONNECTED) {
    throw new HubSpotIntegrationAuthError("HubSpot is not connected");
  }

  return connection;
}

async function getValidHubSpotAccessToken(userId: string): Promise<{ accessToken: string; portalId: string | null }> {
  const connection = await getHubSpotConnection(userId);
  const token = await getValidIntegrationAccessToken({
    userId,
    provider: IntegrationProvider.HUBSPOT,
  });

  const portalIdRaw = asRecord(connection.metadata).hubId;
  const portalId =
    typeof portalIdRaw === "number"
      ? String(portalIdRaw)
      : typeof portalIdRaw === "string"
        ? portalIdRaw
        : null;

  return { accessToken: token, portalId };
}

async function listDeals(input: {
  accessToken: string;
  checkpoint: HubSpotCheckpoint;
  config: HubSpotStageChecklistConfig;
}): Promise<{ deals: HubSpotDeal[]; checkpoint: HubSpotCheckpoint }> {
  const properties = [
    "dealname",
    "dealstage",
    "pipeline",
    "hs_lastmodifieddate",
    "hubspot_owner_id",
  ];

  const { deals, checkpoint } = await searchDealsIncremental({
    accessToken: input.accessToken,
    properties,
    monitoredPipelines: input.config.monitoredPipelines,
    monitoredStages: Object.keys(input.config.stageChecklists),
    checkpoint: input.checkpoint,
    maxResults: input.config.maxResults,
    bufferMs: 60_000,
    sortDirection: "ASCENDING",
  });

  return { deals, checkpoint };
}

function checklistTaskTitle(input: {
  dealName: string;
  stageLabel: string;
  checklistItem: string;
}): string {
  return `[HubSpot] ${input.dealName} - ${input.stageLabel}: ${input.checklistItem}`;
}

function checklistTaskNotes(input: {
  dealName: string;
  stageLabel: string;
  sourceUrl: string;
  checklistItem: string;
  ownerId: string | undefined;
}): string {
  const lines = [
    "Created from HubSpot stage transition",
    `Deal: ${input.dealName}`,
    `Stage: ${input.stageLabel}`,
    input.ownerId ? `HubSpot Owner ID: ${input.ownerId}` : null,
    `Source: ${input.sourceUrl}`,
    "",
    `Checklist item: ${input.checklistItem}`,
  ].filter(Boolean);

  return lines.join("\n");
}

async function recordDeadLetterFailure(input: {
  ruleId: string;
  dealId: string;
  error: string;
}): Promise<void> {
  await prisma.outboxEvent.create({
    data: {
      eventType: "integration.hubspot.checklist.failed",
      aggregateType: "integration_rule",
      aggregateId: input.ruleId,
      schemaVersion: 1,
      payload: {
        dealId: input.dealId,
        error: input.error,
      },
      idempotencyKey: `dead-letter:hubspot-checklist:${input.ruleId}:${input.dealId}:${Date.now()}`,
      status: "DEAD_LETTER",
      retryCount: 0,
      nextAttemptAt: new Date(),
      failedAt: new Date(),
      error: input.error,
      lastAttemptAt: new Date(),
    },
  });
}

export async function getOrCreateHubSpotChecklistRule(userId: string): Promise<IntegrationRule> {
  return prisma.integrationRule.upsert({
    where: {
      userId_provider_key: {
        userId,
        provider: IntegrationProvider.HUBSPOT,
        key: HUBSPOT_RULE_KEY,
      },
    },
    update: {},
    create: {
      userId,
      provider: IntegrationProvider.HUBSPOT,
      key: HUBSPOT_RULE_KEY,
      enabled: true,
      statusOverride: null,
      config: defaultHubSpotChecklistConfig() as unknown as Prisma.InputJsonValue,
      checkpoint: {} as unknown as Prisma.InputJsonValue,
    },
  });
}

export function serializeHubSpotRuleState(rule: IntegrationRule): HubSpotRuleState {
  return {
    id: rule.id,
    key: rule.key,
    enabled: rule.enabled,
    statusOverride: toOptionalSupportedStatus(rule.statusOverride),
    config: normalizeConfig(rule.config),
    checkpoint: normalizeCheckpoint(rule.checkpoint),
    lastObservedAt: rule.lastObservedAt?.toISOString() ?? null,
    lastRunAt: rule.lastRunAt?.toISOString() ?? null,
    lastError: rule.lastError,
  };
}

export async function patchHubSpotRule(
  userId: string,
  patch: HubSpotRulePatch
): Promise<HubSpotRuleState> {
  const existing = await getOrCreateHubSpotChecklistRule(userId);
  const baseConfig = normalizeConfig(existing.config);

  const nextConfig = patch.config
    ? normalizeConfig({ ...baseConfig, ...patch.config })
    : baseConfig;

  const updated = await prisma.integrationRule.update({
    where: { id: existing.id },
    data: {
      enabled: typeof patch.enabled === "boolean" ? patch.enabled : existing.enabled,
      statusOverride:
        typeof patch.statusOverride === "undefined"
          ? existing.statusOverride
          : patch.statusOverride,
      config: nextConfig as unknown as Prisma.InputJsonValue,
      lastError: null,
    },
  });

  return serializeHubSpotRuleState(updated);
}

export async function runHubSpotStageChecklist(input: {
  userId: string;
  dryRun?: boolean;
}): Promise<HubSpotRunResult> {
  const rule = await getOrCreateHubSpotChecklistRule(input.userId);
  const config = normalizeConfig(rule.config);
  const checkpoint = normalizeCheckpoint(rule.checkpoint);

  if (!rule.enabled) {
    return {
      ruleId: rule.id,
      enabled: false,
      scannedDeals: 0,
      createdTasks: 0,
      dedupedTasks: 0,
      failedTasks: 0,
      cursor: checkpoint,
      tasks: [],
      errors: [],
    };
  }

  const CB_PROVIDER = "hubspot";
  if (!(await isCircuitClosed(CB_PROVIDER, input.userId))) {
    throw new CircuitOpenError(CB_PROVIDER, input.userId, getCircuitState(CB_PROVIDER, input.userId));
  }
  let _cbSuccess = false;
  try {

  let accessToken: string;
  let portalId: string | null;
  try {
    const authData = await getValidHubSpotAccessToken(input.userId);
    accessToken = authData.accessToken;
    portalId = authData.portalId;
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

  const { deals: dealList, checkpoint: checkpointOut } = await withRetries(() =>
    listDeals({
      accessToken,
      checkpoint,
      config,
    })
  );

  let createdTasks = 0;
  let dedupedTasks = 0;
  let failedTasks = 0;
  const tasks: HubSpotCreatedTask[] = [];
  const errors: Array<{ dealId: string; error: string }> = [];

  const status = toSupportedStatus(rule.statusOverride);

  for (const deal of dealList) {
    const stageId = deal.properties?.dealstage;
    if (!stageId) continue;

    const template = config.stageChecklists[stageId];
    if (!template) continue;

    const dealName = deal.properties?.dealname?.trim() || `Deal ${deal.id}`;
    const sourceUrl = stageChecklistSourceUrl(portalId, deal.id);
    const modifiedAtMs = parseHubSpotDatetimeToMs(deal.properties?.hs_lastmodifieddate) ?? Number.NaN;

    for (let checklistIndex = 0; checklistIndex < template.checklistItems.length; checklistIndex += 1) {
      const checklistItem = template.checklistItems[checklistIndex];
      const dedupeKey = buildHubSpotChecklistDedupeKey({
        dealId: deal.id,
        stageId,
        checklistIndex,
      });

      const title = checklistTaskTitle({
        dealName,
        stageLabel: template.stageLabel,
        checklistItem,
      });

      const notes = checklistTaskNotes({
        dealName,
        stageLabel: template.stageLabel,
        sourceUrl,
        checklistItem,
        ownerId: deal.properties?.hubspot_owner_id,
      });

      const dueDate = addDays(new Date(), template.dueInDays);

      if (input.dryRun) {
        tasks.push({
          dealId: deal.id,
          stageId,
          taskId: "dry-run",
          title,
          sourceUrl,
        });
        continue;
      }

      try {
        const createdTask = await withRetries(async () => {
          try {
            return await prisma.$transaction(async (transaction) => {
              const receipt = await transaction.integrationReceipt.create({
                data: {
                  ruleId: rule.id,
                  dedupeKey,
                  externalObjectType: "hubspot_deal_stage",
                  externalObjectId: `${deal.id}:${stageId}`,
                  sourceUrl,
                  lastObservedAt: Number.isFinite(modifiedAtMs) ? new Date(modifiedAtMs) : new Date(),
                  metadata: {
                    stageId,
                    stageLabel: template.stageLabel,
                    checklistIndex,
                    checklistItem,
                  },
                },
              });

              const nextColumnOrder = await getNextColumnOrder(
                transaction as unknown as typeof prisma,
                status
              );

              const task = await transaction.task.create({
                data: {
                  title,
                  notes,
                  status,
                  dueDate,
                  assignedOn: new Date(),
                  columnOrder: nextColumnOrder,
                  metadata: {
                    integration: {
                      provider: "hubspot",
                      externalId: `${deal.id}:${stageId}`,
                      externalObjectType: "hubspot_deal_stage",
                      ruleId: rule.id,
                      sourceUrl,
                      lastObservedAt: Number.isFinite(modifiedAtMs)
                        ? new Date(modifiedAtMs).toISOString()
                        : new Date().toISOString(),
                      dedupeKey,
                    },
                  },
                  responsible: {
                    connect: [{ id: input.userId }],
                  },
                  statusHistory: {
                    create: {
                      fromStatus: null,
                      toStatus: status,
                      changedBy: input.userId,
                    },
                  },
                },
                select: {
                  id: true,
                  title: true,
                },
              });

              await transaction.integrationReceipt.update({
                where: { id: receipt.id },
                data: {
                  taskId: task.id,
                },
              });

              await publishDomainEvent(
                {
                  eventType: "integration.hubspot.checklist_task_created",
                  aggregateType: "integration_rule",
                  aggregateId: rule.id,
                  payload: {
                    ruleId: rule.id,
                    taskId: task.id,
                    dealId: deal.id,
                    stageId,
                    checklistIndex,
                    sourceUrl,
                  },
                  idempotencyKey: buildOutboxIdempotencyKey({
                    aggregateType: "integration_rule",
                    aggregateId: rule.id,
                    eventType: `hubspot_checklist_created_${deal.id}_${stageId}_${checklistIndex}`,
                  }),
                },
                transaction
              );

              console.info("integration.hubspot.checklist.created", {
                provider: "hubspot",
                ruleId: rule.id,
                externalId: `${deal.id}:${stageId}`,
                taskId: task.id,
              });

              return task;
            });
          } catch (error) {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === "P2002"
            ) {
              return null;
            }
            throw error;
          }
        });

        if (!createdTask) {
          dedupedTasks += 1;
          console.info("integration.hubspot.checklist.deduped", {
            provider: "hubspot",
            ruleId: rule.id,
            externalId: `${deal.id}:${stageId}`,
            dedupeKey,
          });
          continue;
        }

        createdTasks += 1;
        tasks.push({
          dealId: deal.id,
          stageId,
          taskId: createdTask.id,
          title: createdTask.title,
          sourceUrl,
        });
      } catch (error) {
        failedTasks += 1;
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ dealId: deal.id, error: message });

        await recordDeadLetterFailure({
          ruleId: rule.id,
          dealId: deal.id,
          error: message,
        });

        console.error("integration.hubspot.checklist.failed", {
          provider: "hubspot",
          ruleId: rule.id,
          externalId: `${deal.id}:${stageId}`,
          error: message,
        });
      }
    }
  }

  await prisma.integrationRule.update({
    where: { id: rule.id },
    data: {
      checkpoint: checkpointOut as unknown as Prisma.InputJsonValue,
      lastObservedAt: checkpointOut.lastModifiedAt
        ? new Date(checkpointOut.lastModifiedAt)
        : rule.lastObservedAt,
      lastRunAt: new Date(),
      lastError: errors.length > 0 ? `${errors.length} checklist task(s) failed` : null,
    },
  });

  await prisma.integrationConnection.updateMany({
    where: {
      userId: input.userId,
      provider: IntegrationProvider.HUBSPOT,
    },
    data: {
      status: IntegrationConnectionStatus.CONNECTED,
      lastError: null,
      lastSyncedAt: new Date(),
    },
  });

  _cbSuccess = true;
  return {
    ruleId: rule.id,
    enabled: true,
    scannedDeals: dealList.length,
    createdTasks,
    dedupedTasks,
    failedTasks,
    cursor: checkpointOut,
    tasks,
    errors,
  };
  } finally {
    if (_cbSuccess) recordSuccess(CB_PROVIDER, input.userId);
    else recordFailure(CB_PROVIDER, input.userId);
  }
}
