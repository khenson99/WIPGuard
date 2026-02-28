import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  Prisma,
  type IntegrationConnection,
  type IntegrationRule,
  type TaskStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { protectIntegrationSecret, unprotectIntegrationSecret } from "@/lib/integrations/token-crypto";
import { getNextColumnOrder } from "@/lib/task-order";
import { buildOutboxIdempotencyKey, publishDomainEvent } from "@/lib/event-bus";
import { withRetries } from "@/lib/integrations/with-retries";
import { isCircuitClosed, recordSuccess, recordFailure, CircuitOpenError, getCircuitState } from "@/lib/integrations/circuit-breaker";

export const HUBSPOT_RULE_KEY = "hubspot_stage_transition_checklist";
const HUBSPOT_DEALS_ENDPOINT = "https://api.hubapi.com/crm/v3/objects/deals";
const HUBSPOT_TOKEN_ENDPOINT = "https://api.hubapi.com/oauth/v1/token";

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

interface HubSpotDeal {
  id: string;
  properties?: {
    dealname?: string;
    dealstage?: string;
    pipeline?: string;
    hs_lastmodifieddate?: string;
    hubspot_owner_id?: string;
  };
}

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
      ? Math.max(1, Math.min(200, maxResultsRaw))
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

function parseTokenResponse(raw: unknown): {
  accessToken: string;
  expiresAt: Date | null;
  refreshToken: string | null;
  tokenType: string | null;
} {
  const body = asRecord(raw);
  const accessToken =
    typeof body.access_token === "string" && body.access_token.trim().length > 0
      ? body.access_token.trim()
      : null;

  if (!accessToken) {
    throw new HubSpotIntegrationAuthError("HubSpot token refresh response missing access token");
  }

  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : null;
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : null;
  const tokenType = typeof body.token_type === "string" ? body.token_type : null;

  return { accessToken, expiresAt, refreshToken, tokenType };
}

async function refreshHubSpotAccessToken(connection: IntegrationConnection): Promise<string> {
  const refreshToken = unprotectIntegrationSecret(connection.refreshToken);
  if (!refreshToken) {
    throw new HubSpotIntegrationAuthError("HubSpot refresh token is missing");
  }

  if (!process.env.HUBSPOT_CLIENT_ID || !process.env.HUBSPOT_CLIENT_SECRET) {
    throw new HubSpotIntegrationAuthError("HubSpot OAuth client credentials are missing");
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

  const json = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) {
    const details = asRecord(json);
    const reason =
      (typeof details.error_description === "string" && details.error_description) ||
      (typeof details.error === "string" && details.error) ||
      "HubSpot token refresh failed";
    throw new HubSpotIntegrationAuthError(reason);
  }

  const parsed = parseTokenResponse(json);

  await prisma.integrationConnection.update({
    where: {
      userId_provider: {
        userId: connection.userId,
        provider: IntegrationProvider.HUBSPOT,
      },
    },
    data: {
      accessToken: protectIntegrationSecret(parsed.accessToken),
      refreshToken: protectIntegrationSecret(parsed.refreshToken) ?? connection.refreshToken,
      tokenType: parsed.tokenType ?? connection.tokenType,
      expiresAt: parsed.expiresAt,
      status: IntegrationConnectionStatus.CONNECTED,
      lastError: null,
      lastSyncedAt: new Date(),
    },
  });

  return parsed.accessToken;
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

  if (!connection || connection.status !== IntegrationConnectionStatus.CONNECTED) {
    throw new HubSpotIntegrationAuthError("HubSpot is not connected");
  }

  return connection;
}

async function getValidHubSpotAccessToken(userId: string): Promise<{ accessToken: string; portalId: string | null }> {
  const connection = await getHubSpotConnection(userId);
  const token = unprotectIntegrationSecret(connection.accessToken);
  if (!token) {
    throw new HubSpotIntegrationAuthError("HubSpot access token is missing");
  }

  const portalIdRaw = asRecord(connection.metadata).hubId;
  const portalId =
    typeof portalIdRaw === "number"
      ? String(portalIdRaw)
      : typeof portalIdRaw === "string"
        ? portalIdRaw
        : null;

  const expiresSoon =
    Boolean(connection.expiresAt) && connection.expiresAt!.getTime() <= Date.now() + 60_000;

  if (expiresSoon) {
    const refreshed = await refreshHubSpotAccessToken(connection);
    return { accessToken: refreshed, portalId };
  }

  return { accessToken: token, portalId };
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
    throw new HubSpotIntegrationAuthError("HubSpot access token is invalid or expired");
  }

  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || payload === null) {
    throw new Error(`HubSpot deals API failed (${response.status})`);
  }

  return payload;
}

async function listDeals(input: {
  accessToken: string;
  checkpoint: HubSpotCheckpoint;
  config: HubSpotStageChecklistConfig;
}): Promise<HubSpotDeal[]> {
  const properties = [
    "dealname",
    "dealstage",
    "pipeline",
    "hs_lastmodifieddate",
    "hubspot_owner_id",
  ].join(",");

  let after: string | undefined;
  const deals: HubSpotDeal[] = [];
  const maxPages = 3;

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(HUBSPOT_DEALS_ENDPOINT);
    url.searchParams.set("limit", "100");
    url.searchParams.set("properties", properties);
    if (after) {
      url.searchParams.set("after", after);
    }

    const payload = await hubspotFetchJson<{
      results?: HubSpotDeal[];
      paging?: { next?: { after?: string } };
    }>(input.accessToken, url);

    deals.push(...(payload.results ?? []));

    after = payload.paging?.next?.after;
    if (!after) break;
  }

  const checkpointMs = input.checkpoint.lastModifiedAt
    ? Date.parse(input.checkpoint.lastModifiedAt)
    : Number.NaN;

  const filtered = deals
    .filter((deal) => {
      const stageId = deal.properties?.dealstage;
      const pipelineId = deal.properties?.pipeline;
      if (!stageId || !input.config.stageChecklists[stageId]) {
        return false;
      }

      if (
        input.config.monitoredPipelines.length > 0 &&
        (!pipelineId || !input.config.monitoredPipelines.includes(pipelineId))
      ) {
        return false;
      }

      if (!Number.isFinite(checkpointMs)) {
        return true;
      }

      const modifiedAtRaw = deal.properties?.hs_lastmodifieddate;
      const modifiedAtMs = modifiedAtRaw ? Date.parse(modifiedAtRaw) : Number.NaN;
      return Number.isFinite(modifiedAtMs) ? modifiedAtMs >= checkpointMs - 60_000 : true;
    })
    .sort((a, b) => {
      const left = Date.parse(a.properties?.hs_lastmodifieddate ?? "");
      const right = Date.parse(b.properties?.hs_lastmodifieddate ?? "");
      return (Number.isFinite(left) ? left : 0) - (Number.isFinite(right) ? right : 0);
    })
    .slice(0, input.config.maxResults);

  return filtered;
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
  if (!isCircuitClosed(CB_PROVIDER, input.userId)) {
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

  const deals = await listDeals({
    accessToken,
    checkpoint,
    config,
  });

  let createdTasks = 0;
  let dedupedTasks = 0;
  let failedTasks = 0;
  const tasks: HubSpotCreatedTask[] = [];
  const errors: Array<{ dealId: string; error: string }> = [];

  let newestModifiedAtMs = checkpoint.lastModifiedAt
    ? Date.parse(checkpoint.lastModifiedAt)
    : Number.NaN;
  let newestDealId = checkpoint.lastDealId;

  const status = toSupportedStatus(rule.statusOverride);

  for (const deal of deals) {
    const stageId = deal.properties?.dealstage;
    if (!stageId) continue;

    const template = config.stageChecklists[stageId];
    if (!template) continue;

    const dealName = deal.properties?.dealname?.trim() || `Deal ${deal.id}`;
    const sourceUrl = stageChecklistSourceUrl(portalId, deal.id);
    const modifiedAtMs = Date.parse(deal.properties?.hs_lastmodifieddate ?? "");

    if (Number.isFinite(modifiedAtMs) && (!Number.isFinite(newestModifiedAtMs) || modifiedAtMs > newestModifiedAtMs)) {
      newestModifiedAtMs = modifiedAtMs;
      newestDealId = deal.id;
    }

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

  const checkpointOut: HubSpotCheckpoint = {
    lastModifiedAt: Number.isFinite(newestModifiedAtMs)
      ? new Date(newestModifiedAtMs).toISOString()
      : checkpoint.lastModifiedAt,
    lastDealId: newestDealId,
  };

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
      lastError: errors.length > 0 ? `${errors.length} checklist task(s) failed` : null,
      lastSyncedAt: new Date(),
    },
  });

  _cbSuccess = true;
  return {
    ruleId: rule.id,
    enabled: true,
    scannedDeals: deals.length,
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
