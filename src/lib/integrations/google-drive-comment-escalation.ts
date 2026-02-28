import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  Prisma,
  type IntegrationRule,
  type TaskStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getNextColumnOrder } from "@/lib/task-order";
import { buildOutboxIdempotencyKey, publishDomainEvent } from "@/lib/event-bus";
import { withRetries } from "@/lib/integrations/with-retries";
import { isCircuitClosed, recordSuccess, recordFailure, CircuitOpenError, getCircuitState } from "@/lib/integrations/circuit-breaker";
import { getValidIntegrationAccessToken } from "@/lib/integrations/token-refresh";

export const GOOGLE_DRIVE_RULE_KEY = "google_drive_comment_escalation";

type SupportedAutoTaskStatus = "QUEUED" | "ACTIVE" | "NOT_DONE";
type DriveEscalationVariant = "assigned_comment" | "review_request";

export interface GoogleDriveEscalationConfig {
  folderIds: string[];
  maxFilesPerRun: number;
  maxCommentsPerFile: number;
  dueInHours: number;
  requireAssignment: boolean;
  reviewKeywords: string[];
}

interface GoogleDriveCheckpoint {
  lastObservedAt?: string;
  lastCommentId?: string;
}

interface GoogleDriveFile {
  id: string;
  name?: string;
  webViewLink?: string;
  modifiedTime?: string;
}

interface GoogleDriveFilesResponse {
  files?: GoogleDriveFile[];
}

interface GoogleDriveComment {
  id: string;
  content?: string;
  modifiedTime?: string;
  resolved?: boolean;
  deleted?: boolean;
  author?: {
    displayName?: string;
    emailAddress?: string;
  };
  quotedFileContent?: {
    value?: string;
  };
}

interface GoogleDriveCommentsResponse {
  comments?: GoogleDriveComment[];
}

export interface GoogleDriveRuleState {
  id: string;
  key: string;
  enabled: boolean;
  statusOverride: SupportedAutoTaskStatus | null;
  config: GoogleDriveEscalationConfig;
  checkpoint: GoogleDriveCheckpoint;
  lastObservedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface GoogleDriveRulePatch {
  enabled?: boolean;
  statusOverride?: SupportedAutoTaskStatus | null;
  config?: Partial<GoogleDriveEscalationConfig>;
}

export interface GoogleDriveEscalationTask {
  fileId: string;
  commentId: string;
  variant: DriveEscalationVariant;
  operation: "created" | "reopened";
  taskId: string;
  title: string;
  sourceUrl: string;
}

export interface GoogleDriveEscalationResult {
  ruleId: string;
  enabled: boolean;
  scannedFiles: number;
  scannedComments: number;
  createdTasks: number;
  reopenedTasks: number;
  dedupedTasks: number;
  failedTasks: number;
  cursor: GoogleDriveCheckpoint;
  tasks: GoogleDriveEscalationTask[];
  errors: Array<{ fileId: string; commentId: string; error: string }>;
}

class GoogleDriveIntegrationAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleDriveIntegrationAuthError";
  }
}

export function defaultGoogleDriveEscalationConfig(): GoogleDriveEscalationConfig {
  return {
    folderIds: [],
    maxFilesPerRun: 50,
    maxCommentsPerFile: 50,
    dueInHours: 24,
    requireAssignment: true,
    reviewKeywords: ["review", "feedback", "take a look", "approve"],
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeConfig(raw: unknown): GoogleDriveEscalationConfig {
  const input = asRecord(raw);
  const fallback = defaultGoogleDriveEscalationConfig();

  const folderIds = Array.isArray(input.folderIds)
    ? input.folderIds.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0
      )
    : fallback.folderIds;

  const reviewKeywords = Array.isArray(input.reviewKeywords)
    ? input.reviewKeywords.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0
      )
    : fallback.reviewKeywords;

  const maxFilesPerRun =
    typeof input.maxFilesPerRun === "number" && Number.isInteger(input.maxFilesPerRun)
      ? Math.max(1, Math.min(200, input.maxFilesPerRun))
      : fallback.maxFilesPerRun;

  const maxCommentsPerFile =
    typeof input.maxCommentsPerFile === "number" && Number.isInteger(input.maxCommentsPerFile)
      ? Math.max(1, Math.min(200, input.maxCommentsPerFile))
      : fallback.maxCommentsPerFile;

  const dueInHours =
    typeof input.dueInHours === "number" && Number.isInteger(input.dueInHours)
      ? Math.max(1, Math.min(168, input.dueInHours))
      : fallback.dueInHours;

  const requireAssignment =
    typeof input.requireAssignment === "boolean"
      ? input.requireAssignment
      : fallback.requireAssignment;

  return {
    folderIds: Array.from(new Set(folderIds)),
    maxFilesPerRun,
    maxCommentsPerFile,
    dueInHours,
    requireAssignment,
    reviewKeywords: reviewKeywords.length > 0 ? reviewKeywords : fallback.reviewKeywords,
  };
}

function normalizeCheckpoint(raw: unknown): GoogleDriveCheckpoint {
  const input = asRecord(raw);
  const checkpoint: GoogleDriveCheckpoint = {};

  if (typeof input.lastObservedAt === "string" && input.lastObservedAt.length > 0) {
    checkpoint.lastObservedAt = input.lastObservedAt;
  }
  if (typeof input.lastCommentId === "string" && input.lastCommentId.length > 0) {
    checkpoint.lastCommentId = input.lastCommentId;
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

function buildDriveExternalId(fileId: string, commentId: string): string {
  return `${fileId}:${commentId}`;
}

export function buildGoogleDriveCommentDedupeKey(input: {
  fileId: string;
  commentId: string;
  variant: DriveEscalationVariant;
}): string {
  return [
    "google_workspace",
    "drive_comment",
    buildDriveExternalId(input.fileId, input.commentId),
    input.variant,
  ].join(":");
}

function commentExcerpt(comment: GoogleDriveComment): string {
  const content = typeof comment.content === "string" ? comment.content.trim() : "";
  const quoted =
    typeof comment.quotedFileContent?.value === "string"
      ? comment.quotedFileContent.value.trim()
      : "";

  const base = content || quoted || "(No comment excerpt)";
  return base.length > 180 ? `${base.slice(0, 177)}...` : base;
}

function detectCommentVariant(input: {
  comment: GoogleDriveComment;
  config: GoogleDriveEscalationConfig;
  userEmail: string | null;
}): DriveEscalationVariant[] {
  if (input.comment.deleted || input.comment.resolved) {
    return [];
  }

  const content = (input.comment.content ?? "").toLowerCase();
  if (!content) {
    return [];
  }

  const hasEmailMention =
    input.userEmail !== null && content.includes(input.userEmail.toLowerCase());
  const hasAssignmentKeyword =
    content.includes("assign") || content.includes("todo") || content.includes("action");
  const hasAtMention = content.includes("@");

  const assignedMatch = input.config.requireAssignment
    ? hasEmailMention || (hasAssignmentKeyword && hasAtMention)
    : hasEmailMention || hasAssignmentKeyword || hasAtMention;

  const reviewMatch = input.config.reviewKeywords.some((keyword) =>
    content.includes(keyword.toLowerCase())
  );

  const variants: DriveEscalationVariant[] = [];
  if (assignedMatch) {
    variants.push("assigned_comment");
  }
  if (reviewMatch) {
    variants.push("review_request");
  }

  return variants;
}

function buildTaskTitle(input: {
  fileName: string;
  comment: GoogleDriveComment;
  variant: DriveEscalationVariant;
}): string {
  const prefix = input.variant === "assigned_comment" ? "Drive Assignment" : "Drive Review";
  return `[${prefix}] ${input.fileName}: ${commentExcerpt(input.comment)}`;
}

function buildTaskNotes(input: {
  fileName: string;
  sourceUrl: string;
  comment: GoogleDriveComment;
  variant: DriveEscalationVariant;
}): string {
  const author = input.comment.author?.displayName ?? input.comment.author?.emailAddress ?? "Unknown";

  const lines = [
    "Created from Google Drive comment escalation automation.",
    `Variant: ${input.variant}`,
    `Document: ${input.fileName}`,
    `Commenter: ${author}`,
    `Source: ${input.sourceUrl}`,
    "",
    "Comment excerpt:",
    commentExcerpt(input.comment),
  ];

  return lines.join("\n");
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}


async function markConnectionError(userId: string, message: string): Promise<void> {
  await prisma.integrationConnection.updateMany({
    where: {
      userId,
      provider: IntegrationProvider.GOOGLE_WORKSPACE,
    },
    data: {
      status: IntegrationConnectionStatus.ERROR,
      lastError: message,
      lastSyncedAt: null,
    },
  });
}

async function getValidGoogleAccessToken(userId: string): Promise<string> {
  return getValidIntegrationAccessToken({
    userId,
    provider: IntegrationProvider.GOOGLE_WORKSPACE,
  });
}

async function googleFetchJson<T>(token: string, url: URL): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new GoogleDriveIntegrationAuthError("Google access token is invalid or expired");
  }

  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || payload === null) {
    throw new Error(`Google Drive API failed (${response.status})`);
  }

  return payload;
}

async function listDriveFiles(input: {
  token: string;
  config: GoogleDriveEscalationConfig;
}): Promise<GoogleDriveFile[]> {
  const files: GoogleDriveFile[] = [];

  if (input.config.folderIds.length === 0) {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("pageSize", String(Math.min(input.config.maxFilesPerRun, 100)));
    url.searchParams.set("orderBy", "modifiedTime desc");
    url.searchParams.set("fields", "files(id,name,webViewLink,modifiedTime)");
    url.searchParams.set("q", "trashed=false");

    const payload = await googleFetchJson<GoogleDriveFilesResponse>(input.token, url);
    return (payload.files ?? []).slice(0, input.config.maxFilesPerRun);
  }

  for (const folderId of input.config.folderIds) {
    if (files.length >= input.config.maxFilesPerRun) {
      break;
    }

    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set(
      "pageSize",
      String(Math.min(100, input.config.maxFilesPerRun - files.length))
    );
    url.searchParams.set("orderBy", "modifiedTime desc");
    url.searchParams.set("fields", "files(id,name,webViewLink,modifiedTime)");
    url.searchParams.set("q", `'${folderId}' in parents and trashed=false`);

    const payload = await googleFetchJson<GoogleDriveFilesResponse>(input.token, url);
    files.push(...(payload.files ?? []));
  }

  return files.slice(0, input.config.maxFilesPerRun);
}

async function listFileComments(input: {
  token: string;
  fileId: string;
  maxComments: number;
}): Promise<GoogleDriveComment[]> {
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.fileId)}/comments`
  );
  url.searchParams.set("pageSize", String(Math.min(input.maxComments, 100)));
  url.searchParams.set(
    "fields",
    "comments(id,content,modifiedTime,resolved,deleted,author(displayName,emailAddress),quotedFileContent(value))"
  );

  const payload = await googleFetchJson<GoogleDriveCommentsResponse>(input.token, url);
  return payload.comments ?? [];
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

async function recordDeadLetterFailure(input: {
  ruleId: string;
  fileId: string;
  commentId: string;
  variant: DriveEscalationVariant;
  error: string;
}): Promise<void> {
  await prisma.outboxEvent.create({
    data: {
      eventType: "integration.google.drive_comment.failed",
      aggregateType: "integration_rule",
      aggregateId: input.ruleId,
      schemaVersion: 1,
      payload: {
        fileId: input.fileId,
        commentId: input.commentId,
        variant: input.variant,
        error: input.error,
      },
      idempotencyKey: `dead-letter:google-drive-comment:${input.ruleId}:${input.fileId}:${input.commentId}:${input.variant}:${Date.now()}`,
      status: "DEAD_LETTER",
      retryCount: 0,
      nextAttemptAt: new Date(),
      failedAt: new Date(),
      error: input.error,
      lastAttemptAt: new Date(),
    },
  });
}

export async function getOrCreateGoogleDriveRule(userId: string): Promise<IntegrationRule> {
  return prisma.integrationRule.upsert({
    where: {
      userId_provider_key: {
        userId,
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
        key: GOOGLE_DRIVE_RULE_KEY,
      },
    },
    update: {},
    create: {
      userId,
      provider: IntegrationProvider.GOOGLE_WORKSPACE,
      key: GOOGLE_DRIVE_RULE_KEY,
      enabled: true,
      statusOverride: null,
      config: defaultGoogleDriveEscalationConfig() as unknown as Prisma.InputJsonValue,
      checkpoint: {} as unknown as Prisma.InputJsonValue,
    },
  });
}

export function serializeGoogleDriveRule(rule: IntegrationRule): GoogleDriveRuleState {
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

export async function patchGoogleDriveRule(
  userId: string,
  patch: GoogleDriveRulePatch
): Promise<GoogleDriveRuleState> {
  const existing = await getOrCreateGoogleDriveRule(userId);
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

  return serializeGoogleDriveRule(updated);
}

export async function runGoogleDriveCommentEscalation(input: {
  userId: string;
  dryRun?: boolean;
}): Promise<GoogleDriveEscalationResult> {
  const rule = await getOrCreateGoogleDriveRule(input.userId);
  const config = normalizeConfig(rule.config);
  const checkpoint = normalizeCheckpoint(rule.checkpoint);

  if (!rule.enabled) {
    return {
      ruleId: rule.id,
      enabled: false,
      scannedFiles: 0,
      scannedComments: 0,
      createdTasks: 0,
      reopenedTasks: 0,
      dedupedTasks: 0,
      failedTasks: 0,
      cursor: checkpoint,
      tasks: [],
      errors: [],
    };
  }

  const CB_PROVIDER = "google_drive";
  if (!(await isCircuitClosed(CB_PROVIDER, input.userId))) {
    throw new CircuitOpenError(CB_PROVIDER, input.userId, getCircuitState(CB_PROVIDER, input.userId));
  }
  let _cbSuccess = false;
  try {

  let accessToken: string;
  try {
    accessToken = await getValidGoogleAccessToken(input.userId);
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

  const files = await withRetries(() =>
    listDriveFiles({ token: accessToken, config })
  );

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { email: true },
  });
  const userEmail = user?.email ?? null;

  let scannedComments = 0;
  let createdTasks = 0;
  let reopenedTasks = 0;
  let dedupedTasks = 0;
  let failedTasks = 0;
  const tasks: GoogleDriveEscalationTask[] = [];
  const errors: Array<{ fileId: string; commentId: string; error: string }> = [];

  let lastObservedAtMs = checkpoint.lastObservedAt
    ? Date.parse(checkpoint.lastObservedAt)
    : Number.NaN;
  let lastCommentId = checkpoint.lastCommentId;

  const defaultStatus = toSupportedStatus(rule.statusOverride);

  for (const file of files) {
    const comments = await withRetries(() =>
      listFileComments({
        token: accessToken,
        fileId: file.id,
        maxComments: config.maxCommentsPerFile,
      })
    );

    scannedComments += comments.length;

    for (const comment of comments) {
      if (!comment.id) {
        continue;
      }

      const variants = detectCommentVariant({
        comment,
        config,
        userEmail,
      });
      if (variants.length === 0) {
        continue;
      }

      const observedAtIso = comment.modifiedTime ?? file.modifiedTime ?? new Date().toISOString();
      const observedAtMs = Date.parse(observedAtIso);
      if (
        Number.isFinite(observedAtMs) &&
        (!Number.isFinite(lastObservedAtMs) || observedAtMs > lastObservedAtMs)
      ) {
        lastObservedAtMs = observedAtMs;
        lastCommentId = comment.id;
      }

      for (const variant of variants) {
        const externalId = buildDriveExternalId(file.id, comment.id);
        const sourceUrl =
          file.webViewLink ??
          `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`;

        const title = buildTaskTitle({
          fileName: file.name?.trim() || `File ${file.id}`,
          comment,
          variant,
        });

        const dedupeKey = buildGoogleDriveCommentDedupeKey({
          fileId: file.id,
          commentId: comment.id,
          variant,
        });

        if (input.dryRun) {
          tasks.push({
            fileId: file.id,
            commentId: comment.id,
            variant,
            operation: "created",
            taskId: "dry-run",
            title,
            sourceUrl,
          });
          continue;
        }

        try {
          const existingReceipt = await prisma.integrationReceipt.findUnique({
            where: { dedupeKey },
            select: { id: true, taskId: true },
          });

          if (existingReceipt?.taskId) {
            const existingTask = await prisma.task.findUnique({
              where: { id: existingReceipt.taskId },
              select: { id: true, title: true, status: true },
            });

            if (existingTask && existingTask.status === "DONE") {
              await prisma.$transaction(async (transaction) => {
                await transaction.task.update({
                  where: { id: existingTask.id },
                  data: {
                    status: defaultStatus,
                    completedOn: null,
                    notes: buildTaskNotes({
                      fileName: file.name?.trim() || `File ${file.id}`,
                      sourceUrl,
                      comment,
                      variant,
                    }),
                    dueDate: addHours(new Date(), config.dueInHours),
                    metadata: {
                      integration: {
                        provider: "google_workspace",
                        externalId,
                        externalObjectType: "drive_comment",
                        ruleId: rule.id,
                        sourceUrl,
                        lastObservedAt: observedAtIso,
                        dedupeKey,
                      },
                    },
                  },
                });

                await transaction.statusHistory.create({
                  data: {
                    taskId: existingTask.id,
                    fromStatus: "DONE",
                    toStatus: defaultStatus,
                    changedBy: input.userId,
                  },
                });

                await transaction.integrationReceipt.update({
                  where: { id: existingReceipt.id },
                  data: {
                    sourceUrl,
                    lastObservedAt: Number.isFinite(observedAtMs)
                      ? new Date(observedAtMs)
                      : new Date(),
                  },
                });

                await publishDomainEvent(
                  {
                    eventType: "integration.google.drive_comment_task_reopened",
                    aggregateType: "integration_rule",
                    aggregateId: rule.id,
                    payload: {
                      ruleId: rule.id,
                      taskId: existingTask.id,
                      fileId: file.id,
                      commentId: comment.id,
                      variant,
                      sourceUrl,
                    },
                    idempotencyKey: buildOutboxIdempotencyKey({
                      aggregateType: "integration_rule",
                      aggregateId: rule.id,
                      eventType: `google_drive_comment_reopened_${externalId}_${variant}`,
                    }),
                  },
                  transaction
                );
              });

              reopenedTasks += 1;
              tasks.push({
                fileId: file.id,
                commentId: comment.id,
                variant,
                operation: "reopened",
                taskId: existingTask.id,
                title: existingTask.title,
                sourceUrl,
              });
              continue;
            }

            dedupedTasks += 1;
            continue;
          }

          const createdTask = await withRetries(async () =>
            prisma.$transaction(async (transaction) => {
              const receipt = await transaction.integrationReceipt.create({
                data: {
                  ruleId: rule.id,
                  dedupeKey,
                  externalObjectType: "drive_comment",
                  externalObjectId: externalId,
                  sourceUrl,
                  lastObservedAt: Number.isFinite(observedAtMs)
                    ? new Date(observedAtMs)
                    : new Date(),
                  metadata: {
                    fileId: file.id,
                    commentId: comment.id,
                    variant,
                    commenter: comment.author?.emailAddress ?? comment.author?.displayName ?? null,
                  },
                },
              });

              const assigneeId = await findAssigneeByEmail(
                input.userId,
                comment.author?.emailAddress ?? null
              );

              const nextColumnOrder = await getNextColumnOrder(
                transaction as unknown as typeof prisma,
                defaultStatus
              );

              const task = await transaction.task.create({
                data: {
                  title,
                  notes: buildTaskNotes({
                    fileName: file.name?.trim() || `File ${file.id}`,
                    sourceUrl,
                    comment,
                    variant,
                  }),
                  status: defaultStatus,
                  dueDate: addHours(new Date(), config.dueInHours),
                  assignedOn: new Date(),
                  columnOrder: nextColumnOrder,
                  metadata: {
                    integration: {
                      provider: "google_workspace",
                      externalId,
                      externalObjectType: "drive_comment",
                      ruleId: rule.id,
                      sourceUrl,
                      lastObservedAt: observedAtIso,
                      dedupeKey,
                    },
                  },
                  responsible: {
                    connect: [{ id: assigneeId }],
                  },
                  statusHistory: {
                    create: {
                      fromStatus: null,
                      toStatus: defaultStatus,
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
                  eventType: "integration.google.drive_comment_task_created",
                  aggregateType: "integration_rule",
                  aggregateId: rule.id,
                  payload: {
                    ruleId: rule.id,
                    taskId: task.id,
                    fileId: file.id,
                    commentId: comment.id,
                    variant,
                    sourceUrl,
                  },
                  idempotencyKey: buildOutboxIdempotencyKey({
                    aggregateType: "integration_rule",
                    aggregateId: rule.id,
                    eventType: `google_drive_comment_created_${externalId}_${variant}`,
                  }),
                },
                transaction
              );

              return task;
            })
          );

          createdTasks += 1;
          tasks.push({
            fileId: file.id,
            commentId: comment.id,
            variant,
            operation: "created",
            taskId: createdTask.id,
            title: createdTask.title,
            sourceUrl,
          });

          console.info("integration.google.drive_comment.created", {
            provider: "google_workspace",
            ruleId: rule.id,
            externalId,
            variant,
            taskId: createdTask.id,
          });
        } catch (error) {
          failedTasks += 1;
          const message = error instanceof Error ? error.message : String(error);
          errors.push({ fileId: file.id, commentId: comment.id, error: message });

          await recordDeadLetterFailure({
            ruleId: rule.id,
            fileId: file.id,
            commentId: comment.id,
            variant,
            error: message,
          });
        }
      }
    }
  }

  const checkpointOut: GoogleDriveCheckpoint = {
    lastObservedAt: Number.isFinite(lastObservedAtMs)
      ? new Date(lastObservedAtMs).toISOString()
      : checkpoint.lastObservedAt,
    lastCommentId,
  };

  await prisma.integrationRule.update({
    where: { id: rule.id },
    data: {
      checkpoint: checkpointOut as unknown as Prisma.InputJsonValue,
      lastObservedAt: checkpointOut.lastObservedAt
        ? new Date(checkpointOut.lastObservedAt)
        : rule.lastObservedAt,
      lastRunAt: new Date(),
      lastError: errors.length > 0 ? `${errors.length} drive escalation(s) failed` : null,
    },
  });

  await prisma.integrationConnection.updateMany({
    where: {
      userId: input.userId,
      provider: IntegrationProvider.GOOGLE_WORKSPACE,
    },
    data: {
      status: IntegrationConnectionStatus.CONNECTED,
      lastError: errors.length > 0 ? `${errors.length} drive escalation(s) failed` : null,
      lastSyncedAt: new Date(),
    },
  });

  _cbSuccess = true;
  return {
    ruleId: rule.id,
    enabled: true,
    scannedFiles: files.length,
    scannedComments,
    createdTasks,
    reopenedTasks,
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
