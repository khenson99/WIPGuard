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
import { withRetries } from "@/lib/integrations/with-retries";
import { isCircuitClosed, recordSuccess, recordFailure, CircuitOpenError, getCircuitState } from "@/lib/integrations/circuit-breaker";

export const CODA_DECISION_RULE_KEY = "coda_decision_action_converter";

type SupportedAutoTaskStatus = "QUEUED" | "ACTIVE" | "NOT_DONE";

export interface CodaDecisionActionConfig {
  docId: string;
  tableId: string;
  actionColumn: string;
  decisionColumn: string;
  contextColumn: string;
  dueColumn: string;
  ownerColumn: string;
  maxRows: number;
}

interface CodaDecisionCheckpoint {
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

export interface CodaDecisionRuleState {
  id: string;
  key: string;
  enabled: boolean;
  statusOverride: SupportedAutoTaskStatus | null;
  config: CodaDecisionActionConfig;
  checkpoint: CodaDecisionCheckpoint;
  lastObservedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface CodaDecisionRulePatch {
  enabled?: boolean;
  statusOverride?: SupportedAutoTaskStatus | null;
  config?: Partial<CodaDecisionActionConfig>;
}

export interface CodaDecisionCreatedTask {
  rowId: string;
  actionIndex: number;
  taskId: string;
  title: string;
  sourceUrl: string;
}

export interface CodaDecisionRunResult {
  ruleId: string;
  enabled: boolean;
  scannedRows: number;
  actionItems: number;
  createdTasks: number;
  dedupedTasks: number;
  failedTasks: number;
  cursor: CodaDecisionCheckpoint;
  tasks: CodaDecisionCreatedTask[];
  errors: Array<{ rowId: string; actionIndex: number; error: string }>;
}

class CodaIntegrationAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodaIntegrationAuthError";
  }
}

export function defaultCodaDecisionConfig(): CodaDecisionActionConfig {
  return {
    docId: process.env.CODA_DOC_ID?.trim() ?? "",
    tableId: process.env.CODA_DECISION_TABLE_ID?.trim() ?? process.env.CODA_TABLE_ID?.trim() ?? "",
    actionColumn: "action",
    decisionColumn: "decision",
    contextColumn: "context",
    dueColumn: "due",
    ownerColumn: "owner",
    maxRows: 100,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeConfig(raw: unknown): CodaDecisionActionConfig {
  const input = asRecord(raw);
  const fallback = defaultCodaDecisionConfig();

  const docId = typeof input.docId === "string" ? input.docId.trim() : fallback.docId;
  const tableId = typeof input.tableId === "string" ? input.tableId.trim() : fallback.tableId;

  const actionColumn =
    typeof input.actionColumn === "string" && input.actionColumn.trim().length > 0
      ? input.actionColumn.trim()
      : fallback.actionColumn;

  const decisionColumn =
    typeof input.decisionColumn === "string" && input.decisionColumn.trim().length > 0
      ? input.decisionColumn.trim()
      : fallback.decisionColumn;

  const contextColumn =
    typeof input.contextColumn === "string" && input.contextColumn.trim().length > 0
      ? input.contextColumn.trim()
      : fallback.contextColumn;

  const dueColumn =
    typeof input.dueColumn === "string" && input.dueColumn.trim().length > 0
      ? input.dueColumn.trim()
      : fallback.dueColumn;

  const ownerColumn =
    typeof input.ownerColumn === "string" && input.ownerColumn.trim().length > 0
      ? input.ownerColumn.trim()
      : fallback.ownerColumn;

  const maxRows =
    typeof input.maxRows === "number" && Number.isInteger(input.maxRows)
      ? Math.max(1, Math.min(500, input.maxRows))
      : fallback.maxRows;

  return {
    docId,
    tableId,
    actionColumn,
    decisionColumn,
    contextColumn,
    dueColumn,
    ownerColumn,
    maxRows,
  };
}

function normalizeCheckpoint(raw: unknown): CodaDecisionCheckpoint {
  const input = asRecord(raw);
  const checkpoint: CodaDecisionCheckpoint = {};

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

function parseDueDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function extractOwnerEmail(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.includes("@") ? trimmed : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.includes("@")) {
        return item.trim();
      }
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const email = typeof record.email === "string" ? record.email : null;
        if (email && email.includes("@")) {
          return email.trim();
        }
      }
    }
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const email = typeof record.email === "string" ? record.email : null;
    if (email && email.includes("@")) {
      return email.trim();
    }
  }

  return null;
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const primary =
      (typeof record.name === "string" && record.name) ||
      (typeof record.title === "string" && record.title) ||
      (typeof record.value === "string" && record.value) ||
      null;
    if (primary) return primary.trim();
  }
  return "";
}

function parseActionItems(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => stringifyValue(item))
      .map((item) => item.replace(/^[-*\d.\)\s]+/, "").trim())
      .filter((item) => item.length > 0);
  }

  if (typeof value === "string") {
    return value
      .split(/\n|;/g)
      .map((item) => item.replace(/^[-*\d.\)\s]+/, "").trim())
      .filter((item) => item.length > 0);
  }

  const single = stringifyValue(value);
  if (single.length > 0) {
    return [single];
  }

  return [];
}

function buildCodaDecisionExternalId(rowId: string, actionIndex: number): string {
  return `${rowId}:${actionIndex}`;
}

export function buildCodaDecisionDedupeKey(rowId: string, actionIndex: number): string {
  return ["coda", "coda_decision_action", buildCodaDecisionExternalId(rowId, actionIndex), "create"].join(":");
}

function buildCodaFallbackRowUrl(config: CodaDecisionActionConfig, rowId: string): string {
  return `https://coda.io/d/${config.docId}/_su${rowId}`;
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
  config: CodaDecisionActionConfig;
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

function filterRowsByCheckpoint(rows: CodaRow[], checkpoint: CodaDecisionCheckpoint): CodaRow[] {
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

function buildTaskTitle(actionText: string): string {
  return `[Decision Action] ${actionText}`;
}

function buildTaskNotes(input: {
  rowId: string;
  actionText: string;
  decisionText: string | null;
  contextText: string | null;
  sourceUrl: string;
}): string {
  const lines = [
    "Created from Coda decision/action automation.",
    `Row ID: ${input.rowId}`,
    `Source: ${input.sourceUrl}`,
    input.decisionText ? "" : null,
    input.decisionText ? `Decision: ${input.decisionText}` : null,
    input.contextText ? `Context: ${input.contextText}` : null,
    "",
    `Action item: ${input.actionText}`,
  ].filter(Boolean);

  return lines.join("\n");
}

async function findAssigneeUserId(userId: string, ownerEmail: string | null): Promise<string> {
  if (!ownerEmail) {
    return userId;
  }

  const found = await prisma.user.findUnique({
    where: { email: ownerEmail },
    select: { id: true },
  });

  return found?.id ?? userId;
}

async function recordDeadLetterFailure(input: {
  ruleId: string;
  rowId: string;
  actionIndex: number;
  error: string;
}): Promise<void> {
  await prisma.outboxEvent.create({
    data: {
      eventType: "integration.coda.decision_action.failed",
      aggregateType: "integration_rule",
      aggregateId: input.ruleId,
      schemaVersion: 1,
      payload: {
        rowId: input.rowId,
        actionIndex: input.actionIndex,
        error: input.error,
      },
      idempotencyKey: `dead-letter:coda-decision-action:${input.ruleId}:${input.rowId}:${input.actionIndex}:${Date.now()}`,
      status: "DEAD_LETTER",
      retryCount: 0,
      nextAttemptAt: new Date(),
      failedAt: new Date(),
      error: input.error,
      lastAttemptAt: new Date(),
    },
  });
}

export async function getOrCreateCodaDecisionRule(userId: string): Promise<IntegrationRule> {
  return prisma.integrationRule.upsert({
    where: {
      userId_provider_key: {
        userId,
        provider: IntegrationProvider.CODA,
        key: CODA_DECISION_RULE_KEY,
      },
    },
    update: {},
    create: {
      userId,
      provider: IntegrationProvider.CODA,
      key: CODA_DECISION_RULE_KEY,
      enabled: true,
      statusOverride: null,
      config: defaultCodaDecisionConfig() as unknown as Prisma.InputJsonValue,
      checkpoint: {} as unknown as Prisma.InputJsonValue,
    },
  });
}

export function serializeCodaDecisionRule(rule: IntegrationRule): CodaDecisionRuleState {
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

export async function patchCodaDecisionRule(
  userId: string,
  patch: CodaDecisionRulePatch
): Promise<CodaDecisionRuleState> {
  const existing = await getOrCreateCodaDecisionRule(userId);
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

  return serializeCodaDecisionRule(updated);
}

export async function runCodaDecisionActionConverter(input: {
  userId: string;
  dryRun?: boolean;
}): Promise<CodaDecisionRunResult> {
  const rule = await getOrCreateCodaDecisionRule(input.userId);
  const config = normalizeConfig(rule.config);
  const checkpoint = normalizeCheckpoint(rule.checkpoint);

  if (!rule.enabled) {
    return {
      ruleId: rule.id,
      enabled: false,
      scannedRows: 0,
      actionItems: 0,
      createdTasks: 0,
      dedupedTasks: 0,
      failedTasks: 0,
      cursor: checkpoint,
      tasks: [],
      errors: [],
    };
  }

  const CB_PROVIDER = "coda";
  if (!isCircuitClosed(CB_PROVIDER, input.userId)) {
    throw new CircuitOpenError(CB_PROVIDER, input.userId, getCircuitState(CB_PROVIDER, input.userId));
  }
  let _cbSuccess = false;
  try {

  if (!config.docId || !config.tableId) {
    throw new Error("Coda decision/action converter requires config.docId and config.tableId");
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

  let actionItems = 0;
  let createdTasks = 0;
  let dedupedTasks = 0;
  let failedTasks = 0;
  const tasks: CodaDecisionCreatedTask[] = [];
  const errors: Array<{ rowId: string; actionIndex: number; error: string }> = [];

  let newestUpdatedAtMs = checkpoint.lastUpdatedAt
    ? Date.parse(checkpoint.lastUpdatedAt)
    : Number.NaN;
  let newestRowId = checkpoint.lastRowId;

  const status = toSupportedStatus(rule.statusOverride);

  for (const row of scopedRows) {
    const updatedAtMs = row.updatedAt ? Date.parse(row.updatedAt) : Number.NaN;
    if (Number.isFinite(updatedAtMs) && (!Number.isFinite(newestUpdatedAtMs) || updatedAtMs > newestUpdatedAtMs)) {
      newestUpdatedAtMs = updatedAtMs;
      newestRowId = row.id;
    }

    const sourceUrl = row.browserLink ?? buildCodaFallbackRowUrl(config, row.id);
    const decisionTextRaw = row.values?.[config.decisionColumn];
    const contextTextRaw = row.values?.[config.contextColumn];
    const ownerEmail = extractOwnerEmail(row.values?.[config.ownerColumn]);
    const dueDate = parseDueDate(row.values?.[config.dueColumn]);

    const decisionText = stringifyValue(decisionTextRaw) || null;
    const contextText = stringifyValue(contextTextRaw) || null;

    const actionValues = row.values?.[config.actionColumn];
    const parsedActions = parseActionItems(actionValues);
    if (parsedActions.length === 0) {
      continue;
    }

    actionItems += parsedActions.length;

    for (let actionIndex = 0; actionIndex < parsedActions.length; actionIndex += 1) {
      const actionText = parsedActions[actionIndex];
      const externalId = buildCodaDecisionExternalId(row.id, actionIndex);
      const dedupeKey = buildCodaDecisionDedupeKey(row.id, actionIndex);
      const title = buildTaskTitle(actionText);

      if (input.dryRun) {
        tasks.push({
          rowId: row.id,
          actionIndex,
          taskId: "dry-run",
          title,
          sourceUrl,
        });
        continue;
      }

      try {
        const assigneeId = await findAssigneeUserId(input.userId, ownerEmail);

        const createdTask = await withRetries(async () => {
          try {
            return await prisma.$transaction(async (transaction) => {
              const receipt = await transaction.integrationReceipt.create({
                data: {
                  ruleId: rule.id,
                  dedupeKey,
                  externalObjectType: "coda_decision_action",
                  externalObjectId: externalId,
                  sourceUrl,
                  lastObservedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
                  metadata: {
                    rowId: row.id,
                    actionIndex,
                    actionText,
                    ownerEmail,
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
                  notes: buildTaskNotes({
                    rowId: row.id,
                    actionText,
                    decisionText,
                    contextText,
                    sourceUrl,
                  }),
                  status,
                  dueDate: dueDate ?? undefined,
                  assignedOn: new Date(),
                  columnOrder: nextColumnOrder,
                  metadata: {
                    integration: {
                      provider: "coda",
                      externalId,
                      externalObjectType: "coda_decision_action",
                      ruleId: rule.id,
                      sourceUrl,
                      lastObservedAt: row.updatedAt ?? new Date().toISOString(),
                      dedupeKey,
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
                  eventType: "integration.coda.decision_action_task_created",
                  aggregateType: "integration_rule",
                  aggregateId: rule.id,
                  payload: {
                    ruleId: rule.id,
                    taskId: task.id,
                    rowId: row.id,
                    actionIndex,
                    sourceUrl,
                  },
                  idempotencyKey: buildOutboxIdempotencyKey({
                    aggregateType: "integration_rule",
                    aggregateId: rule.id,
                    eventType: `coda_decision_action_created_${row.id}_${actionIndex}`,
                  }),
                },
                transaction
              );

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
          continue;
        }

        createdTasks += 1;
        tasks.push({
          rowId: row.id,
          actionIndex,
          taskId: createdTask.id,
          title: createdTask.title,
          sourceUrl,
        });

        console.info("integration.coda.decision_action.created", {
          provider: "coda",
          ruleId: rule.id,
          externalId,
          taskId: createdTask.id,
        });
      } catch (error) {
        failedTasks += 1;
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ rowId: row.id, actionIndex, error: message });

        await recordDeadLetterFailure({
          ruleId: rule.id,
          rowId: row.id,
          actionIndex,
          error: message,
        });

        console.error("integration.coda.decision_action.failed", {
          provider: "coda",
          ruleId: rule.id,
          externalId,
          error: message,
        });
      }
    }
  }

  const checkpointOut: CodaDecisionCheckpoint = {
    lastUpdatedAt: Number.isFinite(newestUpdatedAtMs)
      ? new Date(newestUpdatedAtMs).toISOString()
      : checkpoint.lastUpdatedAt,
    lastRowId: newestRowId,
  };

  await prisma.integrationRule.update({
    where: { id: rule.id },
    data: {
      checkpoint: checkpointOut as unknown as Prisma.InputJsonValue,
      lastObservedAt: checkpointOut.lastUpdatedAt
        ? new Date(checkpointOut.lastUpdatedAt)
        : rule.lastObservedAt,
      lastRunAt: new Date(),
      lastError: errors.length > 0 ? `${errors.length} decision action(s) failed` : null,
    },
  });

  await prisma.integrationConnection.updateMany({
    where: {
      userId: input.userId,
      provider: IntegrationProvider.CODA,
    },
    data: {
      status: IntegrationConnectionStatus.CONNECTED,
      lastError: errors.length > 0 ? `${errors.length} decision action(s) failed` : null,
      lastSyncedAt: new Date(),
    },
  });

  _cbSuccess = true;
  return {
    ruleId: rule.id,
    enabled: true,
    scannedRows: scopedRows.length,
    actionItems,
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
