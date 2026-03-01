import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  Prisma,
  Priority,
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

export const HUBSPOT_RISK_RULE_KEY = "hubspot_stale_risk_intervention";
const HUBSPOT_DEALS_ENDPOINT = "https://api.hubapi.com/crm/v3/objects/deals";
const HUBSPOT_OWNERS_ENDPOINT = "https://api.hubapi.com/crm/v3/owners";

type SupportedAutoTaskStatus = "QUEUED" | "ACTIVE" | "NOT_DONE";
type HubSpotRiskVariant = "stale" | "close_date_slip" | "health_drop";
type HubSpotRiskSeverity = "medium" | "high" | "critical";

interface HubSpotRiskTemplate {
  label: string;
  dueInDays: number;
  rescueSteps: string[];
}

export interface HubSpotRiskInterventionConfig {
  monitoredPipelines: string[];
  maxResults: number;
  staleDaysThreshold: number;
  closeDateSlipDays: number;
  healthScoreThreshold: number;
  escalateToActiveRiskTypes: HubSpotRiskVariant[];
}

interface HubSpotRiskCheckpoint {
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
    closedate?: string;
    hs_deal_health_score?: string;
    hs_deal_score?: string;
  };
}

interface HubSpotOwnerResponse {
  id?: string;
  email?: string;
}

interface HubSpotRiskSignal {
  variant: HubSpotRiskVariant;
  severity: HubSpotRiskSeverity;
  reason: string;
}

export interface HubSpotRiskRuleState {
  id: string;
  key: string;
  enabled: boolean;
  statusOverride: SupportedAutoTaskStatus | null;
  config: HubSpotRiskInterventionConfig;
  checkpoint: HubSpotRiskCheckpoint;
  lastObservedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface HubSpotRiskRulePatch {
  enabled?: boolean;
  statusOverride?: SupportedAutoTaskStatus | null;
  config?: Partial<HubSpotRiskInterventionConfig>;
}

export interface HubSpotRiskCreatedTask {
  dealId: string;
  variant: HubSpotRiskVariant;
  taskId: string;
  title: string;
  sourceUrl: string;
}

export interface HubSpotRiskRunResult {
  ruleId: string;
  enabled: boolean;
  scannedDeals: number;
  riskyDeals: number;
  createdTasks: number;
  dedupedTasks: number;
  failedTasks: number;
  cursor: HubSpotRiskCheckpoint;
  tasks: HubSpotRiskCreatedTask[];
  errors: Array<{ dealId: string; variant: HubSpotRiskVariant; error: string }>;
}

export class HubSpotRiskIntegrationAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HubSpotRiskIntegrationAuthError";
  }
}

const RISK_TEMPLATES: Record<HubSpotRiskVariant, HubSpotRiskTemplate> = {
  stale: {
    label: "Deal Stale",
    dueInDays: 1,
    rescueSteps: [
      "Review latest customer touchpoint and blocker.",
      "Send a same-day reactivation message with a concrete next step.",
      "Escalate internally if no response within 24h.",
    ],
  },
  close_date_slip: {
    label: "Close Date Slipped",
    dueInDays: 0,
    rescueSteps: [
      "Re-baseline close plan and update risks in the deal timeline.",
      "Confirm decision process and procurement dependencies.",
      "Book an owner-led recovery call within 24h.",
    ],
  },
  health_drop: {
    label: "Health Score Drop",
    dueInDays: 0,
    rescueSteps: [
      "Audit recent objections and stakeholder sentiment.",
      "Build an intervention plan with owner and manager.",
      "Capture revised action items and due dates in HubSpot.",
    ],
  },
};

export function defaultHubSpotRiskConfig(): HubSpotRiskInterventionConfig {
  return {
    monitoredPipelines: [],
    maxResults: 100,
    staleDaysThreshold: 7,
    closeDateSlipDays: 2,
    healthScoreThreshold: 40,
    escalateToActiveRiskTypes: ["close_date_slip", "health_drop"],
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function toIntegerInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}

function normalizeRiskVariant(value: unknown): HubSpotRiskVariant | null {
  if (value === "stale" || value === "close_date_slip" || value === "health_drop") {
    return value;
  }
  return null;
}

function normalizeConfig(raw: unknown): HubSpotRiskInterventionConfig {
  const input = asRecord(raw);
  const fallback = defaultHubSpotRiskConfig();

  const monitoredPipelines = Array.isArray(input.monitoredPipelines)
    ? input.monitoredPipelines.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0
      )
    : fallback.monitoredPipelines;

  const maxResults = toIntegerInRange(input.maxResults, fallback.maxResults, 1, 300);
  const staleDaysThreshold = toIntegerInRange(
    input.staleDaysThreshold,
    fallback.staleDaysThreshold,
    1,
    120
  );
  const closeDateSlipDays = toIntegerInRange(
    input.closeDateSlipDays,
    fallback.closeDateSlipDays,
    0,
    30
  );
  const healthScoreThreshold = toIntegerInRange(
    input.healthScoreThreshold,
    fallback.healthScoreThreshold,
    0,
    100
  );

  const escalateToActiveRiskTypes = Array.isArray(input.escalateToActiveRiskTypes)
    ? input.escalateToActiveRiskTypes
        .map((value) => normalizeRiskVariant(value))
        .filter((value): value is HubSpotRiskVariant => value !== null)
    : fallback.escalateToActiveRiskTypes;

  return {
    monitoredPipelines,
    maxResults,
    staleDaysThreshold,
    closeDateSlipDays,
    healthScoreThreshold,
    escalateToActiveRiskTypes:
      escalateToActiveRiskTypes.length > 0
        ? Array.from(new Set(escalateToActiveRiskTypes))
        : fallback.escalateToActiveRiskTypes,
  };
}

function normalizeCheckpoint(raw: unknown): HubSpotRiskCheckpoint {
  const input = asRecord(raw);
  const checkpoint: HubSpotRiskCheckpoint = {};

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

function parseNumeric(value: string | undefined): number | null {
  if (!value || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function mapSeverityToPriority(severity: HubSpotRiskSeverity): Priority {
  if (severity === "critical") return Priority.P0;
  if (severity === "high") return Priority.P1;
  return Priority.P2;
}

function hubspotDealSourceUrl(portalId: string | null, dealId: string): string {
  if (!portalId) {
    return `https://app.hubspot.com/contacts/record/0-3/${dealId}`;
  }
  return `https://app.hubspot.com/contacts/${portalId}/record/0-3/${dealId}`;
}

function riskSignalLabel(variant: HubSpotRiskVariant): string {
  return RISK_TEMPLATES[variant].label;
}

function detectDealRisks(
  deal: HubSpotDeal,
  now: Date,
  config: HubSpotRiskInterventionConfig
): HubSpotRiskSignal[] {
  const signals: HubSpotRiskSignal[] = [];

  const lastModified = parseDate(deal.properties?.hs_lastmodifieddate);
  if (lastModified) {
    const staleMs = config.staleDaysThreshold * 24 * 60 * 60 * 1000;
    if (now.getTime() - lastModified.getTime() >= staleMs) {
      signals.push({
        variant: "stale",
        severity: "medium",
        reason: `No deal activity for at least ${config.staleDaysThreshold} day(s).`,
      });
    }
  }

  const closeDate = parseDate(deal.properties?.closedate);
  if (closeDate) {
    const allowedSlipMs = config.closeDateSlipDays * 24 * 60 * 60 * 1000;
    if (now.getTime() - closeDate.getTime() > allowedSlipMs) {
      signals.push({
        variant: "close_date_slip",
        severity: "high",
        reason: `Close date is overdue by more than ${config.closeDateSlipDays} day(s).`,
      });
    }
  }

  const healthScore =
    parseNumeric(deal.properties?.hs_deal_health_score) ??
    parseNumeric(deal.properties?.hs_deal_score);
  if (healthScore !== null && healthScore <= config.healthScoreThreshold) {
    signals.push({
      variant: "health_drop",
      severity: "critical",
      reason: `Deal health score (${healthScore}) is at/below threshold (${config.healthScoreThreshold}).`,
    });
  }

  return signals;
}

export function buildHubSpotRiskDedupeKey(input: {
  dealId: string;
  variant: HubSpotRiskVariant;
  severity: HubSpotRiskSeverity;
}): string {
  return [
    "hubspot",
    "hubspot_deal_risk",
    `${input.dealId}:${input.variant}`,
    `severity-${input.severity}`,
  ].join(":");
}

function chooseStatusForRisk(input: {
  configuredOverride: TaskStatus | null;
  config: HubSpotRiskInterventionConfig;
  variant: HubSpotRiskVariant;
}): SupportedAutoTaskStatus {
  if (input.configuredOverride) {
    return toSupportedStatus(input.configuredOverride);
  }

  if (input.config.escalateToActiveRiskTypes.includes(input.variant)) {
    return "ACTIVE";
  }

  return "QUEUED";
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildTaskTitle(input: {
  dealName: string;
  variant: HubSpotRiskVariant;
}): string {
  return `[HubSpot Risk] ${input.dealName} - ${riskSignalLabel(input.variant)}`;
}

function buildTaskNotes(input: {
  dealName: string;
  stageId: string | null;
  ownerId: string | null;
  ownerEmail: string | null;
  sourceUrl: string;
  signal: HubSpotRiskSignal;
}): string {
  const template = RISK_TEMPLATES[input.signal.variant];
  const steps = template.rescueSteps.map((step, index) => `${index + 1}. ${step}`).join("\n");

  const lines = [
    "Created from HubSpot risk intervention automation.",
    `Risk: ${template.label}`,
    `Severity: ${input.signal.severity}`,
    `Reason: ${input.signal.reason}`,
    `Deal: ${input.dealName}`,
    input.stageId ? `Stage ID: ${input.stageId}` : null,
    input.ownerId ? `HubSpot Owner ID: ${input.ownerId}` : null,
    input.ownerEmail ? `Mapped Owner Email: ${input.ownerEmail}` : null,
    `Source: ${input.sourceUrl}`,
    "",
    "Rescue playbook:",
    steps,
  ].filter(Boolean);

  return lines.join("\n");
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

  if (!connection || connection.status !== IntegrationConnectionStatus.CONNECTED) {
    throw new HubSpotRiskIntegrationAuthError("HubSpot is not connected");
  }

  return connection;
}

async function getValidHubSpotAccessToken(
  userId: string
): Promise<{ accessToken: string; portalId: string | null }> {
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

async function hubspotFetchJson<T>(accessToken: string, url: URL): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new HubSpotRiskIntegrationAuthError("HubSpot access token is invalid or expired");
  }

  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || payload === null) {
    throw new Error(`HubSpot API failed (${response.status})`);
  }

  return payload;
}

async function listDeals(input: {
  accessToken: string;
  config: HubSpotRiskInterventionConfig;
}): Promise<HubSpotDeal[]> {
  const properties = [
    "dealname",
    "dealstage",
    "pipeline",
    "hs_lastmodifieddate",
    "hubspot_owner_id",
    "closedate",
    "hs_deal_health_score",
    "hs_deal_score",
  ].join(",");

  let after: string | undefined;
  const deals: HubSpotDeal[] = [];
  const maxPages = 5;

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

  const filtered = deals.filter((deal) => {
    const pipelineId = deal.properties?.pipeline;

    if (
      input.config.monitoredPipelines.length > 0 &&
      (!pipelineId || !input.config.monitoredPipelines.includes(pipelineId))
    ) {
      return false;
    }

    return true;
  });

  return filtered.slice(0, input.config.maxResults);
}

async function fetchOwnerEmail(
  accessToken: string,
  ownerId: string,
  cache: Map<string, string | null>
): Promise<string | null> {
  if (cache.has(ownerId)) {
    return cache.get(ownerId) ?? null;
  }

  const url = new URL(`${HUBSPOT_OWNERS_ENDPOINT}/${encodeURIComponent(ownerId)}`);
  url.searchParams.set("idProperty", "id");

  const payload = await hubspotFetchJson<HubSpotOwnerResponse>(accessToken, url);
  const email = typeof payload.email === "string" && payload.email.length > 0 ? payload.email : null;

  cache.set(ownerId, email);
  return email;
}

async function findAssigneeByEmail(fallbackUserId: string, email: string | null): Promise<string> {
  if (!email) {
    return fallbackUserId;
  }

  const matched = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  return matched?.id ?? fallbackUserId;
}

async function resolveAssignee(input: {
  fallbackUserId: string;
  ownerId: string | null;
  accessToken: string;
  ownerCache: Map<string, string | null>;
}): Promise<{ assigneeId: string; ownerEmail: string | null }> {
  if (!input.ownerId) {
    return { assigneeId: input.fallbackUserId, ownerEmail: null };
  }

  const ownerEmail = await withRetries(() =>
    fetchOwnerEmail(input.accessToken, input.ownerId!, input.ownerCache)
  );

  const assigneeId = await findAssigneeByEmail(input.fallbackUserId, ownerEmail);
  return {
    assigneeId,
    ownerEmail,
  };
}

async function recordDeadLetterFailure(input: {
  ruleId: string;
  dealId: string;
  variant: HubSpotRiskVariant;
  error: string;
}): Promise<void> {
  await prisma.outboxEvent.create({
    data: {
      eventType: "integration.hubspot.risk.failed",
      aggregateType: "integration_rule",
      aggregateId: input.ruleId,
      schemaVersion: 1,
      payload: {
        dealId: input.dealId,
        variant: input.variant,
        error: input.error,
      },
      idempotencyKey: `dead-letter:hubspot-risk:${input.ruleId}:${input.dealId}:${input.variant}:${Date.now()}`,
      status: "DEAD_LETTER",
      retryCount: 0,
      nextAttemptAt: new Date(),
      failedAt: new Date(),
      error: input.error,
      lastAttemptAt: new Date(),
    },
  });
}

export async function getOrCreateHubSpotRiskRule(userId: string): Promise<IntegrationRule> {
  return prisma.integrationRule.upsert({
    where: {
      userId_provider_key: {
        userId,
        provider: IntegrationProvider.HUBSPOT,
        key: HUBSPOT_RISK_RULE_KEY,
      },
    },
    update: {},
    create: {
      userId,
      provider: IntegrationProvider.HUBSPOT,
      key: HUBSPOT_RISK_RULE_KEY,
      enabled: true,
      statusOverride: null,
      config: defaultHubSpotRiskConfig() as unknown as Prisma.InputJsonValue,
      checkpoint: {} as unknown as Prisma.InputJsonValue,
    },
  });
}

export function serializeHubSpotRiskRule(rule: IntegrationRule): HubSpotRiskRuleState {
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

export async function patchHubSpotRiskRule(
  userId: string,
  patch: HubSpotRiskRulePatch
): Promise<HubSpotRiskRuleState> {
  const existing = await getOrCreateHubSpotRiskRule(userId);
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

  return serializeHubSpotRiskRule(updated);
}

export async function runHubSpotRiskIntervention(input: {
  userId: string;
  dryRun?: boolean;
}): Promise<HubSpotRiskRunResult> {
  const rule = await getOrCreateHubSpotRiskRule(input.userId);
  const config = normalizeConfig(rule.config);
  const checkpoint = normalizeCheckpoint(rule.checkpoint);

  if (!rule.enabled) {
    return {
      ruleId: rule.id,
      enabled: false,
      scannedDeals: 0,
      riskyDeals: 0,
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

  const deals = await withRetries(() => listDeals({ accessToken, config }));
  const now = new Date();

  let riskyDeals = 0;
  let createdTasks = 0;
  let dedupedTasks = 0;
  let failedTasks = 0;
  const tasks: HubSpotRiskCreatedTask[] = [];
  const errors: Array<{ dealId: string; variant: HubSpotRiskVariant; error: string }> = [];

  let newestModifiedAtMs = checkpoint.lastModifiedAt
    ? Date.parse(checkpoint.lastModifiedAt)
    : Number.NaN;
  let newestDealId = checkpoint.lastDealId;

  const ownerCache = new Map<string, string | null>();

  for (const deal of deals) {
    const modifiedAtMs = Date.parse(deal.properties?.hs_lastmodifieddate ?? "");
    if (
      Number.isFinite(modifiedAtMs) &&
      (!Number.isFinite(newestModifiedAtMs) || modifiedAtMs > newestModifiedAtMs)
    ) {
      newestModifiedAtMs = modifiedAtMs;
      newestDealId = deal.id;
    }

    const riskSignals = detectDealRisks(deal, now, config);
    if (riskSignals.length === 0) {
      continue;
    }

    riskyDeals += 1;

    const dealName = deal.properties?.dealname?.trim() || `Deal ${deal.id}`;
    const sourceUrl = hubspotDealSourceUrl(portalId, deal.id);

    for (const signal of riskSignals) {
      const priority = mapSeverityToPriority(signal.severity);
      const status = chooseStatusForRisk({
        configuredOverride: rule.statusOverride,
        config,
        variant: signal.variant,
      });
      const dueDate = addDays(now, RISK_TEMPLATES[signal.variant].dueInDays);

      const dedupeKey = buildHubSpotRiskDedupeKey({
        dealId: deal.id,
        variant: signal.variant,
        severity: signal.severity,
      });

      const ownerId = deal.properties?.hubspot_owner_id ?? null;

      if (input.dryRun) {
        tasks.push({
          dealId: deal.id,
          variant: signal.variant,
          taskId: "dry-run",
          title: buildTaskTitle({ dealName, variant: signal.variant }),
          sourceUrl,
        });
        continue;
      }

      try {
        const { assigneeId, ownerEmail } = await resolveAssignee({
          fallbackUserId: input.userId,
          ownerId,
          accessToken,
          ownerCache,
        });

        const createdTask = await withRetries(async () => {
          try {
            return await prisma.$transaction(async (transaction) => {
              const receipt = await transaction.integrationReceipt.create({
                data: {
                  ruleId: rule.id,
                  dedupeKey,
                  externalObjectType: "hubspot_deal_risk",
                  externalObjectId: `${deal.id}:${signal.variant}`,
                  sourceUrl,
                  lastObservedAt: Number.isFinite(modifiedAtMs)
                    ? new Date(modifiedAtMs)
                    : new Date(),
                  metadata: {
                    variant: signal.variant,
                    severity: signal.severity,
                    reason: signal.reason,
                  },
                },
              });

              const nextColumnOrder = await getNextColumnOrder(
                transaction as unknown as typeof prisma,
                status
              );

              const task = await transaction.task.create({
                data: {
                  title: buildTaskTitle({ dealName, variant: signal.variant }),
                  notes: buildTaskNotes({
                    dealName,
                    stageId: deal.properties?.dealstage ?? null,
                    ownerId,
                    ownerEmail,
                    sourceUrl,
                    signal,
                  }),
                  status,
                  priority,
                  dueDate,
                  assignedOn: new Date(),
                  columnOrder: nextColumnOrder,
                  metadata: {
                    integration: {
                      provider: "hubspot",
                      externalId: `${deal.id}:${signal.variant}`,
                      externalObjectType: "hubspot_deal_risk",
                      ruleId: rule.id,
                      sourceUrl,
                      lastObservedAt: Number.isFinite(modifiedAtMs)
                        ? new Date(modifiedAtMs).toISOString()
                        : new Date().toISOString(),
                      dedupeKey,
                    },
                    risk: {
                      variant: signal.variant,
                      severity: signal.severity,
                      reason: signal.reason,
                    },
                  },
                  responsible: {
                    connect: [{ id: assigneeId }],
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
                  eventType: "integration.hubspot.risk_task_created",
                  aggregateType: "integration_rule",
                  aggregateId: rule.id,
                  payload: {
                    ruleId: rule.id,
                    taskId: task.id,
                    dealId: deal.id,
                    variant: signal.variant,
                    severity: signal.severity,
                    sourceUrl,
                  },
                  idempotencyKey: buildOutboxIdempotencyKey({
                    aggregateType: "integration_rule",
                    aggregateId: rule.id,
                    eventType: `hubspot_risk_created_${deal.id}_${signal.variant}`,
                  }),
                },
                transaction
              );

              console.info("integration.hubspot.risk.created", {
                provider: "hubspot",
                ruleId: rule.id,
                externalId: `${deal.id}:${signal.variant}`,
                taskId: task.id,
                severity: signal.severity,
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
          console.info("integration.hubspot.risk.deduped", {
            provider: "hubspot",
            ruleId: rule.id,
            externalId: `${deal.id}:${signal.variant}`,
            dedupeKey,
          });
          continue;
        }

        createdTasks += 1;
        tasks.push({
          dealId: deal.id,
          variant: signal.variant,
          taskId: createdTask.id,
          title: createdTask.title,
          sourceUrl,
        });
      } catch (error) {
        failedTasks += 1;
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ dealId: deal.id, variant: signal.variant, error: message });

        await recordDeadLetterFailure({
          ruleId: rule.id,
          dealId: deal.id,
          variant: signal.variant,
          error: message,
        });

        console.error("integration.hubspot.risk.failed", {
          provider: "hubspot",
          ruleId: rule.id,
          externalId: `${deal.id}:${signal.variant}`,
          error: message,
        });
      }
    }
  }

  const checkpointOut: HubSpotRiskCheckpoint = {
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
      lastError: errors.length > 0 ? `${errors.length} risk task(s) failed` : null,
    },
  });

  await prisma.integrationConnection.updateMany({
    where: {
      userId: input.userId,
      provider: IntegrationProvider.HUBSPOT,
    },
    data: {
      status: IntegrationConnectionStatus.CONNECTED,
      lastError: errors.length > 0 ? `${errors.length} risk task(s) failed` : null,
      lastSyncedAt: new Date(),
    },
  });

  _cbSuccess = true;
  return {
    ruleId: rule.id,
    enabled: true,
    scannedDeals: deals.length,
    riskyDeals,
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
