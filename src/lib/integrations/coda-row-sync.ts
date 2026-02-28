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

export const CODA_RULE_KEY = "coda_row_task_upsert";

type SupportedAutoTaskStatus = "QUEUED" | "ACTIVE" | "NOT_DONE";

export interface CodaRowSyncConfig {
  docId: string;
  tableId: string;
  titleColumn: string;
  notesColumn: string;
  dueColumn: string;
  ownerColumn: string;
  maxRows: number;
}

interface CodaSyncCheckpoint {
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

export interface CodaRuleState {
  id: string;
  key: string;
  enabled: boolean;
  statusOverride: SupportedAutoTaskStatus | null;
  config: CodaRowSyncConfig;
  checkpoint: CodaSyncCheckpoint;
  lastObservedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface CodaRulePatch {
  enabled?: boolean;
  statusOverride?: SupportedAutoTaskStatus | null;
  config?: Partial<CodaRowSyncConfig>;
}

export interface CodaUpsertTask {
  rowId: string;
  taskId: string;
  title: string;
  sourceUrl: string;
  operation: "created" | "updated";
}

export interface CodaSyncResult {
  ruleId: string;
  enabled: boolean;
  scannedRows: number;
  createdTasks: number;
  updatedTasks: number;
  failedRows: number;
  cursor: CodaSyncCheckpoint;
  tasks: CodaUpsertTask[];
  errors: Array<{ rowId: string; error: string }>;
}

class CodaIntegrationAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodaIntegrationAuthError";
  }
}

export function defaultCodaRowSyncConfig(): CodaRowSyncConfig {
  return {
    docId: process.env.CODA_DOC_ID?.trim() ?? "",
    tableId: process.env.CODA_TABLE_ID?.trim() ?? "",
    titleColumn: "title",
    notesColumn: "notes",
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

function normalizeConfig(raw: unknown): CodaRowSyncConfig {
  const input = asRecord(raw);
  const fallback = defaultCodaRowSyncConfig();

  const docId = typeof input.docId === "string" ? input.docId.trim() : fallback.docId;
  const tableId = typeof input.tableId === "string" ? input.tableId.trim() : fallback.tableId;
  const titleColumn =
    typeof input.titleColumn === "string" && input.titleColumn.trim().length > 0
      ? input.titleColumn.trim()
      : fallback.titleColumn;
  const notesColumn =
    typeof input.notesColumn === "string" && input.notesColumn.trim().length > 0
      ? input.notesColumn.trim()
      : fallback.notesColumn;
  const dueColumn =
    typeof input.dueColumn === "string" && input.dueColumn.trim().length > 0
      ? input.dueColumn.trim()
      : fallback.dueColumn;
  const ownerColumn =
    typeof input.ownerColumn === "string" && input.ownerColumn.trim().length > 0
      ? input.ownerColumn.trim()
      : fallback.ownerColumn;

  const maxRowsRaw = input.maxRows;
  const maxRows =
    typeof maxRowsRaw === "number" && Number.isInteger(maxRowsRaw)
      ? Math.max(1, Math.min(500, maxRowsRaw))
      : fallback.maxRows;

  return {
    docId,
    tableId,
    titleColumn,
    notesColumn,
    dueColumn,
    ownerColumn,
    maxRows,
  };
}

function normalizeCheckpoint(raw: unknown): CodaSyncCheckpoint {
  const input = asRecord(raw);
  const checkpoint: CodaSyncCheckpoint = {};

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

function buildCodaExternalId(rowId: string): string {
  return rowId;
}

export function buildCodaRowDedupeKey(rowId: string): string {
  return ["coda", "coda_row", rowId, "upsert"].join(":");
}

function buildCodaFallbackRowUrl(config: CodaRowSyncConfig, rowId: string): string {
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
  config: CodaRowSyncConfig;
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

function filterRowsByCheckpoint(rows: CodaRow[], checkpoint: CodaSyncCheckpoint): CodaRow[] {
  const checkpointMs = checkpoint.lastUpdatedAt
    ? Date.parse(checkpoint.lastUpdatedAt)
    : Number.NaN;

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

function extractTaskTitle(row: CodaRow, config: CodaRowSyncConfig): string {
  const titleValue = row.values?.[config.titleColumn];
  if (typeof titleValue === "string" && titleValue.trim().length > 0) {
    return titleValue.trim();
  }
  return `Coda row ${row.id}`;
}

function extractTaskNotes(row: CodaRow, config: CodaRowSyncConfig, sourceUrl: string): string {
  const notesValue = row.values?.[config.notesColumn];
  const noteText = typeof notesValue === "string" ? notesValue.trim() : "";

  const lines = [
    "Created from Coda row sync",
    `Row ID: ${row.id}`,
    `Source: ${sourceUrl}`,
    "",
    noteText || JSON.stringify(row.values ?? {}, null, 2),
  ];

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
  error: string;
}): Promise<void> {
  await prisma.outboxEvent.create({
    data: {
      eventType: "integration.coda.row_sync.failed",
      aggregateType: "integration_rule",
      aggregateId: input.ruleId,
      schemaVersion: 1,
      payload: {
        rowId: input.rowId,
        error: input.error,
      },
      idempotencyKey: `dead-letter:coda-row-sync:${input.ruleId}:${input.rowId}:${Date.now()}`,
      status: "DEAD_LETTER",
      retryCount: 0,
      nextAttemptAt: new Date(),
      failedAt: new Date(),
      error: input.error,
      lastAttemptAt: new Date(),
    },
  });
}

export async function getOrCreateCodaRowSyncRule(userId: string): Promise<IntegrationRule> {
  return prisma.integrationRule.upsert({
    where: {
      userId_provider_key: {
        userId,
        provider: IntegrationProvider.CODA,
        key: CODA_RULE_KEY,
      },
    },
    update: {},
    create: {
      userId,
      provider: IntegrationProvider.CODA,
      key: CODA_RULE_KEY,
      enabled: true,
      statusOverride: null,
      config: defaultCodaRowSyncConfig() as unknown as Prisma.InputJsonValue,
      checkpoint: {} as unknown as Prisma.InputJsonValue,
    },
  });
}

export function serializeCodaRuleState(rule: IntegrationRule): CodaRuleState {
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

export async function patchCodaRule(
  userId: string,
  patch: CodaRulePatch
): Promise<CodaRuleState> {
  const existing = await getOrCreateCodaRowSyncRule(userId);
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

  return serializeCodaRuleState(updated);
}

export async function runCodaRowSync(input: {
  userId: string;
  dryRun?: boolean;
}): Promise<CodaSyncResult> {
  const rule = await getOrCreateCodaRowSyncRule(input.userId);
  const config = normalizeConfig(rule.config);
  const checkpoint = normalizeCheckpoint(rule.checkpoint);

  if (!rule.enabled) {
    return {
      ruleId: rule.id,
      enabled: false,
      scannedRows: 0,
      createdTasks: 0,
      updatedTasks: 0,
      failedRows: 0,
      cursor: checkpoint,
      tasks: [],
      errors: [],
    };
  }

  const CB_PROVIDER = "coda";
  if (!(await isCircuitClosed(CB_PROVIDER, input.userId))) {
    throw new CircuitOpenError(CB_PROVIDER, input.userId, getCircuitState(CB_PROVIDER, input.userId));
  }
  let _cbSuccess = false;
  try {

  if (!config.docId || !config.tableId) {
    throw new Error("Coda row sync requires config.docId and config.tableId");
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

  let createdTasks = 0;
  let updatedTasks = 0;
  let failedRows = 0;
  const tasks: CodaUpsertTask[] = [];
  const errors: Array<{ rowId: string; error: string }> = [];

  let newestUpdatedAtMs = checkpoint.lastUpdatedAt
    ? Date.parse(checkpoint.lastUpdatedAt)
    : Number.NaN;
  let newestRowId = checkpoint.lastRowId;

  const status = toSupportedStatus(rule.statusOverride);

  for (const row of scopedRows) {
    const externalId = buildCodaExternalId(row.id);
    const dedupeKey = buildCodaRowDedupeKey(row.id);
    const sourceUrl = row.browserLink ?? buildCodaFallbackRowUrl(config, row.id);

    const updatedAtMs = row.updatedAt ? Date.parse(row.updatedAt) : Number.NaN;
    if (Number.isFinite(updatedAtMs) && (!Number.isFinite(newestUpdatedAtMs) || updatedAtMs > newestUpdatedAtMs)) {
      newestUpdatedAtMs = updatedAtMs;
      newestRowId = row.id;
    }

    const title = extractTaskTitle(row, config);
    const notes = extractTaskNotes(row, config, sourceUrl);
    const dueDate = parseDueDate(row.values?.[config.dueColumn]);
    const ownerEmail = extractOwnerEmail(row.values?.[config.ownerColumn]);

    if (input.dryRun) {
      tasks.push({
        rowId: row.id,
        taskId: "dry-run",
        title,
        sourceUrl,
        operation: "created",
      });
      continue;
    }

    try {
      const upsertResult = await withRetries(async () =>
        prisma.$transaction(async (transaction) => {
          const receipt = await transaction.integrationReceipt.findUnique({
            where: { dedupeKey },
            select: { id: true, taskId: true },
          });

          const assigneeId = await findAssigneeUserId(input.userId, ownerEmail);

          if (receipt?.taskId) {
            const updatedTask = await transaction.task.update({
              where: { id: receipt.taskId },
              data: {
                title,
                notes,
                dueDate: dueDate ?? undefined,
                responsible: {
                  set: [{ id: assigneeId }],
                },
                metadata: {
                  integration: {
                    provider: "coda",
                    externalId,
                    externalObjectType: "coda_row",
                    ruleId: rule.id,
                    sourceUrl,
                    lastObservedAt: row.updatedAt ?? new Date().toISOString(),
                    dedupeKey,
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
                sourceUrl,
                lastObservedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
                metadata: {
                  rowId: row.id,
                  ownerEmail,
                },
              },
            });

            await publishDomainEvent(
              {
                eventType: "integration.coda.row_task_updated",
                aggregateType: "integration_rule",
                aggregateId: rule.id,
                payload: {
                  ruleId: rule.id,
                  taskId: updatedTask.id,
                  rowId: row.id,
                  sourceUrl,
                },
                idempotencyKey: buildOutboxIdempotencyKey({
                  aggregateType: "integration_rule",
                  aggregateId: rule.id,
                  eventType: `coda_row_updated_${row.id}`,
                }),
              },
              transaction
            );

            return {
              operation: "updated" as const,
              taskId: updatedTask.id,
              title: updatedTask.title,
            };
          }

          const createdReceipt = await transaction.integrationReceipt.create({
            data: {
              ruleId: rule.id,
              dedupeKey,
              externalObjectType: "coda_row",
              externalObjectId: externalId,
              sourceUrl,
              lastObservedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
              metadata: {
                rowId: row.id,
                ownerEmail,
              },
            },
          });

          const nextColumnOrder = await getNextColumnOrder(
            transaction as unknown as typeof prisma,
            status
          );

          const createdTask = await transaction.task.create({
            data: {
              title,
              notes,
              status,
              dueDate: dueDate ?? undefined,
              assignedOn: new Date(),
              columnOrder: nextColumnOrder,
              metadata: {
                integration: {
                  provider: "coda",
                  externalId,
                  externalObjectType: "coda_row",
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
            where: { id: createdReceipt.id },
            data: {
              taskId: createdTask.id,
            },
          });

          await publishDomainEvent(
            {
              eventType: "integration.coda.row_task_created",
              aggregateType: "integration_rule",
              aggregateId: rule.id,
              payload: {
                ruleId: rule.id,
                taskId: createdTask.id,
                rowId: row.id,
                sourceUrl,
              },
              idempotencyKey: buildOutboxIdempotencyKey({
                aggregateType: "integration_rule",
                aggregateId: rule.id,
                eventType: `coda_row_created_${row.id}`,
              }),
            },
            transaction
          );

          return {
            operation: "created" as const,
            taskId: createdTask.id,
            title: createdTask.title,
          };
        })
      );

      if (upsertResult.operation === "created") {
        createdTasks += 1;
      } else {
        updatedTasks += 1;
      }

      tasks.push({
        rowId: row.id,
        taskId: upsertResult.taskId,
        title: upsertResult.title,
        sourceUrl,
        operation: upsertResult.operation,
      });

      console.info("integration.coda.row_sync.upserted", {
        provider: "coda",
        ruleId: rule.id,
        externalId,
        operation: upsertResult.operation,
        taskId: upsertResult.taskId,
      });
    } catch (error) {
      failedRows += 1;
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ rowId: row.id, error: message });

      await recordDeadLetterFailure({
        ruleId: rule.id,
        rowId: row.id,
        error: message,
      });

      console.error("integration.coda.row_sync.failed", {
        provider: "coda",
        ruleId: rule.id,
        externalId,
        error: message,
      });
    }
  }

  const checkpointOut: CodaSyncCheckpoint = {
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
      lastError: errors.length > 0 ? `${errors.length} row(s) failed` : null,
    },
  });

  await prisma.integrationConnection.updateMany({
    where: {
      userId: input.userId,
      provider: IntegrationProvider.CODA,
    },
    data: {
      status: IntegrationConnectionStatus.CONNECTED,
      lastError: errors.length > 0 ? `${errors.length} row(s) failed` : null,
      lastSyncedAt: new Date(),
    },
  });

  _cbSuccess = true;
  return {
    ruleId: rule.id,
    enabled: true,
    scannedRows: scopedRows.length,
    createdTasks,
    updatedTasks,
    failedRows,
    cursor: checkpointOut,
    tasks,
    errors,
  };
  } finally {
    if (_cbSuccess) recordSuccess(CB_PROVIDER, input.userId);
    else recordFailure(CB_PROVIDER, input.userId);
  }
}
