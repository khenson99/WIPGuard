import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  Prisma,
  type IntegrationRule,
  type TaskStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { unprotectIntegrationSecret } from "@/lib/integrations/token-crypto";
import { getNextColumnOrder } from "@/lib/task-order";
import { buildOutboxIdempotencyKey, publishDomainEvent } from "@/lib/event-bus";
import { computeRetryDelayMs } from "@/lib/outbox-worker";

export const CODA_DEPENDENCY_GATE_RULE_KEY = "coda_dependency_gate_automation";

type SupportedAutoTaskStatus = "QUEUED" | "ACTIVE" | "NOT_DONE";
type GateAction = "advance" | "block";

export interface CodaDependencyGateConfig {
  docId: string;
  tableId: string;
  taskIdColumn: string;
  gateStatusColumn: string;
  prerequisiteColumn: string;
  blockerColumn: string;
  reasonColumn: string;
  maxRows: number;
  advanceStates: string[];
  blockedStates: string[];
  advanceToStatus: SupportedAutoTaskStatus;
  blockedToStatus: SupportedAutoTaskStatus;
}

interface CodaDependencyCheckpoint {
  lastUpdatedAt?: string;
  lastRowId?: string;
}

interface CodaRow {
  id: string;
  browserLink?: string;
  createdAt?: string;
  updatedAt?: string;
  values?: Record<string, unknown>;
}

interface CodaRowsResponse {
  items?: CodaRow[];
  nextPageToken?: string;
}

interface CodaDependencySignal {
  rowId: string;
  taskId: string;
  action: GateAction;
  targetStatus: SupportedAutoTaskStatus;
  gateState: string;
  reason: string;
  sourceUrl: string;
  observedAt: Date;
}

export interface CodaDependencyRuleState {
  id: string;
  key: string;
  enabled: boolean;
  statusOverride: SupportedAutoTaskStatus | null;
  config: CodaDependencyGateConfig;
  checkpoint: CodaDependencyCheckpoint;
  lastObservedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface CodaDependencyRulePatch {
  enabled?: boolean;
  statusOverride?: SupportedAutoTaskStatus | null;
  config?: Partial<CodaDependencyGateConfig>;
}

export interface CodaDependencyTransition {
  rowId: string;
  taskId: string;
  taskTitle: string;
  action: GateAction;
  status: SupportedAutoTaskStatus;
  sourceUrl: string;
  operation: "status_changed" | "metadata_refreshed";
}

export interface CodaDependencyRunResult {
  ruleId: string;
  enabled: boolean;
  scannedRows: number;
  evaluatedRows: number;
  appliedTransitions: number;
  dedupedTransitions: number;
  failedRows: number;
  cursor: CodaDependencyCheckpoint;
  transitions: CodaDependencyTransition[];
  errors: Array<{ rowId: string; taskId: string; error: string }>;
}

class CodaIntegrationAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodaIntegrationAuthError";
  }
}

export function defaultCodaDependencyGateConfig(): CodaDependencyGateConfig {
  return {
    docId: process.env.CODA_DOC_ID?.trim() ?? "",
    tableId: process.env.CODA_DEPENDENCY_TABLE_ID?.trim() ?? process.env.CODA_TABLE_ID?.trim() ?? "",
    taskIdColumn: "taskId",
    gateStatusColumn: "gateStatus",
    prerequisiteColumn: "prerequisitesComplete",
    blockerColumn: "blockers",
    reasonColumn: "notes",
    maxRows: 200,
    advanceStates: ["ready", "complete", "completed", "passed", "pass"],
    blockedStates: ["blocked", "fail", "failed", "regressed", "regression"],
    advanceToStatus: "ACTIVE",
    blockedToStatus: "NOT_DONE",
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeStatus(value: unknown, fallback: SupportedAutoTaskStatus): SupportedAutoTaskStatus {
  if (value === "QUEUED" || value === "ACTIVE" || value === "NOT_DONE") {
    return value;
  }
  return fallback;
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);

  if (normalized.length === 0) {
    return fallback;
  }

  return Array.from(new Set(normalized));
}

function normalizeConfig(raw: unknown): CodaDependencyGateConfig {
  const input = asRecord(raw);
  const fallback = defaultCodaDependencyGateConfig();

  const docId = typeof input.docId === "string" ? input.docId.trim() : fallback.docId;
  const tableId = typeof input.tableId === "string" ? input.tableId.trim() : fallback.tableId;

  const taskIdColumn =
    typeof input.taskIdColumn === "string" && input.taskIdColumn.trim().length > 0
      ? input.taskIdColumn.trim()
      : fallback.taskIdColumn;

  const gateStatusColumn =
    typeof input.gateStatusColumn === "string" && input.gateStatusColumn.trim().length > 0
      ? input.gateStatusColumn.trim()
      : fallback.gateStatusColumn;

  const prerequisiteColumn =
    typeof input.prerequisiteColumn === "string" && input.prerequisiteColumn.trim().length > 0
      ? input.prerequisiteColumn.trim()
      : fallback.prerequisiteColumn;

  const blockerColumn =
    typeof input.blockerColumn === "string" && input.blockerColumn.trim().length > 0
      ? input.blockerColumn.trim()
      : fallback.blockerColumn;

  const reasonColumn =
    typeof input.reasonColumn === "string" && input.reasonColumn.trim().length > 0
      ? input.reasonColumn.trim()
      : fallback.reasonColumn;

  const maxRows =
    typeof input.maxRows === "number" && Number.isInteger(input.maxRows)
      ? Math.max(1, Math.min(500, input.maxRows))
      : fallback.maxRows;

  const advanceStates = normalizeStringArray(input.advanceStates, fallback.advanceStates);
  const blockedStates = normalizeStringArray(input.blockedStates, fallback.blockedStates);

  const advanceToStatus = normalizeStatus(input.advanceToStatus, fallback.advanceToStatus);
  const blockedToStatus = normalizeStatus(input.blockedToStatus, fallback.blockedToStatus);

  return {
    docId,
    tableId,
    taskIdColumn,
    gateStatusColumn,
    prerequisiteColumn,
    blockerColumn,
    reasonColumn,
    maxRows,
    advanceStates,
    blockedStates,
    advanceToStatus,
    blockedToStatus,
  };
}

function normalizeCheckpoint(raw: unknown): CodaDependencyCheckpoint {
  const input = asRecord(raw);
  const checkpoint: CodaDependencyCheckpoint = {};

  if (typeof input.lastUpdatedAt === "string" && input.lastUpdatedAt.length > 0) {
    checkpoint.lastUpdatedAt = input.lastUpdatedAt;
  }
  if (typeof input.lastRowId === "string" && input.lastRowId.length > 0) {
    checkpoint.lastRowId = input.lastRowId;
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

function normalizeCellText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeCellText(item)).filter(Boolean).join(" ").trim();
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidate =
      (typeof record.name === "string" && record.name) ||
      (typeof record.title === "string" && record.title) ||
      (typeof record.value === "string" && record.value) ||
      (typeof record.text === "string" && record.text) ||
      "";
    return candidate.trim();
  }

  return "";
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  const text = normalizeCellText(value).toLowerCase();
  if (text.length === 0) {
    return null;
  }

  if (["true", "yes", "y", "done", "complete", "completed", "pass", "passed"].includes(text)) {
    return true;
  }

  if (["false", "no", "n", "incomplete", "blocked", "fail", "failed"].includes(text)) {
    return false;
  }

  return null;
}

function normalizeList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeCellText(item))
      .flatMap((text) => text.split(/\n|;/g))
      .map((item) => item.replace(/^[-*\d.)\s]+/, "").trim())
      .filter((item) => item.length > 0);
  }

  const single = normalizeCellText(value);
  if (single.length === 0) {
    return [];
  }

  return single
    .split(/\n|;/g)
    .map((item) => item.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((item) => item.length > 0);
}

function parseTaskId(value: unknown): string | null {
  const raw = normalizeCellText(value);
  if (raw.length === 0) {
    return null;
  }

  try {
    const url = new URL(raw);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      const tail = segments[segments.length - 1];
      if (tail.length > 0) {
        return tail;
      }
    }
  } catch {
    // not a URL
  }

  return raw;
}

function buildCodaDependencyExternalId(rowId: string, taskId: string): string {
  return `${rowId}:${taskId}`;
}

export function buildCodaDependencyGateDedupeKey(input: {
  externalObjectId: string;
  ruleVariant: string;
}): string {
  return ["coda", "coda_dependency_gate", input.externalObjectId, input.ruleVariant].join(":");
}

function buildCodaFallbackRowUrl(config: CodaDependencyGateConfig, rowId: string): string {
  return `https://coda.io/d/${config.docId}/_su${rowId}`;
}

function filterRowsByCheckpoint(rows: CodaRow[], checkpoint: CodaDependencyCheckpoint): CodaRow[] {
  const checkpointMs = checkpoint.lastUpdatedAt ? Date.parse(checkpoint.lastUpdatedAt) : Number.NaN;

  return rows
    .filter((row) => {
      if (!Number.isFinite(checkpointMs)) return true;
      const updatedAtMs = row.updatedAt ? Date.parse(row.updatedAt) : Number.NaN;
      return Number.isFinite(updatedAtMs) ? updatedAtMs >= checkpointMs - 60_000 : true;
    })
    .sort((a, b) => {
      const left = Date.parse(a.updatedAt ?? "");
      const right = Date.parse(b.updatedAt ?? "");
      return (Number.isFinite(left) ? left : 0) - (Number.isFinite(right) ? right : 0);
    });
}

function deriveDependencySignal(input: {
  row: CodaRow;
  config: CodaDependencyGateConfig;
  ruleStatusOverride: TaskStatus | null;
  sourceUrl: string;
}): CodaDependencySignal | null {
  const taskId = parseTaskId(input.row.values?.[input.config.taskIdColumn]);
  if (!taskId) {
    return null;
  }

  const updatedAt = input.row.updatedAt ? new Date(input.row.updatedAt) : new Date();
  if (Number.isNaN(updatedAt.getTime())) {
    return null;
  }

  const gateStatus = normalizeCellText(input.row.values?.[input.config.gateStatusColumn]).toLowerCase();
  const prerequisites = normalizeBoolean(input.row.values?.[input.config.prerequisiteColumn]);
  const blockers = normalizeList(input.row.values?.[input.config.blockerColumn]);
  const reasonCell = normalizeCellText(input.row.values?.[input.config.reasonColumn]);

  const shouldBlock =
    blockers.length > 0 ||
    (gateStatus.length > 0 && input.config.blockedStates.includes(gateStatus)) ||
    prerequisites === false;

  if (shouldBlock) {
    const reason =
      blockers.length > 0
        ? `Dependency blockers detected: ${blockers.join("; ")}`
        : gateStatus.length > 0
          ? `Gate state '${gateStatus}' indicates a blocked/regressed dependency state.`
          : "Dependency prerequisites are incomplete.";

    return {
      rowId: input.row.id,
      taskId,
      action: "block",
      targetStatus: input.config.blockedToStatus,
      gateState: gateStatus || "blocked",
      reason: reasonCell ? `${reason} Context: ${reasonCell}` : reason,
      sourceUrl: input.sourceUrl,
      observedAt: updatedAt,
    };
  }

  const shouldAdvance =
    (gateStatus.length > 0 && input.config.advanceStates.includes(gateStatus)) ||
    prerequisites === true;

  if (shouldAdvance) {
    const targetStatus = input.ruleStatusOverride
      ? toSupportedStatus(input.ruleStatusOverride)
      : input.config.advanceToStatus;

    const reason =
      gateStatus.length > 0
        ? `Dependency gate state '${gateStatus}' satisfied advance conditions.`
        : "Dependency prerequisites satisfied.";

    return {
      rowId: input.row.id,
      taskId,
      action: "advance",
      targetStatus,
      gateState: gateStatus || "ready",
      reason: reasonCell ? `${reason} Context: ${reasonCell}` : reason,
      sourceUrl: input.sourceUrl,
      observedAt: updatedAt,
    };
  }

  return null;
}

function mergeMetadata(
  existing: Prisma.JsonValue | null,
  integrationPatch: Record<string, unknown>,
  dependencyGatePatch: Record<string, unknown>
): Prisma.InputJsonValue {
  const base = asRecord(existing);
  const next = {
    ...base,
    integration: {
      ...asRecord(base.integration),
      ...integrationPatch,
    },
    dependencyGate: {
      ...asRecord(base.dependencyGate),
      ...dependencyGatePatch,
    },
  };

  return next as Prisma.InputJsonValue;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        throw error;
      }

      const waitMs = computeRetryDelayMs(attempt, {
        baseDelayMs: 250,
        maxDelayMs: 3000,
      });
      await sleep(waitMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown retry failure");
}

async function markConnectionError(userId: string, message: string): Promise<void> {
  await prisma.integrationConnection.updateMany({
    where: {
      userId,
      provider: IntegrationProvider.CODA,
    },
    data: {
      status: IntegrationConnectionStatus.ERROR,
      lastError: message,
      lastSyncedAt: null,
    },
  });
}

async function getCodaAccessToken(userId: string): Promise<string> {
  const connection = await prisma.integrationConnection.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: IntegrationProvider.CODA,
      },
    },
  });

  if (!connection || connection.status !== IntegrationConnectionStatus.CONNECTED) {
    throw new CodaIntegrationAuthError("Coda is not connected");
  }

  const token = unprotectIntegrationSecret(connection.accessToken);
  if (!token) {
    throw new CodaIntegrationAuthError("Coda access token is missing");
  }

  return token;
}

async function codaFetchRows(input: {
  token: string;
  config: CodaDependencyGateConfig;
}): Promise<CodaRow[]> {
  let pageToken: string | null = null;
  const rows: CodaRow[] = [];

  while (rows.length < input.config.maxRows) {
    const url = new URL(
      `https://coda.io/apis/v1/docs/${encodeURIComponent(input.config.docId)}/tables/${encodeURIComponent(
        input.config.tableId
      )}/rows`
    );
    url.searchParams.set("useColumnNames", "true");
    url.searchParams.set("limit", String(Math.min(100, input.config.maxRows - rows.length)));

    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (response.status === 401 || response.status === 403) {
      throw new CodaIntegrationAuthError("Coda token is invalid or expired");
    }

    const payload = (await response.json().catch(() => null)) as CodaRowsResponse | null;
    if (!response.ok || !payload) {
      throw new Error(`Coda rows API failed (${response.status})`);
    }

    rows.push(...(payload.items ?? []));

    pageToken = payload.nextPageToken ?? null;
    if (!pageToken) {
      break;
    }
  }

  return rows;
}

async function recordDeadLetterFailure(input: {
  ruleId: string;
  rowId: string;
  taskId: string;
  error: string;
}): Promise<void> {
  await prisma.outboxEvent.create({
    data: {
      eventType: "integration.coda.dependency_gate.failed",
      aggregateType: "integration_rule",
      aggregateId: input.ruleId,
      schemaVersion: 1,
      payload: {
        rowId: input.rowId,
        taskId: input.taskId,
        error: input.error,
      },
      idempotencyKey: `dead-letter:coda-dependency-gate:${input.ruleId}:${input.rowId}:${input.taskId}:${Date.now()}`,
      status: "DEAD_LETTER",
      retryCount: 0,
      nextAttemptAt: new Date(),
      failedAt: new Date(),
      error: input.error,
      lastAttemptAt: new Date(),
    },
  });
}

export async function getOrCreateCodaDependencyGateRule(userId: string): Promise<IntegrationRule> {
  return prisma.integrationRule.upsert({
    where: {
      userId_provider_key: {
        userId,
        provider: IntegrationProvider.CODA,
        key: CODA_DEPENDENCY_GATE_RULE_KEY,
      },
    },
    update: {},
    create: {
      userId,
      provider: IntegrationProvider.CODA,
      key: CODA_DEPENDENCY_GATE_RULE_KEY,
      enabled: true,
      statusOverride: null,
      config: defaultCodaDependencyGateConfig() as unknown as Prisma.InputJsonValue,
      checkpoint: {} as unknown as Prisma.InputJsonValue,
    },
  });
}

export function serializeCodaDependencyGateRule(rule: IntegrationRule): CodaDependencyRuleState {
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

export async function patchCodaDependencyGateRule(
  userId: string,
  patch: CodaDependencyRulePatch
): Promise<CodaDependencyRuleState> {
  const existing = await getOrCreateCodaDependencyGateRule(userId);
  const baseConfig = normalizeConfig(existing.config);

  const nextConfig = patch.config
    ? normalizeConfig({ ...baseConfig, ...patch.config })
    : baseConfig;

  const updated = await prisma.integrationRule.update({
    where: { id: existing.id },
    data: {
      enabled: typeof patch.enabled === "boolean" ? patch.enabled : existing.enabled,
      statusOverride:
        typeof patch.statusOverride === "undefined" ? existing.statusOverride : patch.statusOverride,
      config: nextConfig as unknown as Prisma.InputJsonValue,
      lastError: null,
    },
  });

  return serializeCodaDependencyGateRule(updated);
}

export async function runCodaDependencyGateAutomation(input: {
  userId: string;
  dryRun?: boolean;
}): Promise<CodaDependencyRunResult> {
  const rule = await getOrCreateCodaDependencyGateRule(input.userId);
  const config = normalizeConfig(rule.config);
  const checkpoint = normalizeCheckpoint(rule.checkpoint);

  if (!rule.enabled) {
    return {
      ruleId: rule.id,
      enabled: false,
      scannedRows: 0,
      evaluatedRows: 0,
      appliedTransitions: 0,
      dedupedTransitions: 0,
      failedRows: 0,
      cursor: checkpoint,
      transitions: [],
      errors: [],
    };
  }

  let token: string;
  try {
    token = await getCodaAccessToken(input.userId);
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

  const rows = await withRetries(() => codaFetchRows({ token, config }));
  const scopedRows = filterRowsByCheckpoint(rows, checkpoint);

  let evaluatedRows = 0;
  let appliedTransitions = 0;
  let dedupedTransitions = 0;
  let failedRows = 0;

  const transitions: CodaDependencyTransition[] = [];
  const errors: Array<{ rowId: string; taskId: string; error: string }> = [];

  let newestUpdatedAtMs = checkpoint.lastUpdatedAt ? Date.parse(checkpoint.lastUpdatedAt) : Number.NaN;
  let newestRowId = checkpoint.lastRowId;

  for (const row of scopedRows) {
    const sourceUrl = row.browserLink ?? buildCodaFallbackRowUrl(config, row.id);
    const signal = deriveDependencySignal({
      row,
      config,
      ruleStatusOverride: rule.statusOverride,
      sourceUrl,
    });

    const updatedAtMs = row.updatedAt ? Date.parse(row.updatedAt) : Number.NaN;
    if (Number.isFinite(updatedAtMs) && (!Number.isFinite(newestUpdatedAtMs) || updatedAtMs > newestUpdatedAtMs)) {
      newestUpdatedAtMs = updatedAtMs;
      newestRowId = row.id;
    }

    if (!signal) {
      continue;
    }

    evaluatedRows += 1;

    const externalObjectId = buildCodaDependencyExternalId(signal.rowId, signal.taskId);
    const ruleVariant = `${signal.action}:${signal.targetStatus}:${signal.gateState}:${signal.observedAt.toISOString()}`;
    const dedupeKey = buildCodaDependencyGateDedupeKey({
      externalObjectId,
      ruleVariant,
    });

    if (input.dryRun) {
      transitions.push({
        rowId: signal.rowId,
        taskId: signal.taskId,
        taskTitle: "dry-run",
        action: signal.action,
        status: signal.targetStatus,
        sourceUrl: signal.sourceUrl,
        operation: "status_changed",
      });
      continue;
    }

    try {
      const result = await withRetries(() =>
        prisma.$transaction(async (transaction) => {
          const existingReceipt = await transaction.integrationReceipt.findUnique({
            where: { dedupeKey },
            select: { id: true },
          });

          if (existingReceipt) {
            return { operation: "deduped" as const };
          }

          const task = await transaction.task.findUnique({
            where: { id: signal.taskId },
            select: {
              id: true,
              title: true,
              status: true,
              metadata: true,
            },
          });

          if (!task) {
            throw new Error(`Linked task ${signal.taskId} not found`);
          }

          const shouldTransition = task.status !== signal.targetStatus;
          const nextColumnOrder = shouldTransition
            ? await getNextColumnOrder(transaction as unknown as typeof prisma, signal.targetStatus)
            : undefined;

          const updatedTask = await transaction.task.update({
            where: { id: task.id },
            data: {
              status: shouldTransition ? signal.targetStatus : undefined,
              columnOrder: shouldTransition ? nextColumnOrder : undefined,
              metadata: mergeMetadata(
                task.metadata,
                {
                  provider: "coda",
                  externalId: externalObjectId,
                  externalObjectType: "coda_dependency_gate",
                  ruleId: rule.id,
                  sourceUrl: signal.sourceUrl,
                  lastObservedAt: signal.observedAt.toISOString(),
                  dedupeKey,
                },
                {
                  rowId: signal.rowId,
                  action: signal.action,
                  gateState: signal.gateState,
                  reason: signal.reason,
                  status: signal.targetStatus,
                }
              ),
              statusHistory: shouldTransition
                ? {
                    create: {
                      fromStatus: task.status,
                      toStatus: signal.targetStatus,
                      changedBy: input.userId,
                    },
                  }
                : undefined,
            },
            select: {
              id: true,
              title: true,
            },
          });

          await transaction.integrationReceipt.create({
            data: {
              ruleId: rule.id,
              dedupeKey,
              externalObjectType: "coda_dependency_gate",
              externalObjectId,
              sourceUrl: signal.sourceUrl,
              taskId: task.id,
              lastObservedAt: signal.observedAt,
              metadata: {
                rowId: signal.rowId,
                taskId: signal.taskId,
                action: signal.action,
                status: signal.targetStatus,
                gateState: signal.gateState,
                reason: signal.reason,
              },
            },
          });

          await publishDomainEvent(
            {
              eventType: "integration.coda.dependency_gate_transition_applied",
              aggregateType: "integration_rule",
              aggregateId: rule.id,
              payload: {
                ruleId: rule.id,
                rowId: signal.rowId,
                taskId: signal.taskId,
                action: signal.action,
                status: signal.targetStatus,
                sourceUrl: signal.sourceUrl,
                changed: shouldTransition,
              },
              idempotencyKey: buildOutboxIdempotencyKey({
                aggregateType: "integration_rule",
                aggregateId: rule.id,
                eventType: `coda_dependency_gate_${signal.rowId}_${signal.taskId}_${signal.action}_${signal.observedAt.getTime()}`,
              }),
            },
            transaction
          );

          return {
            operation: shouldTransition ? ("status_changed" as const) : ("metadata_refreshed" as const),
            taskId: updatedTask.id,
            title: updatedTask.title,
          };
        })
      );

      if (result.operation === "deduped") {
        dedupedTransitions += 1;
        console.info("integration.coda.dependency_gate.deduped", {
          provider: "coda",
          ruleId: rule.id,
          rowId: signal.rowId,
          taskId: signal.taskId,
          dedupeKey,
        });
        continue;
      }

      appliedTransitions += 1;
      transitions.push({
        rowId: signal.rowId,
        taskId: signal.taskId,
        taskTitle: result.title,
        action: signal.action,
        status: signal.targetStatus,
        sourceUrl: signal.sourceUrl,
        operation: result.operation,
      });

      console.info("integration.coda.dependency_gate.applied", {
        provider: "coda",
        ruleId: rule.id,
        rowId: signal.rowId,
        taskId: signal.taskId,
        action: signal.action,
        status: signal.targetStatus,
        operation: result.operation,
      });
    } catch (error) {
      failedRows += 1;
      const message = error instanceof Error ? error.message : String(error);
      errors.push({
        rowId: signal.rowId,
        taskId: signal.taskId,
        error: message,
      });

      await recordDeadLetterFailure({
        ruleId: rule.id,
        rowId: signal.rowId,
        taskId: signal.taskId,
        error: message,
      });

      console.error("integration.coda.dependency_gate.failed", {
        provider: "coda",
        ruleId: rule.id,
        rowId: signal.rowId,
        taskId: signal.taskId,
        error: message,
      });
    }
  }

  const checkpointOut: CodaDependencyCheckpoint = {
    lastUpdatedAt: Number.isFinite(newestUpdatedAtMs)
      ? new Date(newestUpdatedAtMs).toISOString()
      : checkpoint.lastUpdatedAt,
    lastRowId: newestRowId,
  };

  await prisma.integrationRule.update({
    where: { id: rule.id },
    data: {
      checkpoint: checkpointOut as unknown as Prisma.InputJsonValue,
      lastObservedAt: checkpointOut.lastUpdatedAt ? new Date(checkpointOut.lastUpdatedAt) : rule.lastObservedAt,
      lastRunAt: new Date(),
      lastError: errors.length > 0 ? `${errors.length} dependency gate update(s) failed` : null,
    },
  });

  await prisma.integrationConnection.updateMany({
    where: {
      userId: input.userId,
      provider: IntegrationProvider.CODA,
    },
    data: {
      status: IntegrationConnectionStatus.CONNECTED,
      lastError: errors.length > 0 ? `${errors.length} dependency gate update(s) failed` : null,
      lastSyncedAt: new Date(),
    },
  });

  return {
    ruleId: rule.id,
    enabled: true,
    scannedRows: scopedRows.length,
    evaluatedRows,
    appliedTransitions,
    dedupedTransitions,
    failedRows,
    cursor: checkpointOut,
    transitions,
    errors,
  };
}
