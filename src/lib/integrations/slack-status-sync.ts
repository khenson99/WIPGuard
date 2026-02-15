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

export const SLACK_STATUS_SYNC_RULE_KEY = "slack_status_thread_sync";

type SupportedAutoTaskStatus = "QUEUED" | "ACTIVE" | "NOT_DONE";
type SlackSyncStatus = "ACTIVE" | "NOT_DONE" | "DONE";

export interface SlackStatusSyncConfig {
  statusesToSync: SlackSyncStatus[];
  maxTransitionsPerRun: number;
  statusMessages: Record<SlackSyncStatus, string>;
}

interface SlackStatusSyncCheckpoint {
  lastChangedAt?: string;
  lastStatusHistoryId?: string;
}

interface SlackThreadTarget {
  channelId: string;
  threadTs: string;
  sourceUrl: string | null;
  externalId: string;
}

interface SlackPostMessageResult {
  channel: string;
  ts: string;
}

interface SlackRulePatch {
  enabled?: boolean;
  statusOverride?: SupportedAutoTaskStatus | null;
  config?: Partial<SlackStatusSyncConfig>;
}

export interface SlackStatusSyncRuleState {
  id: string;
  key: string;
  enabled: boolean;
  statusOverride: SupportedAutoTaskStatus | null;
  config: SlackStatusSyncConfig;
  checkpoint: SlackStatusSyncCheckpoint;
  lastObservedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface SlackStatusSyncTaskUpdate {
  taskId: string;
  taskTitle: string;
  status: SlackSyncStatus;
  statusHistoryId: string;
  channelId: string;
  threadTs: string;
  sourceUrl: string;
  messageTs: string;
}

export interface SlackStatusSyncRunResult {
  ruleId: string;
  enabled: boolean;
  scannedTransitions: number;
  eligibleTransitions: number;
  postedUpdates: number;
  dedupedUpdates: number;
  failedUpdates: number;
  cursor: SlackStatusSyncCheckpoint;
  updates: SlackStatusSyncTaskUpdate[];
  errors: Array<{ taskId: string; statusHistoryId: string; error: string }>;
}

interface SlackStatusTransitionRecord {
  id: string;
  changedAt: Date;
  changedBy: string | null;
  toStatus: TaskStatus;
  task: {
    id: string;
    title: string;
    metadata: Prisma.JsonValue | null;
    slackThread: string | null;
  };
}

class SlackIntegrationAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlackIntegrationAuthError";
  }
}

export function defaultSlackStatusSyncConfig(): SlackStatusSyncConfig {
  return {
    statusesToSync: ["ACTIVE", "NOT_DONE", "DONE"],
    maxTransitionsPerRun: 200,
    statusMessages: {
      ACTIVE:
        ":large_blue_circle: WIPGuard update: *{taskTitle}* is now *ACTIVE* ({changedAt}). Owner: {actor}.",
      NOT_DONE:
        ":warning: WIPGuard update: *{taskTitle}* is marked *NOT_DONE* ({changedAt}). Owner: {actor}.",
      DONE:
        ":white_check_mark: WIPGuard update: *{taskTitle}* is now *DONE* ({changedAt}). Owner: {actor}.",
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeStatus(value: unknown): SlackSyncStatus | null {
  if (value === "ACTIVE" || value === "NOT_DONE" || value === "DONE") {
    return value;
  }
  return null;
}

function normalizeStatusList(value: unknown, fallback: SlackSyncStatus[]): SlackSyncStatus[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .map((item) => normalizeStatus(item))
    .filter((item): item is SlackSyncStatus => item !== null);

  if (normalized.length === 0) {
    return fallback;
  }

  return Array.from(new Set(normalized));
}

function normalizeStatusMessages(
  value: unknown,
  fallback: Record<SlackSyncStatus, string>
): Record<SlackSyncStatus, string> {
  const input = asRecord(value);

  const active =
    typeof input.ACTIVE === "string" && input.ACTIVE.trim().length > 0
      ? input.ACTIVE.trim()
      : fallback.ACTIVE;
  const notDone =
    typeof input.NOT_DONE === "string" && input.NOT_DONE.trim().length > 0
      ? input.NOT_DONE.trim()
      : fallback.NOT_DONE;
  const done =
    typeof input.DONE === "string" && input.DONE.trim().length > 0
      ? input.DONE.trim()
      : fallback.DONE;

  return {
    ACTIVE: active,
    NOT_DONE: notDone,
    DONE: done,
  };
}

function normalizeConfig(raw: unknown): SlackStatusSyncConfig {
  const input = asRecord(raw);
  const fallback = defaultSlackStatusSyncConfig();

  const statusesToSync = normalizeStatusList(input.statusesToSync, fallback.statusesToSync);

  const maxTransitionsPerRun =
    typeof input.maxTransitionsPerRun === "number" && Number.isInteger(input.maxTransitionsPerRun)
      ? Math.max(1, Math.min(500, input.maxTransitionsPerRun))
      : fallback.maxTransitionsPerRun;

  const statusMessages = normalizeStatusMessages(input.statusMessages, fallback.statusMessages);

  return {
    statusesToSync,
    maxTransitionsPerRun,
    statusMessages,
  };
}

function normalizeCheckpoint(raw: unknown): SlackStatusSyncCheckpoint {
  const input = asRecord(raw);
  const checkpoint: SlackStatusSyncCheckpoint = {};

  if (typeof input.lastChangedAt === "string" && input.lastChangedAt.length > 0) {
    checkpoint.lastChangedAt = input.lastChangedAt;
  }
  if (typeof input.lastStatusHistoryId === "string" && input.lastStatusHistoryId.length > 0) {
    checkpoint.lastStatusHistoryId = input.lastStatusHistoryId;
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

export function buildSlackStatusSyncDedupeKey(input: {
  externalObjectId: string;
  ruleVariant: string;
}): string {
  return ["slack", "slack_status_sync", input.externalObjectId, input.ruleVariant].join(":");
}

function tsToSlackMessageId(threadTs: string): string {
  return threadTs.replace(".", "");
}

function buildSlackThreadUrl(workspaceUrl: string | null, channelId: string, threadTs: string): string {
  const sanitized = workspaceUrl?.replace(/\/+$/, "") ?? "https://app.slack.com/client";
  const messageId = tsToSlackMessageId(threadTs);

  if (sanitized.startsWith("https://app.slack.com/client")) {
    return `${sanitized}/${channelId}/thread/${channelId}-${messageId}`;
  }

  return `${sanitized}/archives/${channelId}/p${messageId}`;
}

function renderStatusMessage(input: {
  template: string;
  taskTitle: string;
  status: SlackSyncStatus;
  changedAt: Date;
  actor: string;
  sourceUrl: string;
}): string {
  return input.template
    .replaceAll("{taskTitle}", input.taskTitle)
    .replaceAll("{status}", input.status)
    .replaceAll("{changedAt}", input.changedAt.toISOString())
    .replaceAll("{actor}", input.actor)
    .replaceAll("{sourceUrl}", input.sourceUrl);
}

function parseThreadTarget(input: {
  metadata: Prisma.JsonValue | null;
  slackThread: string | null;
  workspaceUrl: string | null;
}): SlackThreadTarget | null {
  const metadata = asRecord(input.metadata);
  const integration = asRecord(metadata.integration);
  const provider = typeof integration.provider === "string" ? integration.provider : null;

  if (provider !== "slack") {
    return null;
  }

  const externalIdRaw = typeof integration.externalId === "string" ? integration.externalId : null;
  if (!externalIdRaw) {
    return null;
  }

  const separatorIndex = externalIdRaw.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === externalIdRaw.length - 1) {
    return null;
  }

  const channelId = externalIdRaw.slice(0, separatorIndex);
  const threadTs = externalIdRaw.slice(separatorIndex + 1);

  const sourceUrlFromMetadata =
    typeof integration.sourceUrl === "string" && integration.sourceUrl.trim().length > 0
      ? integration.sourceUrl.trim()
      : null;

  const fallbackThreadTs = input.slackThread && input.slackThread.length > 0 ? input.slackThread : threadTs;
  const sourceUrl =
    sourceUrlFromMetadata ?? buildSlackThreadUrl(input.workspaceUrl, channelId, fallbackThreadTs);

  return {
    channelId,
    threadTs: fallbackThreadTs,
    sourceUrl,
    externalId: buildSlackExternalId(channelId, fallbackThreadTs),
  };
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

async function postSlackThreadMessage(input: {
  token: string;
  channelId: string;
  threadTs: string;
  text: string;
}): Promise<SlackPostMessageResult> {
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: input.channelId,
      thread_ts: input.threadTs,
      text: input.text,
      unfurl_links: false,
      unfurl_media: false,
    }),
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new SlackIntegrationAuthError("Slack access token is invalid");
  }

  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string; ts?: string; channel?: string }
    | null;

  if (!response.ok || !payload || payload.ok === false) {
    const reason = payload?.error ?? `Slack API error (${response.status})`;
    throw new Error(reason);
  }

  if (!payload.ts || !payload.channel) {
    throw new Error("Slack API response missing message timestamp");
  }

  return {
    channel: payload.channel,
    ts: payload.ts,
  };
}

async function resolveActorLabel(
  actorId: string | null,
  cache: Map<string, string>
): Promise<string> {
  if (!actorId) {
    return "unknown";
  }

  if (cache.has(actorId)) {
    return cache.get(actorId) ?? actorId;
  }

  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { name: true, email: true },
  });

  const label = actor?.name || actor?.email || actorId;
  cache.set(actorId, label);
  return label;
}

async function recordDeadLetterFailure(input: {
  ruleId: string;
  taskId: string;
  statusHistoryId: string;
  error: string;
}): Promise<void> {
  await prisma.outboxEvent.create({
    data: {
      eventType: "integration.slack.status_sync.failed",
      aggregateType: "integration_rule",
      aggregateId: input.ruleId,
      schemaVersion: 1,
      payload: {
        taskId: input.taskId,
        statusHistoryId: input.statusHistoryId,
        error: input.error,
      },
      idempotencyKey: `dead-letter:slack-status-sync:${input.ruleId}:${input.statusHistoryId}:${Date.now()}`,
      status: "DEAD_LETTER",
      retryCount: 0,
      nextAttemptAt: new Date(),
      failedAt: new Date(),
      error: input.error,
      lastAttemptAt: new Date(),
    },
  });
}

function coerceSyncStatus(status: TaskStatus): SlackSyncStatus | null {
  if (status === "ACTIVE" || status === "NOT_DONE" || status === "DONE") {
    return status;
  }

  return null;
}

async function listEligibleTransitions(input: {
  userId: string;
  statusesToSync: SlackSyncStatus[];
  after: Date | null;
  maxTransitionsPerRun: number;
}): Promise<SlackStatusTransitionRecord[]> {
  return prisma.statusHistory.findMany({
    where: {
      changedAt: input.after ? { gt: input.after } : undefined,
      toStatus: { in: input.statusesToSync },
      task: {
        responsible: {
          some: { id: input.userId },
        },
      },
    },
    orderBy: [{ changedAt: "asc" }, { id: "asc" }],
    take: input.maxTransitionsPerRun,
    include: {
      task: {
        select: {
          id: true,
          title: true,
          metadata: true,
          slackThread: true,
        },
      },
    },
  });
}

export async function getOrCreateSlackStatusSyncRule(userId: string): Promise<IntegrationRule> {
  return prisma.integrationRule.upsert({
    where: {
      userId_provider_key: {
        userId,
        provider: IntegrationProvider.SLACK,
        key: SLACK_STATUS_SYNC_RULE_KEY,
      },
    },
    update: {},
    create: {
      userId,
      provider: IntegrationProvider.SLACK,
      key: SLACK_STATUS_SYNC_RULE_KEY,
      enabled: true,
      statusOverride: null,
      config: defaultSlackStatusSyncConfig() as unknown as Prisma.InputJsonValue,
      checkpoint: {} as unknown as Prisma.InputJsonValue,
    },
  });
}

export function serializeSlackStatusSyncRule(rule: IntegrationRule): SlackStatusSyncRuleState {
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

export async function patchSlackStatusSyncRule(
  userId: string,
  patch: SlackRulePatch
): Promise<SlackStatusSyncRuleState> {
  const existing = await getOrCreateSlackStatusSyncRule(userId);
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

  return serializeSlackStatusSyncRule(updated);
}

export async function runSlackStatusSync(input: {
  userId: string;
  dryRun?: boolean;
}): Promise<SlackStatusSyncRunResult> {
  const rule = await getOrCreateSlackStatusSyncRule(input.userId);
  const config = normalizeConfig(rule.config);
  const checkpoint = normalizeCheckpoint(rule.checkpoint);

  if (!rule.enabled) {
    return {
      ruleId: rule.id,
      enabled: false,
      scannedTransitions: 0,
      eligibleTransitions: 0,
      postedUpdates: 0,
      dedupedUpdates: 0,
      failedUpdates: 0,
      cursor: checkpoint,
      updates: [],
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

  const afterDate = checkpoint.lastChangedAt ? new Date(checkpoint.lastChangedAt) : null;
  const transitions = await withRetries(() =>
    listEligibleTransitions({
      userId: input.userId,
      statusesToSync: config.statusesToSync,
      after: afterDate,
      maxTransitionsPerRun: config.maxTransitionsPerRun,
    })
  );

  let eligibleTransitions = 0;
  let postedUpdates = 0;
  let dedupedUpdates = 0;
  let failedUpdates = 0;

  const updates: SlackStatusSyncTaskUpdate[] = [];
  const errors: Array<{ taskId: string; statusHistoryId: string; error: string }> = [];

  let newestChangedAt: Date | null = afterDate;
  let newestStatusHistoryId = checkpoint.lastStatusHistoryId;

  const actorCache = new Map<string, string>();

  for (const transition of transitions) {
    if (!newestChangedAt || transition.changedAt > newestChangedAt) {
      newestChangedAt = transition.changedAt;
      newestStatusHistoryId = transition.id;
    }

    const syncStatus = coerceSyncStatus(transition.toStatus);
    if (!syncStatus) {
      continue;
    }

    const threadTarget = parseThreadTarget({
      metadata: transition.task.metadata,
      slackThread: transition.task.slackThread,
      workspaceUrl,
    });

    if (!threadTarget) {
      continue;
    }

    eligibleTransitions += 1;

    const externalObjectId = `${transition.task.id}:${transition.id}`;
    const ruleVariant = `status-${syncStatus.toLowerCase()}`;
    const dedupeKey = buildSlackStatusSyncDedupeKey({
      externalObjectId,
      ruleVariant,
    });

    if (input.dryRun) {
      updates.push({
        taskId: transition.task.id,
        taskTitle: transition.task.title,
        status: syncStatus,
        statusHistoryId: transition.id,
        channelId: threadTarget.channelId,
        threadTs: threadTarget.threadTs,
        sourceUrl: threadTarget.sourceUrl ?? buildSlackThreadUrl(workspaceUrl, threadTarget.channelId, threadTarget.threadTs),
        messageTs: "dry-run",
      });
      continue;
    }

    try {
      await prisma.integrationReceipt.create({
        data: {
          ruleId: rule.id,
          dedupeKey,
          externalObjectType: "slack_status_sync",
          externalObjectId,
          sourceUrl: threadTarget.sourceUrl,
          lastObservedAt: transition.changedAt,
          metadata: {
            taskId: transition.task.id,
            statusHistoryId: transition.id,
            toStatus: syncStatus,
            channelId: threadTarget.channelId,
            threadTs: threadTarget.threadTs,
            changedBy: transition.changedBy,
          },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        dedupedUpdates += 1;
        console.info("integration.slack.status_sync.deduped", {
          provider: "slack",
          ruleId: rule.id,
          taskId: transition.task.id,
          statusHistoryId: transition.id,
          dedupeKey,
        });
        continue;
      }
      throw error;
    }

    try {
      const actor = await resolveActorLabel(transition.changedBy, actorCache);
      const template = config.statusMessages[syncStatus];
      const sourceUrl =
        threadTarget.sourceUrl ??
        buildSlackThreadUrl(workspaceUrl, threadTarget.channelId, threadTarget.threadTs);
      const message = renderStatusMessage({
        template,
        taskTitle: transition.task.title,
        status: syncStatus,
        changedAt: transition.changedAt,
        actor,
        sourceUrl,
      });

      const posted = await withRetries(() =>
        postSlackThreadMessage({
          token,
          channelId: threadTarget.channelId,
          threadTs: threadTarget.threadTs,
          text: `${message}\n${sourceUrl}`,
        })
      );

      await prisma.integrationReceipt.update({
        where: { dedupeKey },
        data: {
          sourceUrl,
          metadata: {
            taskId: transition.task.id,
            statusHistoryId: transition.id,
            toStatus: syncStatus,
            channelId: threadTarget.channelId,
            threadTs: threadTarget.threadTs,
            slackMessageTs: posted.ts,
            changedBy: transition.changedBy,
          },
          lastObservedAt: transition.changedAt,
        },
      });

      await publishDomainEvent({
        eventType: "integration.slack.status_sync_posted",
        aggregateType: "integration_rule",
        aggregateId: rule.id,
        payload: {
          ruleId: rule.id,
          taskId: transition.task.id,
          statusHistoryId: transition.id,
          channelId: threadTarget.channelId,
          threadTs: threadTarget.threadTs,
          slackMessageTs: posted.ts,
          toStatus: syncStatus,
          sourceUrl,
        },
        idempotencyKey: buildOutboxIdempotencyKey({
          aggregateType: "integration_rule",
          aggregateId: rule.id,
          eventType: `slack_status_sync_${transition.id}`,
        }),
      });

      postedUpdates += 1;
      updates.push({
        taskId: transition.task.id,
        taskTitle: transition.task.title,
        status: syncStatus,
        statusHistoryId: transition.id,
        channelId: threadTarget.channelId,
        threadTs: threadTarget.threadTs,
        sourceUrl,
        messageTs: posted.ts,
      });

      console.info("integration.slack.status_sync.posted", {
        provider: "slack",
        ruleId: rule.id,
        taskId: transition.task.id,
        statusHistoryId: transition.id,
        channelId: threadTarget.channelId,
        threadTs: threadTarget.threadTs,
        toStatus: syncStatus,
      });
    } catch (error) {
      failedUpdates += 1;
      const message = error instanceof Error ? error.message : String(error);
      errors.push({
        taskId: transition.task.id,
        statusHistoryId: transition.id,
        error: message,
      });

      await prisma.integrationReceipt.deleteMany({
        where: { dedupeKey },
      });

      await recordDeadLetterFailure({
        ruleId: rule.id,
        taskId: transition.task.id,
        statusHistoryId: transition.id,
        error: message,
      });

      console.error("integration.slack.status_sync.failed", {
        provider: "slack",
        ruleId: rule.id,
        taskId: transition.task.id,
        statusHistoryId: transition.id,
        error: message,
      });
    }
  }

  const checkpointOut: SlackStatusSyncCheckpoint = {
    lastChangedAt: newestChangedAt?.toISOString() ?? checkpoint.lastChangedAt,
    lastStatusHistoryId: newestStatusHistoryId,
  };

  await prisma.integrationRule.update({
    where: { id: rule.id },
    data: {
      checkpoint: checkpointOut as unknown as Prisma.InputJsonValue,
      lastObservedAt: checkpointOut.lastChangedAt ? new Date(checkpointOut.lastChangedAt) : rule.lastObservedAt,
      lastRunAt: new Date(),
      lastError: errors.length > 0 ? `${errors.length} status sync update(s) failed` : null,
    },
  });

  await prisma.integrationConnection.updateMany({
    where: {
      userId: input.userId,
      provider: IntegrationProvider.SLACK,
    },
    data: {
      status: IntegrationConnectionStatus.CONNECTED,
      lastError: errors.length > 0 ? `${errors.length} status sync update(s) failed` : null,
      lastSyncedAt: new Date(),
    },
  });

  return {
    ruleId: rule.id,
    enabled: true,
    scannedTransitions: transitions.length,
    eligibleTransitions,
    postedUpdates,
    dedupedUpdates,
    failedUpdates,
    cursor: checkpointOut,
    updates,
    errors,
  };
}
