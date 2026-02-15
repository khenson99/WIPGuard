import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  Prisma,
  type IntegrationConnection,
  type IntegrationRule,
  type TaskStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { unprotectIntegrationSecret } from "@/lib/integrations/token-crypto";
import { computeRetryDelayMs } from "@/lib/outbox-worker";
import { buildOutboxIdempotencyKey, publishDomainEvent } from "@/lib/event-bus";
import { getNextColumnOrder } from "@/lib/task-order";

export const SLACK_UNANSWERED_RULE_KEY = "slack_unanswered_request_detector";

type SupportedAutoTaskStatus = "QUEUED" | "ACTIVE" | "NOT_DONE";

export interface SlackUnansweredConfig {
  channelIds: string[];
  requestPatterns: string[];
  slaMinutes: number;
  maxMessagesPerChannel: number;
  triageDueMinutes: number;
  assigneeUserId: string | null;
}

interface SlackUnansweredCheckpoint {
  lastScannedAt?: string;
  lastMessageTs?: string;
}

interface SlackMessage {
  type?: string;
  subtype?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  reply_count?: number;
  bot_id?: string;
}

interface SlackChannelInfo {
  id?: string;
  name?: string;
  creator?: string;
}

interface SlackUserInfo {
  user?: {
    id?: string;
    profile?: {
      email?: string;
    };
  };
}

interface SlackRulePatch {
  enabled?: boolean;
  statusOverride?: SupportedAutoTaskStatus | null;
  config?: Partial<SlackUnansweredConfig>;
}

export interface SlackUnansweredRuleState {
  id: string;
  key: string;
  enabled: boolean;
  statusOverride: SupportedAutoTaskStatus | null;
  config: SlackUnansweredConfig;
  checkpoint: SlackUnansweredCheckpoint;
  lastObservedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface SlackUnansweredCreatedTask {
  channelId: string;
  threadTs: string;
  taskId: string;
  title: string;
  sourceUrl: string;
}

export interface SlackUnansweredRunResult {
  ruleId: string;
  enabled: boolean;
  scannedMessages: number;
  breachedRequests: number;
  createdTasks: number;
  dedupedTasks: number;
  failedTasks: number;
  cursor: SlackUnansweredCheckpoint;
  tasks: SlackUnansweredCreatedTask[];
  errors: Array<{ externalId: string; error: string }>;
}

class SlackIntegrationAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlackIntegrationAuthError";
  }
}

export function defaultSlackUnansweredConfig(): SlackUnansweredConfig {
  return {
    channelIds: [],
    requestPatterns: ["\\?", "\\bcan you\\b", "\\bplease\\b", "\\bneed\\b"],
    slaMinutes: 120,
    maxMessagesPerChannel: 100,
    triageDueMinutes: 60,
    assigneeUserId: null,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeConfig(raw: unknown): SlackUnansweredConfig {
  const input = asRecord(raw);
  const fallback = defaultSlackUnansweredConfig();

  const channelIds = Array.isArray(input.channelIds)
    ? input.channelIds.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0
      )
    : fallback.channelIds;

  const requestPatterns = Array.isArray(input.requestPatterns)
    ? input.requestPatterns.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0
      )
    : fallback.requestPatterns;

  const slaMinutes =
    typeof input.slaMinutes === "number" && Number.isInteger(input.slaMinutes)
      ? Math.max(5, Math.min(1440, input.slaMinutes))
      : fallback.slaMinutes;

  const maxMessagesPerChannel =
    typeof input.maxMessagesPerChannel === "number" &&
    Number.isInteger(input.maxMessagesPerChannel)
      ? Math.max(10, Math.min(500, input.maxMessagesPerChannel))
      : fallback.maxMessagesPerChannel;

  const triageDueMinutes =
    typeof input.triageDueMinutes === "number" && Number.isInteger(input.triageDueMinutes)
      ? Math.max(5, Math.min(720, input.triageDueMinutes))
      : fallback.triageDueMinutes;

  const assigneeUserId =
    typeof input.assigneeUserId === "string" && input.assigneeUserId.trim().length > 0
      ? input.assigneeUserId.trim()
      : fallback.assigneeUserId;

  return {
    channelIds: Array.from(new Set(channelIds)),
    requestPatterns: requestPatterns.length > 0 ? requestPatterns : fallback.requestPatterns,
    slaMinutes,
    maxMessagesPerChannel,
    triageDueMinutes,
    assigneeUserId,
  };
}

function normalizeCheckpoint(raw: unknown): SlackUnansweredCheckpoint {
  const input = asRecord(raw);
  const checkpoint: SlackUnansweredCheckpoint = {};

  if (typeof input.lastScannedAt === "string" && input.lastScannedAt.length > 0) {
    checkpoint.lastScannedAt = input.lastScannedAt;
  }
  if (typeof input.lastMessageTs === "string" && input.lastMessageTs.length > 0) {
    checkpoint.lastMessageTs = input.lastMessageTs;
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

function buildSlackExternalId(channelId: string, threadTs: string): string {
  return `${channelId}:${threadTs}`;
}

export function buildSlackUnansweredDedupeKey(input: {
  channelId: string;
  threadTs: string;
  slaMinutes: number;
}): string {
  return [
    "slack",
    "slack_unanswered_request",
    buildSlackExternalId(input.channelId, input.threadTs),
    `sla-${input.slaMinutes}`,
  ].join(":");
}

function buildSlackThreadUrl(workspaceUrl: string | null, channelId: string, threadTs: string): string {
  const sanitized = workspaceUrl?.replace(/\/+$/, "") ?? "https://app.slack.com/client";
  const messageId = threadTs.replace(".", "");

  if (sanitized.startsWith("https://app.slack.com/client")) {
    return `${sanitized}/${channelId}/thread/${channelId}-${messageId}`;
  }

  return `${sanitized}/archives/${channelId}/p${messageId}`;
}

function tsToMs(ts: string | undefined): number {
  if (!ts || ts.trim().length === 0) {
    return Number.NaN;
  }
  const value = Number(ts);
  if (!Number.isFinite(value)) {
    return Number.NaN;
  }
  return Math.floor(value * 1000);
}

function compileRequestPatterns(patterns: string[]): RegExp[] {
  const compiled: RegExp[] = [];

  for (const pattern of patterns) {
    try {
      compiled.push(new RegExp(pattern, "i"));
    } catch {
      // Ignore malformed patterns and continue.
    }
  }

  return compiled;
}

function messageLooksLikeRequest(text: string, patterns: RegExp[]): boolean {
  const normalized = text.trim();
  if (normalized.length === 0) {
    return false;
  }

  for (const pattern of patterns) {
    if (pattern.test(normalized)) {
      return true;
    }
  }

  return false;
}

function isHumanMessage(message: SlackMessage): boolean {
  return (
    message.type === "message" &&
    !message.subtype &&
    !message.bot_id &&
    typeof message.user === "string" &&
    message.user.length > 0
  );
}

function hasQualifyingReply(input: {
  replies: SlackMessage[];
  requesterUserId: string;
  rootTs: string;
}): boolean {
  const rootMs = tsToMs(input.rootTs);

  for (const reply of input.replies) {
    if (!isHumanMessage(reply)) continue;
    if (!reply.ts) continue;

    const replyMs = tsToMs(reply.ts);
    if (!Number.isFinite(replyMs)) continue;
    if (Number.isFinite(rootMs) && replyMs <= rootMs) continue;
    if (reply.user === input.requesterUserId) continue;

    return true;
  }

  return false;
}

function buildTaskTitle(input: {
  channelName: string | null;
  text: string;
}): string {
  const prefix = input.channelName ? `#${input.channelName}` : "Slack";
  const shortText = input.text.trim().slice(0, 100);
  return `[Slack SLA] ${prefix} unanswered request: ${shortText}`;
}

function buildTaskNotes(input: {
  sourceUrl: string;
  channelId: string;
  channelName: string | null;
  requesterUserId: string;
  threadTs: string;
  text: string;
  slaMinutes: number;
  observedAt: Date;
}): string {
  const lines = [
    "Created from Slack unanswered-request detector.",
    `SLA window: ${input.slaMinutes} minute(s)`,
    `Observed breach at: ${input.observedAt.toISOString()}`,
    `Channel: ${input.channelName ? `#${input.channelName}` : input.channelId}`,
    `Requester Slack ID: ${input.requesterUserId}`,
    `Thread TS: ${input.threadTs}`,
    `Source: ${input.sourceUrl}`,
    "",
    "Original request:",
    input.text,
  ];

  return lines.join("\n");
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
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
      provider: IntegrationProvider.SLACK,
    },
    data: {
      status: IntegrationConnectionStatus.ERROR,
      lastError: message,
      lastSyncedAt: null,
    },
  });
}

async function getSlackConnection(userId: string): Promise<IntegrationConnection> {
  const connection = await prisma.integrationConnection.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: IntegrationProvider.SLACK,
      },
    },
  });

  if (!connection || connection.status !== IntegrationConnectionStatus.CONNECTED) {
    throw new SlackIntegrationAuthError("Slack is not connected");
  }

  return connection;
}

async function getSlackAuthContext(userId: string): Promise<{ token: string; workspaceUrl: string | null }> {
  const connection = await getSlackConnection(userId);
  const token = unprotectIntegrationSecret(connection.accessToken);
  if (!token) {
    throw new SlackIntegrationAuthError("Slack access token is missing");
  }

  const metadata = asRecord(connection.metadata);
  const workspaceUrl = typeof metadata.url === "string" ? metadata.url : null;

  return { token, workspaceUrl };
}

async function slackApiCall<T>(token: string, method: string, params: URLSearchParams): Promise<T> {
  const response = await fetch(`https://slack.com/api/${method}?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new SlackIntegrationAuthError("Slack access token is invalid");
  }

  const payload = (await response.json().catch(() => null)) as (T & { ok?: boolean; error?: string }) | null;
  if (!response.ok || !payload || payload.ok === false) {
    const errorMessage = payload?.error ?? `Slack API error (${response.status})`;
    throw new Error(errorMessage);
  }

  return payload;
}

async function fetchChannelMessages(input: {
  token: string;
  channelId: string;
  maxMessages: number;
  oldest: string;
}): Promise<SlackMessage[]> {
  const params = new URLSearchParams({
    channel: input.channelId,
    limit: String(input.maxMessages),
    oldest: input.oldest,
    inclusive: "true",
  });

  const payload = await slackApiCall<{ messages?: SlackMessage[] }>(
    input.token,
    "conversations.history",
    params
  );

  return payload.messages ?? [];
}

async function fetchThreadReplies(input: {
  token: string;
  channelId: string;
  threadTs: string;
}): Promise<SlackMessage[]> {
  const params = new URLSearchParams({
    channel: input.channelId,
    ts: input.threadTs,
    limit: "50",
    inclusive: "true",
  });

  const payload = await slackApiCall<{ messages?: SlackMessage[] }>(
    input.token,
    "conversations.replies",
    params
  );

  return payload.messages ?? [];
}

async function fetchChannelInfo(input: {
  token: string;
  channelId: string;
  cache: Map<string, SlackChannelInfo | null>;
}): Promise<SlackChannelInfo | null> {
  if (input.cache.has(input.channelId)) {
    return input.cache.get(input.channelId) ?? null;
  }

  const params = new URLSearchParams({
    channel: input.channelId,
  });

  const payload = await slackApiCall<{ channel?: SlackChannelInfo }>(
    input.token,
    "conversations.info",
    params
  );

  const channel = payload.channel ?? null;
  input.cache.set(input.channelId, channel);
  return channel;
}

async function fetchSlackUserEmail(input: {
  token: string;
  userId: string;
  cache: Map<string, string | null>;
}): Promise<string | null> {
  if (input.cache.has(input.userId)) {
    return input.cache.get(input.userId) ?? null;
  }

  const params = new URLSearchParams({
    user: input.userId,
  });

  const payload = await slackApiCall<SlackUserInfo>(input.token, "users.info", params);
  const email =
    typeof payload.user?.profile?.email === "string" && payload.user.profile.email.length > 0
      ? payload.user.profile.email
      : null;

  input.cache.set(input.userId, email);
  return email;
}

async function findAssigneeByEmail(fallbackUserId: string, email: string | null): Promise<string> {
  if (!email) return fallbackUserId;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  return user?.id ?? fallbackUserId;
}

async function resolveAssigneeId(input: {
  fallbackUserId: string;
  configuredAssigneeUserId: string | null;
  token: string;
  channelId: string;
  channelCache: Map<string, SlackChannelInfo | null>;
  userEmailCache: Map<string, string | null>;
}): Promise<{ assigneeId: string; channelName: string | null }> {
  if (input.configuredAssigneeUserId) {
    const explicit = await prisma.user.findUnique({
      where: { id: input.configuredAssigneeUserId },
      select: { id: true },
    });

    if (explicit?.id) {
      const channel = await fetchChannelInfo({
        token: input.token,
        channelId: input.channelId,
        cache: input.channelCache,
      });
      return { assigneeId: explicit.id, channelName: channel?.name ?? null };
    }
  }

  const channel = await fetchChannelInfo({
    token: input.token,
    channelId: input.channelId,
    cache: input.channelCache,
  });

  const ownerSlackId = channel?.creator ?? null;
  if (!ownerSlackId) {
    return { assigneeId: input.fallbackUserId, channelName: channel?.name ?? null };
  }

  const ownerEmail = await withRetries(() =>
    fetchSlackUserEmail({
      token: input.token,
      userId: ownerSlackId,
      cache: input.userEmailCache,
    })
  );

  const assigneeId = await findAssigneeByEmail(input.fallbackUserId, ownerEmail);
  return { assigneeId, channelName: channel?.name ?? null };
}

async function recordDeadLetterFailure(input: {
  ruleId: string;
  externalId: string;
  error: string;
}): Promise<void> {
  await prisma.outboxEvent.create({
    data: {
      eventType: "integration.slack.unanswered.failed",
      aggregateType: "integration_rule",
      aggregateId: input.ruleId,
      schemaVersion: 1,
      payload: {
        externalId: input.externalId,
        error: input.error,
      },
      idempotencyKey: `dead-letter:slack-unanswered:${input.ruleId}:${input.externalId}:${Date.now()}`,
      status: "DEAD_LETTER",
      retryCount: 0,
      nextAttemptAt: new Date(),
      failedAt: new Date(),
      error: input.error,
      lastAttemptAt: new Date(),
    },
  });
}

export async function getOrCreateSlackUnansweredRule(userId: string): Promise<IntegrationRule> {
  return prisma.integrationRule.upsert({
    where: {
      userId_provider_key: {
        userId,
        provider: IntegrationProvider.SLACK,
        key: SLACK_UNANSWERED_RULE_KEY,
      },
    },
    update: {},
    create: {
      userId,
      provider: IntegrationProvider.SLACK,
      key: SLACK_UNANSWERED_RULE_KEY,
      enabled: true,
      statusOverride: null,
      config: defaultSlackUnansweredConfig() as unknown as Prisma.InputJsonValue,
      checkpoint: {} as unknown as Prisma.InputJsonValue,
    },
  });
}

export function serializeSlackUnansweredRule(rule: IntegrationRule): SlackUnansweredRuleState {
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

export async function patchSlackUnansweredRule(
  userId: string,
  patch: SlackRulePatch
): Promise<SlackUnansweredRuleState> {
  const existing = await getOrCreateSlackUnansweredRule(userId);
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

  return serializeSlackUnansweredRule(updated);
}

export async function runSlackUnansweredDetector(input: {
  userId: string;
  dryRun?: boolean;
}): Promise<SlackUnansweredRunResult> {
  const rule = await getOrCreateSlackUnansweredRule(input.userId);
  const config = normalizeConfig(rule.config);
  const checkpoint = normalizeCheckpoint(rule.checkpoint);

  if (!rule.enabled) {
    return {
      ruleId: rule.id,
      enabled: false,
      scannedMessages: 0,
      breachedRequests: 0,
      createdTasks: 0,
      dedupedTasks: 0,
      failedTasks: 0,
      cursor: checkpoint,
      tasks: [],
      errors: [],
    };
  }

  if (config.channelIds.length === 0) {
    return {
      ruleId: rule.id,
      enabled: true,
      scannedMessages: 0,
      breachedRequests: 0,
      createdTasks: 0,
      dedupedTasks: 0,
      failedTasks: 0,
      cursor: checkpoint,
      tasks: [],
      errors: [],
    };
  }

  let token: string;
  let workspaceUrl: string | null;

  try {
    const authData = await getSlackAuthContext(input.userId);
    token = authData.token;
    workspaceUrl = authData.workspaceUrl;
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

  const patterns = compileRequestPatterns(config.requestPatterns);
  if (patterns.length === 0) {
    throw new Error("No valid request patterns configured for Slack unanswered detector");
  }

  const oldest = String(Math.floor(Date.now() / 1000 - config.slaMinutes * 60 * 2));
  const now = new Date();

  let scannedMessages = 0;
  let breachedRequests = 0;
  let createdTasks = 0;
  let dedupedTasks = 0;
  let failedTasks = 0;

  const tasks: SlackUnansweredCreatedTask[] = [];
  const errors: Array<{ externalId: string; error: string }> = [];

  let newestMessageTsMs = checkpoint.lastMessageTs ? tsToMs(checkpoint.lastMessageTs) : Number.NaN;

  const channelCache = new Map<string, SlackChannelInfo | null>();
  const userEmailCache = new Map<string, string | null>();

  for (const channelId of config.channelIds) {
    const messages = await withRetries(() =>
      fetchChannelMessages({
        token,
        channelId,
        maxMessages: config.maxMessagesPerChannel,
        oldest,
      })
    );

    scannedMessages += messages.length;

    for (const message of messages) {
      if (!isHumanMessage(message)) continue;
      if (!message.ts || !message.user || !message.text) continue;
      if (!messageLooksLikeRequest(message.text, patterns)) continue;

      const requesterUserId = message.user;
      const requestText = message.text;
      const rootTs = message.thread_ts ?? message.ts;
      const rootMs = tsToMs(rootTs);
      if (!Number.isFinite(rootMs)) continue;

      if (!Number.isFinite(newestMessageTsMs) || rootMs > newestMessageTsMs) {
        newestMessageTsMs = rootMs;
      }

      const elapsedMs = now.getTime() - rootMs;
      if (elapsedMs < config.slaMinutes * 60 * 1000) {
        continue;
      }

      const replies = await withRetries(() =>
        fetchThreadReplies({
          token,
          channelId,
          threadTs: rootTs,
        })
      );

      if (
        hasQualifyingReply({
          replies,
          requesterUserId,
          rootTs,
        })
      ) {
        continue;
      }

      breachedRequests += 1;

      const externalId = buildSlackExternalId(channelId, rootTs);
      const dedupeKey = buildSlackUnansweredDedupeKey({
        channelId,
        threadTs: rootTs,
        slaMinutes: config.slaMinutes,
      });

      const sourceUrl = buildSlackThreadUrl(workspaceUrl, channelId, rootTs);
      const status = toSupportedStatus(rule.statusOverride);

      const { assigneeId, channelName } = await resolveAssigneeId({
        fallbackUserId: input.userId,
        configuredAssigneeUserId: config.assigneeUserId,
        token,
        channelId,
        channelCache,
        userEmailCache,
      });

      const dueDate = addMinutes(now, config.triageDueMinutes);
      const title = buildTaskTitle({
        channelName,
        text: requestText,
      });

      if (input.dryRun) {
        tasks.push({
          channelId,
          threadTs: rootTs,
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
                  externalObjectType: "slack_unanswered_request",
                  externalObjectId: externalId,
                  sourceUrl,
                  lastObservedAt: now,
                  metadata: {
                    channelId,
                    threadTs: rootTs,
                    requesterUserId,
                    slaMinutes: config.slaMinutes,
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
                    sourceUrl,
                    channelId,
                    channelName,
                    requesterUserId,
                    threadTs: rootTs,
                    text: requestText,
                    slaMinutes: config.slaMinutes,
                    observedAt: now,
                  }),
                  status,
                  dueDate,
                  assignedOn: now,
                  columnOrder: nextColumnOrder,
                  metadata: {
                    integration: {
                      provider: "slack",
                      externalId,
                      externalObjectType: "slack_unanswered_request",
                      ruleId: rule.id,
                      sourceUrl,
                      lastObservedAt: now.toISOString(),
                      dedupeKey,
                    },
                    sla: {
                      minutes: config.slaMinutes,
                      breachedAt: now.toISOString(),
                    },
                  },
                  slackThread: rootTs,
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
                data: { taskId: task.id },
              });

              await publishDomainEvent(
                {
                  eventType: "integration.slack.unanswered_task_created",
                  aggregateType: "integration_rule",
                  aggregateId: rule.id,
                  payload: {
                    ruleId: rule.id,
                    taskId: task.id,
                    externalId,
                    sourceUrl,
                    channelId,
                    threadTs: rootTs,
                  },
                  idempotencyKey: buildOutboxIdempotencyKey({
                    aggregateType: "integration_rule",
                    aggregateId: rule.id,
                    eventType: `slack_unanswered_created_${externalId}`,
                  }),
                },
                transaction
              );

              console.info("integration.slack.unanswered.created", {
                provider: "slack",
                ruleId: rule.id,
                externalId,
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
          console.info("integration.slack.unanswered.deduped", {
            provider: "slack",
            ruleId: rule.id,
            externalId,
            dedupeKey,
          });
          continue;
        }

        createdTasks += 1;
        tasks.push({
          channelId,
          threadTs: rootTs,
          taskId: createdTask.id,
          title: createdTask.title,
          sourceUrl,
        });
      } catch (error) {
        failedTasks += 1;
        const messageText = error instanceof Error ? error.message : String(error);
        errors.push({ externalId, error: messageText });

        await recordDeadLetterFailure({
          ruleId: rule.id,
          externalId,
          error: messageText,
        });

        console.error("integration.slack.unanswered.failed", {
          provider: "slack",
          ruleId: rule.id,
          externalId,
          error: messageText,
        });
      }
    }
  }

  const checkpointOut: SlackUnansweredCheckpoint = {
    lastScannedAt: now.toISOString(),
    lastMessageTs:
      Number.isFinite(newestMessageTsMs) && newestMessageTsMs > 0
        ? String(newestMessageTsMs / 1000)
        : checkpoint.lastMessageTs,
  };

  await prisma.integrationRule.update({
    where: { id: rule.id },
    data: {
      checkpoint: checkpointOut as unknown as Prisma.InputJsonValue,
      lastObservedAt: now,
      lastRunAt: now,
      lastError: errors.length > 0 ? `${errors.length} unanswered request task(s) failed` : null,
    },
  });

  await prisma.integrationConnection.updateMany({
    where: {
      userId: input.userId,
      provider: IntegrationProvider.SLACK,
    },
    data: {
      status: IntegrationConnectionStatus.CONNECTED,
      lastError: errors.length > 0 ? `${errors.length} unanswered request task(s) failed` : null,
      lastSyncedAt: now,
    },
  });

  return {
    ruleId: rule.id,
    enabled: true,
    scannedMessages,
    breachedRequests,
    createdTasks,
    dedupedTasks,
    failedTasks,
    cursor: checkpointOut,
    tasks,
    errors,
  };
}
