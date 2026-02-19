import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  Prisma,
  type IntegrationConnection,
  type IntegrationRule,
  type TaskStatus,
} from "@/generated/prisma/client";
import { getNextColumnOrder } from "@/lib/task-order";
import { prisma } from "@/lib/prisma";
import { protectIntegrationSecret, unprotectIntegrationSecret } from "@/lib/integrations/token-crypto";
import { buildOutboxIdempotencyKey, publishDomainEvent } from "@/lib/event-bus";
import { withRetries } from "@/lib/integrations/with-retries";
import { isCircuitClosed, recordSuccess, recordFailure, CircuitOpenError, getCircuitState } from "@/lib/integrations/circuit-breaker";

export const GMAIL_RULE_KEY = "gmail_commitment_capture";
const GMAIL_THREADS_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/threads";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

type SupportedAutoTaskStatus = "QUEUED" | "ACTIVE" | "NOT_DONE";

export interface GmailCaptureRuleConfig {
  label: string;
  includeStarred: boolean;
  maxResults: number;
}

interface GmailRuleCheckpoint {
  lastInternalDateMs?: number;
  lastThreadId?: string;
}

interface GmailThreadListItem {
  id: string;
  snippet?: string;
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessage {
  id?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: {
    headers?: GmailHeader[];
  };
}

interface GmailThreadDetail {
  id: string;
  snippet?: string;
  historyId?: string;
  messages?: GmailMessage[];
}

export interface GmailCapturedTask {
  threadId: string;
  taskId: string;
  title: string;
  dueDate: string | null;
  sourceUrl: string;
}

export interface GmailCaptureRunResult {
  ruleId: string;
  enabled: boolean;
  scannedThreads: number;
  createdTasks: number;
  dedupedThreads: number;
  failedThreads: number;
  cursor: GmailRuleCheckpoint;
  tasks: GmailCapturedTask[];
  errors: Array<{ threadId: string; error: string }>;
}

export interface GmailRuleState {
  id: string;
  key: string;
  enabled: boolean;
  statusOverride: SupportedAutoTaskStatus | null;
  config: GmailCaptureRuleConfig;
  checkpoint: GmailRuleCheckpoint;
  lastObservedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface GmailRulePatch {
  enabled?: boolean;
  statusOverride?: SupportedAutoTaskStatus | null;
  config?: Partial<GmailCaptureRuleConfig>;
}

export class GoogleIntegrationAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleIntegrationAuthError";
  }
}

export function defaultGmailCaptureRuleConfig(): GmailCaptureRuleConfig {
  return {
    label: "wg-action",
    includeStarred: true,
    maxResults: 25,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeConfig(raw: unknown): GmailCaptureRuleConfig {
  const input = asRecord(raw);
  const fallback = defaultGmailCaptureRuleConfig();

  const label = typeof input.label === "string" && input.label.trim().length > 0
    ? input.label.trim()
    : fallback.label;

  const includeStarred =
    typeof input.includeStarred === "boolean"
      ? input.includeStarred
      : fallback.includeStarred;

  const maxResultsRaw = input.maxResults;
  const maxResults =
    typeof maxResultsRaw === "number" && Number.isInteger(maxResultsRaw)
      ? Math.max(1, Math.min(100, maxResultsRaw))
      : fallback.maxResults;

  return {
    label,
    includeStarred,
    maxResults,
  };
}

function normalizeCheckpoint(raw: unknown): GmailRuleCheckpoint {
  const input = asRecord(raw);
  const next: GmailRuleCheckpoint = {};

  if (typeof input.lastInternalDateMs === "number" && Number.isFinite(input.lastInternalDateMs)) {
    next.lastInternalDateMs = input.lastInternalDateMs;
  }
  if (typeof input.lastThreadId === "string" && input.lastThreadId.length > 0) {
    next.lastThreadId = input.lastThreadId;
  }

  return next;
}

function parseHeader(headers: GmailHeader[] | undefined, headerName: string): string | null {
  if (!headers) return null;
  const header = headers.find((item) => item.name.toLowerCase() === headerName.toLowerCase());
  return header?.value ?? null;
}

function extractSenderEmail(rawFrom: string | null): string | null {
  if (!rawFrom) return null;
  const match = rawFrom.match(/<([^>]+)>/);
  if (match?.[1]) return match[1].trim();
  if (rawFrom.includes("@")) return rawFrom.trim();
  return null;
}

function startOfLocalDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function nextWeekday(targetDay: number, now = new Date()): Date {
  const day = now.getDay();
  let diff = (targetDay - day + 7) % 7;
  if (diff === 0) diff = 7;
  const next = new Date(now);
  next.setDate(now.getDate() + diff);
  return startOfLocalDay(next);
}

function parseUSDate(raw: string): Date | null {
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return new Date(year, month - 1, day);
  }

  const mmddyyyy = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (!mmddyyyy) return null;

  const month = Number(mmddyyyy[1]);
  const day = Number(mmddyyyy[2]);
  const yearRaw = mmddyyyy[3];
  const nowYear = new Date().getFullYear();
  const year = yearRaw
    ? yearRaw.length === 2
      ? Number(`20${yearRaw}`)
      : Number(yearRaw)
    : nowYear;

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const next = new Date(year, month - 1, day);
  if (Number.isNaN(next.getTime())) return null;
  return startOfLocalDay(next);
}

export function extractDuePhrase(input: string): { dueDate: Date | null; phrase: string | null } {
  const text = input.trim();
  if (!text) {
    return { dueDate: null, phrase: null };
  }

  const lower = text.toLowerCase();
  const todayPatterns = ["by today", "due today", "today"];
  if (todayPatterns.some((pattern) => lower.includes(pattern))) {
    return { dueDate: startOfLocalDay(new Date()), phrase: "today" };
  }

  const tomorrowPatterns = ["by tomorrow", "due tomorrow", "tomorrow"];
  if (tomorrowPatterns.some((pattern) => lower.includes(pattern))) {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    return { dueDate: startOfLocalDay(next), phrase: "tomorrow" };
  }

  const weekdayMap: Record<string, number> = {
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 0,
  };

  const weekdayMatch = lower.match(/(?:by|due)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
  if (weekdayMatch?.[1]) {
    const weekday = weekdayMatch[1];
    return {
      dueDate: nextWeekday(weekdayMap[weekday]),
      phrase: weekday,
    };
  }

  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch?.[1]) {
    return {
      dueDate: parseUSDate(isoMatch[1]),
      phrase: isoMatch[1],
    };
  }

  const usMatch = text.match(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/);
  if (usMatch?.[1]) {
    return {
      dueDate: parseUSDate(usMatch[1]),
      phrase: usMatch[1],
    };
  }

  return { dueDate: null, phrase: null };
}

export function buildGoogleGmailDedupeKey(input: {
  threadId: string;
  ruleVariant: string;
}): string {
  return [
    "google_workspace",
    "gmail_thread",
    input.threadId,
    input.ruleVariant.trim().toLowerCase(),
  ].join(":");
}

function createRuleVariant(config: GmailCaptureRuleConfig): string {
  return `label=${config.label}|starred=${config.includeStarred ? "1" : "0"}`;
}

function buildThreadUrl(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#inbox/${threadId}`;
}

async function markConnectionError(
  userId: string,
  message: string
): Promise<void> {
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
    throw new GoogleIntegrationAuthError("Google token refresh response missing access token");
  }

  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : null;
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : null;
  const tokenType = typeof body.token_type === "string" ? body.token_type : null;

  return { accessToken, expiresAt, refreshToken, tokenType };
}

async function refreshGoogleAccessToken(connection: IntegrationConnection): Promise<string> {
  const refreshToken = unprotectIntegrationSecret(connection.refreshToken);
  if (!refreshToken) {
    throw new GoogleIntegrationAuthError("Google refresh token is missing");
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new GoogleIntegrationAuthError("Google OAuth client credentials are missing");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
  });

  const parsed = await withRetries(
    async () => {
      const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
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
          "Google token refresh failed";
        throw new GoogleIntegrationAuthError(reason);
      }

      return parseTokenResponse(json);
    },
    { maxAttempts: 2, baseDelayMs: 500, maxDelayMs: 2000 }
  );

  await prisma.integrationConnection.update({
    where: {
      userId_provider: {
        userId: connection.userId,
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
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

/** In-flight refresh promises keyed by userId to prevent concurrent refresh races. */
const inflightRefreshes = new Map<string, Promise<string>>();

async function getValidGoogleAccessToken(userId: string): Promise<string> {
  const connection = await prisma.integrationConnection.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
      },
    },
  });

  if (!connection || connection.status !== IntegrationConnectionStatus.CONNECTED) {
    throw new GoogleIntegrationAuthError("Google Workspace is not connected");
  }

  const token = unprotectIntegrationSecret(connection.accessToken);
  if (!token) {
    throw new GoogleIntegrationAuthError("Google access token is missing");
  }

  const expiresSoon =
    Boolean(connection.expiresAt) &&
    connection.expiresAt!.getTime() <= Date.now() + 60_000;

  if (expiresSoon) {
    const existing = inflightRefreshes.get(userId);
    if (existing) return existing;

    const promise = refreshGoogleAccessToken(connection).finally(() => {
      inflightRefreshes.delete(userId);
    });
    inflightRefreshes.set(userId, promise);
    return promise;
  }

  return token;
}

async function gmailFetchJson<T>(
  accessToken: string,
  url: URL
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new GoogleIntegrationAuthError("Google access token is invalid or expired");
  }

  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || payload === null) {
    throw new Error(`Gmail API request failed (${response.status})`);
  }

  return payload;
}

async function listCandidateThreads(input: {
  accessToken: string;
  config: GmailCaptureRuleConfig;
  checkpoint: GmailRuleCheckpoint;
}): Promise<GmailThreadListItem[]> {
  const queryClauses: string[] = [];
  const normalizedLabel = input.config.label.trim();

  if (normalizedLabel && input.config.includeStarred) {
    queryClauses.push(`(label:${normalizedLabel} OR is:starred)`);
  } else if (normalizedLabel) {
    queryClauses.push(`label:${normalizedLabel}`);
  } else if (input.config.includeStarred) {
    queryClauses.push("is:starred");
  }

  if (input.checkpoint.lastInternalDateMs) {
    const cursorSeconds = Math.floor(input.checkpoint.lastInternalDateMs / 1000);
    queryClauses.push(`after:${Math.max(0, cursorSeconds - 60)}`);
  }

  const url = new URL(GMAIL_THREADS_ENDPOINT);
  if (queryClauses.length > 0) {
    url.searchParams.set("q", queryClauses.join(" "));
  }
  url.searchParams.set("maxResults", String(input.config.maxResults));

  const payload = await gmailFetchJson<{ threads?: GmailThreadListItem[] }>(input.accessToken, url);
  return payload.threads ?? [];
}

async function getThreadDetail(
  accessToken: string,
  threadId: string
): Promise<GmailThreadDetail> {
  const url = new URL(`${GMAIL_THREADS_ENDPOINT}/${threadId}`);
  url.searchParams.set("format", "metadata");
  url.searchParams.append("metadataHeaders", "Subject");
  url.searchParams.append("metadataHeaders", "From");

  return gmailFetchJson<GmailThreadDetail>(accessToken, url);
}

function getNewestMessageInternalDate(thread: GmailThreadDetail): number {
  const candidates = (thread.messages ?? [])
    .map((message) => Number(message.internalDate ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (candidates.length === 0) {
    return Date.now();
  }

  return Math.max(...candidates);
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

function humanizeThreadNotes(input: {
  sender: string | null;
  snippet: string;
  sourceUrl: string;
  duePhrase: string | null;
}): string {
  const lines = [
    "Created from Gmail thread",
    input.sender ? `From: ${input.sender}` : null,
    input.duePhrase ? `Detected due phrase: ${input.duePhrase}` : null,
    `Source: ${input.sourceUrl}`,
    "",
    input.snippet,
  ].filter(Boolean);

  return lines.join("\n");
}


async function recordDeadLetterFailure(input: {
  ruleId: string;
  threadId: string;
  error: string;
}): Promise<void> {
  await prisma.outboxEvent.create({
    data: {
      eventType: "integration.gmail.capture.failed",
      aggregateType: "integration_rule",
      aggregateId: input.ruleId,
      schemaVersion: 1,
      payload: {
        threadId: input.threadId,
        error: input.error,
      },
      idempotencyKey: `dead-letter:gmail-capture:${input.ruleId}:${input.threadId}:${Date.now()}`,
      status: "DEAD_LETTER",
      retryCount: 0,
      nextAttemptAt: new Date(),
      failedAt: new Date(),
      error: input.error,
      lastAttemptAt: new Date(),
    },
  });
}

function parseThreadSummary(thread: GmailThreadDetail): {
  subject: string;
  sender: string | null;
  snippet: string;
  dueDate: Date | null;
  duePhrase: string | null;
} {
  const firstMessage = (thread.messages ?? [])[0];
  const headers = firstMessage?.payload?.headers;
  const subject = parseHeader(headers, "Subject") ?? thread.snippet ?? "Email follow-up";
  const rawSender = parseHeader(headers, "From");
  const sender = extractSenderEmail(rawSender) ?? rawSender;
  const snippet = thread.snippet?.trim() || "(No preview text available)";
  const due = extractDuePhrase(`${subject}\n${snippet}`);

  return {
    subject,
    sender,
    snippet,
    dueDate: due.dueDate,
    duePhrase: due.phrase,
  };
}

export async function getOrCreateGmailCaptureRule(userId: string): Promise<IntegrationRule> {
  return prisma.integrationRule.upsert({
    where: {
      userId_provider_key: {
        userId,
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
        key: GMAIL_RULE_KEY,
      },
    },
    update: {},
    create: {
      userId,
      provider: IntegrationProvider.GOOGLE_WORKSPACE,
      key: GMAIL_RULE_KEY,
      enabled: true,
      statusOverride: null,
      config: defaultGmailCaptureRuleConfig() as unknown as Prisma.InputJsonValue,
      checkpoint: {} as unknown as Prisma.InputJsonValue,
    },
  });
}

export function serializeGmailRuleState(rule: IntegrationRule): GmailRuleState {
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

export async function patchGmailRule(
  userId: string,
  patch: GmailRulePatch
): Promise<GmailRuleState> {
  const existing = await getOrCreateGmailCaptureRule(userId);
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

  return serializeGmailRuleState(updated);
}

export async function runGmailCapture(input: {
  userId: string;
  dryRun?: boolean;
}): Promise<GmailCaptureRunResult> {
  const rule = await getOrCreateGmailCaptureRule(input.userId);
  const config = normalizeConfig(rule.config);
  const checkpoint = normalizeCheckpoint(rule.checkpoint);

  if (!rule.enabled) {
    return {
      ruleId: rule.id,
      enabled: false,
      scannedThreads: 0,
      createdTasks: 0,
      dedupedThreads: 0,
      failedThreads: 0,
      cursor: checkpoint,
      tasks: [],
      errors: [],
    };
  }

  const CB_PROVIDER = "google_gmail";
  if (!isCircuitClosed(CB_PROVIDER, input.userId)) {
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

  const candidates = await listCandidateThreads({
    accessToken,
    config,
    checkpoint,
  });

  const ruleVariant = createRuleVariant(config);
  const status = toSupportedStatus(rule.statusOverride);
  let maxInternalDateMs = checkpoint.lastInternalDateMs ?? 0;
  let lastThreadId = checkpoint.lastThreadId;

  const tasks: GmailCapturedTask[] = [];
  const errors: Array<{ threadId: string; error: string }> = [];
  let dedupedThreads = 0;
  let createdTasks = 0;
  let failedThreads = 0;

  for (const candidate of candidates) {
    try {
      const thread = await withRetries(() => getThreadDetail(accessToken, candidate.id));
      const newestMessageDate = getNewestMessageInternalDate(thread);
      if (newestMessageDate > maxInternalDateMs) {
        maxInternalDateMs = newestMessageDate;
        lastThreadId = thread.id;
      }

      const sourceUrl = buildThreadUrl(thread.id);
      const dedupeKey = buildGoogleGmailDedupeKey({
        threadId: thread.id,
        ruleVariant,
      });

      const summary = parseThreadSummary(thread);
      const integrationMetadata = {
        provider: "google_workspace",
        externalId: thread.id,
        externalObjectType: "gmail_thread",
        ruleId: rule.id,
        sourceUrl,
        lastObservedAt: new Date(newestMessageDate).toISOString(),
        dedupeKey,
      };

      if (input.dryRun) {
        tasks.push({
          threadId: thread.id,
          taskId: "dry-run",
          title: summary.subject,
          dueDate: summary.dueDate ? summary.dueDate.toISOString() : null,
          sourceUrl,
        });
        continue;
      }

      const createdTask = await withRetries(async () => {
        try {
          return await prisma.$transaction(async (transaction) => {
            const receipt = await transaction.integrationReceipt.create({
              data: {
                ruleId: rule.id,
                dedupeKey,
                externalObjectType: "gmail_thread",
                externalObjectId: thread.id,
                sourceUrl,
                lastObservedAt: new Date(newestMessageDate),
                metadata: {
                  subject: summary.subject,
                  sender: summary.sender,
                },
              },
            });

            const nextColumnOrder = await getNextColumnOrder(
              transaction as unknown as typeof prisma,
              status
            );

            const task = await transaction.task.create({
              data: {
                title: summary.subject,
                notes: humanizeThreadNotes({
                  sender: summary.sender,
                  snippet: summary.snippet,
                  sourceUrl,
                  duePhrase: summary.duePhrase,
                }),
                status,
                dueDate: summary.dueDate ?? undefined,
                assignedOn: new Date(),
                columnOrder: nextColumnOrder,
                metadata: {
                  integration: integrationMetadata,
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
                dueDate: true,
              },
            });

            await transaction.integrationReceipt.update({
              where: { id: receipt.id },
              data: {
                taskId: task.id,
                lastObservedAt: new Date(newestMessageDate),
                sourceUrl,
              },
            });

            await publishDomainEvent(
              {
                eventType: "integration.gmail.task_created",
                aggregateType: "integration_rule",
                aggregateId: rule.id,
                payload: {
                  ruleId: rule.id,
                  taskId: task.id,
                  externalId: thread.id,
                  sourceUrl,
                },
                idempotencyKey: buildOutboxIdempotencyKey({
                  aggregateType: "integration_rule",
                  aggregateId: rule.id,
                  eventType: `gmail_task_created_${thread.id}`,
                }),
              },
              transaction
            );

            console.info("integration.gmail.capture.created", {
              provider: "google_workspace",
              ruleId: rule.id,
              externalId: thread.id,
              taskId: task.id,
            });

            return {
              taskId: task.id,
              title: task.title,
              dueDate: task.dueDate ? task.dueDate.toISOString() : null,
            };
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
        dedupedThreads += 1;
        console.info("integration.gmail.capture.deduped", {
          provider: "google_workspace",
          ruleId: rule.id,
          externalId: thread.id,
          dedupeKey,
        });
        continue;
      }

      createdTasks += 1;
      tasks.push({
        threadId: thread.id,
        taskId: createdTask.taskId,
        title: createdTask.title,
        dueDate: createdTask.dueDate,
        sourceUrl,
      });
    } catch (error) {
      failedThreads += 1;
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ threadId: candidate.id, error: message });

      await recordDeadLetterFailure({
        ruleId: rule.id,
        threadId: candidate.id,
        error: message,
      });

      console.error("integration.gmail.capture.failed", {
        provider: "google_workspace",
        ruleId: rule.id,
        externalId: candidate.id,
        error: message,
      });
    }
  }

  const nextCheckpoint: GmailRuleCheckpoint = {
    lastInternalDateMs: maxInternalDateMs > 0 ? maxInternalDateMs : checkpoint.lastInternalDateMs,
    lastThreadId,
  };

  await prisma.integrationRule.update({
    where: { id: rule.id },
    data: {
      checkpoint: nextCheckpoint as unknown as Prisma.InputJsonValue,
      lastObservedAt:
        nextCheckpoint.lastInternalDateMs && nextCheckpoint.lastInternalDateMs > 0
          ? new Date(nextCheckpoint.lastInternalDateMs)
          : rule.lastObservedAt,
      lastRunAt: new Date(),
      lastError: errors.length > 0 ? `${errors.length} thread(s) failed` : null,
    },
  });

  await prisma.integrationConnection.updateMany({
    where: {
      userId: input.userId,
      provider: IntegrationProvider.GOOGLE_WORKSPACE,
    },
    data: {
      status: IntegrationConnectionStatus.CONNECTED,
      lastError: errors.length > 0 ? `${errors.length} thread(s) failed` : null,
      lastSyncedAt: new Date(),
    },
  });

  _cbSuccess = true;
  return {
    ruleId: rule.id,
    enabled: true,
    scannedThreads: candidates.length,
    createdTasks,
    dedupedThreads,
    failedThreads,
    cursor: nextCheckpoint,
    tasks,
    errors,
  };
  } finally {
    if (_cbSuccess) recordSuccess(CB_PROVIDER, input.userId);
    else recordFailure(CB_PROVIDER, input.userId);
  }
}
