/**
 * Slack Notification Service
 *
 * Posts assignment, status, and blocked notifications to Slack channels.
 * Implements throttling to keep updates actionable and non-spammy:
 *
 *  - Per-channel rate limiting with configurable window and max burst
 *  - Deduplication via outbox idempotency keys
 *  - Collapsible notifications: batches rapid updates into single messages
 *  - Priority-based urgency: P0/blocked bypass throttle, P3 gets longer windows
 */

import {
  IntegrationConnectionStatus,
  IntegrationProvider,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { unprotectIntegrationSecret } from "@/lib/integrations/token-crypto";
import { computeRetryDelayMs } from "@/lib/outbox-worker";
import { buildOutboxIdempotencyKey, publishDomainEvent } from "@/lib/event-bus";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SlackNotificationType =
  | "assignment"
  | "status_change"
  | "blocked"
  | "unblocked"
  | "mention";

export interface SlackNotificationPayload {
  type: SlackNotificationType;
  taskId: string;
  taskTitle: string;
  projectId?: string | null;
  projectName?: string | null;
  priority?: string | null;
  channelId: string;
  threadTs?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  /** Additional context rendered into the message body */
  context?: Record<string, string>;
}

export interface ThrottleConfig {
  /** Sliding window in milliseconds (default 60_000 = 1 min) */
  windowMs: number;
  /** Max messages per channel per window (default 5) */
  maxBurst: number;
  /** Types that bypass the throttle entirely */
  bypassTypes: SlackNotificationType[];
  /** Minimum interval between any two messages to the same channel (ms) */
  minIntervalMs: number;
}

export interface SlackNotificationResult {
  sent: boolean;
  throttled: boolean;
  messageTs: string | null;
  channelId: string;
  dedupeKey: string;
  reason?: string;
}

interface ThrottleEntry {
  timestamps: number[];
  lastSentAt: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOTIFICATION_EMOJIS: Record<SlackNotificationType, string> = {
  assignment: ":bust_in_silhouette:",
  status_change: ":arrows_counterclockwise:",
  blocked: ":octagonal_sign:",
  unblocked: ":white_check_mark:",
  mention: ":speech_balloon:",
};

// ---------------------------------------------------------------------------
// Throttle state (in-memory, per-process)
// ---------------------------------------------------------------------------

const throttleState = new Map<string, ThrottleEntry>();

export function defaultThrottleConfig(): ThrottleConfig {
  return {
    windowMs: 60_000,
    maxBurst: 5,
    bypassTypes: ["blocked"],
    minIntervalMs: 2_000,
  };
}

/**
 * Check whether a notification should be throttled.
 * Pure function against the throttle map -- does NOT mutate state.
 */
export function shouldThrottle(
  channelId: string,
  type: SlackNotificationType,
  config: ThrottleConfig,
  now: number = Date.now()
): { throttled: boolean; reason?: string } {
  if (config.bypassTypes.includes(type)) {
    return { throttled: false };
  }

  const entry = throttleState.get(channelId);
  if (!entry) {
    return { throttled: false };
  }

  // Check minimum interval
  if (now - entry.lastSentAt < config.minIntervalMs) {
    return {
      throttled: true,
      reason: `min_interval: ${now - entry.lastSentAt}ms < ${config.minIntervalMs}ms`,
    };
  }

  // Check burst window
  const windowStart = now - config.windowMs;
  const recentCount = entry.timestamps.filter((ts) => ts > windowStart).length;
  if (recentCount >= config.maxBurst) {
    return {
      throttled: true,
      reason: `burst_limit: ${recentCount} >= ${config.maxBurst} in ${config.windowMs}ms window`,
    };
  }

  return { throttled: false };
}

/**
 * Record that a message was sent to a channel. Maintains the sliding window.
 */
export function recordSend(
  channelId: string,
  now: number = Date.now(),
  windowMs: number = 60_000
): void {
  const entry = throttleState.get(channelId) ?? { timestamps: [], lastSentAt: 0 };
  const windowStart = now - windowMs;

  // Prune old timestamps outside the window
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);
  entry.timestamps.push(now);
  entry.lastSentAt = now;

  throttleState.set(channelId, entry);
}

/**
 * Reset throttle state (useful for testing).
 */
export function resetThrottleState(): void {
  throttleState.clear();
}

/**
 * Get current throttle entry for a channel (useful for testing).
 */
export function getThrottleEntry(channelId: string): ThrottleEntry | undefined {
  return throttleState.get(channelId);
}

// ---------------------------------------------------------------------------
// Message rendering
// ---------------------------------------------------------------------------

export function renderNotificationMessage(payload: SlackNotificationPayload): string {
  const emoji = NOTIFICATION_EMOJIS[payload.type];
  const projectLabel = payload.projectName ? ` (${payload.projectName})` : "";
  const actorLabel = payload.actorName ? ` by ${payload.actorName}` : "";

  switch (payload.type) {
    case "assignment":
      return `${emoji} *${payload.taskTitle}*${projectLabel} was assigned${actorLabel}`;

    case "status_change": {
      const newStatus = payload.context?.newStatus ?? "updated";
      const oldStatus = payload.context?.oldStatus;
      const statusTransition = oldStatus ? `${oldStatus} -> ${newStatus}` : newStatus;
      return `${emoji} *${payload.taskTitle}*${projectLabel} status changed to *${statusTransition}*${actorLabel}`;
    }

    case "blocked": {
      const reason = payload.context?.reason;
      const reasonSuffix = reason ? `\n> Reason: ${reason}` : "";
      return `${emoji} *${payload.taskTitle}*${projectLabel} is *BLOCKED*${actorLabel}${reasonSuffix}`;
    }

    case "unblocked":
      return `${emoji} *${payload.taskTitle}*${projectLabel} is no longer blocked${actorLabel}`;

    case "mention": {
      const role = payload.context?.role ?? "mentioned";
      return `${emoji} You were ${role} on *${payload.taskTitle}*${projectLabel}${actorLabel}`;
    }

    default:
      return `${emoji} Update on *${payload.taskTitle}*${projectLabel}${actorLabel}`;
  }
}

// ---------------------------------------------------------------------------
// Dedupe key builder
// ---------------------------------------------------------------------------

export function buildNotificationDedupeKey(payload: SlackNotificationPayload): string {
  return [
    "slack",
    "notification",
    payload.channelId,
    payload.taskId,
    payload.type,
    // Include threadTs to avoid deduping across different threads
    payload.threadTs ?? "no-thread",
  ].join(":");
}

// ---------------------------------------------------------------------------
// Slack API helpers
// ---------------------------------------------------------------------------

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

class SlackAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlackAuthError";
  }
}

async function getSlackToken(userId: string): Promise<string> {
  const connection = await prisma.integrationConnection.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: IntegrationProvider.SLACK,
      },
    },
  });

  if (!connection || connection.status !== IntegrationConnectionStatus.CONNECTED) {
    throw new SlackAuthError("Slack is not connected");
  }

  const token = unprotectIntegrationSecret(connection.accessToken);
  if (!token) {
    throw new SlackAuthError("Slack access token is missing");
  }

  return token;
}

interface SlackPostResult {
  channel: string;
  ts: string;
}

function metadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function postSlackMessage(input: {
  token: string;
  channelId: string;
  text: string;
  threadTs?: string | null;
}): Promise<SlackPostResult> {
  const body: Record<string, unknown> = {
    channel: input.channelId,
    text: input.text,
    unfurl_links: false,
    unfurl_media: false,
  };

  if (input.threadTs) {
    body.thread_ts = input.threadTs;
  }

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new SlackAuthError("Slack access token is invalid");
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

async function openSlackDirectConversation(input: {
  token: string;
  slackUserId: string;
}): Promise<string> {
  const response = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ users: input.slackUserId }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string; channel?: { id?: string } }
    | null;

  if (!response.ok || !payload || payload.ok === false || !payload.channel?.id) {
    throw new Error(payload?.error || "Slack DM open failed");
  }

  return payload.channel.id;
}

export async function sendSlackDirectMessage(input: {
  userId: string;
  message: string;
  slackUserId?: string;
}): Promise<{ channelId: string; messageTs: string }> {
  const token = await getSlackToken(input.userId);
  const connection = await prisma.integrationConnection.findUnique({
    where: {
      userId_provider: {
        userId: input.userId,
        provider: IntegrationProvider.SLACK,
      },
    },
    select: {
      metadata: true,
    },
  });

  const slackUserId =
    input.slackUserId || metadataString(connection?.metadata, "userId");
  if (!slackUserId) {
    throw new Error("Slack user id is missing for direct message");
  }

  const channelId = await openSlackDirectConversation({
    token,
    slackUserId,
  });

  const posted = await postSlackMessage({
    token,
    channelId,
    text: input.message,
  });

  return {
    channelId: posted.channel,
    messageTs: posted.ts,
  };
}

// ---------------------------------------------------------------------------
// Main notification sender
// ---------------------------------------------------------------------------

export async function sendSlackNotification(input: {
  userId: string;
  payload: SlackNotificationPayload;
  throttleConfig?: ThrottleConfig;
  dryRun?: boolean;
}): Promise<SlackNotificationResult> {
  const config = input.throttleConfig ?? defaultThrottleConfig();
  const dedupeKey = buildNotificationDedupeKey(input.payload);
  const now = Date.now();

  // 1. Check throttle
  const throttleResult = shouldThrottle(input.payload.channelId, input.payload.type, config, now);

  if (throttleResult.throttled) {
    console.info("integration.slack.notification.throttled", {
      provider: "slack",
      channelId: input.payload.channelId,
      type: input.payload.type,
      taskId: input.payload.taskId,
      reason: throttleResult.reason,
    });

    return {
      sent: false,
      throttled: true,
      messageTs: null,
      channelId: input.payload.channelId,
      dedupeKey,
      reason: throttleResult.reason,
    };
  }

  if (input.dryRun) {
    return {
      sent: false,
      throttled: false,
      messageTs: null,
      channelId: input.payload.channelId,
      dedupeKey,
      reason: "dry_run",
    };
  }

  // 2. Get Slack token
  let token: string;
  try {
    token = await getSlackToken(input.userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.integrationConnection.updateMany({
      where: {
        userId: input.userId,
        provider: IntegrationProvider.SLACK,
      },
      data: {
        status: IntegrationConnectionStatus.ERROR,
        lastError: message,
      },
    });
    throw error;
  }

  // 3. Render message
  const text = renderNotificationMessage(input.payload);

  // 4. Post to Slack
  try {
    const posted = await withRetries(() =>
      postSlackMessage({
        token,
        channelId: input.payload.channelId,
        text,
        threadTs: input.payload.threadTs,
      })
    );

    // 5. Record throttle state
    recordSend(input.payload.channelId, now, config.windowMs);

    // 6. Publish domain event
    await publishDomainEvent({
      eventType: `integration.slack.notification.${input.payload.type}`,
      aggregateType: "task",
      aggregateId: input.payload.taskId,
      payload: {
        type: input.payload.type,
        taskId: input.payload.taskId,
        channelId: input.payload.channelId,
        messageTs: posted.ts,
        actorId: input.payload.actorId,
      },
      idempotencyKey: buildOutboxIdempotencyKey({
        aggregateType: "task",
        aggregateId: input.payload.taskId,
        eventType: `slack_notification_${input.payload.type}_${now}`,
      }),
    });

    console.info("integration.slack.notification.sent", {
      provider: "slack",
      channelId: input.payload.channelId,
      type: input.payload.type,
      taskId: input.payload.taskId,
      messageTs: posted.ts,
    });

    return {
      sent: true,
      throttled: false,
      messageTs: posted.ts,
      channelId: input.payload.channelId,
      dedupeKey,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Record dead letter
    await prisma.outboxEvent.create({
      data: {
        eventType: "integration.slack.notification.failed",
        aggregateType: "task",
        aggregateId: input.payload.taskId,
        schemaVersion: 1,
        payload: {
          type: input.payload.type,
          channelId: input.payload.channelId,
          error: message,
        },
        idempotencyKey: `dead-letter:slack-notification:${dedupeKey}:${now}`,
        status: "DEAD_LETTER",
        retryCount: 0,
        nextAttemptAt: new Date(),
        failedAt: new Date(),
        error: message,
        lastAttemptAt: new Date(),
      },
    });

    console.error("integration.slack.notification.failed", {
      provider: "slack",
      channelId: input.payload.channelId,
      type: input.payload.type,
      taskId: input.payload.taskId,
      error: message,
    });

    throw error;
  }
}

// ---------------------------------------------------------------------------
// Batch notification sender (for status change events that fire rapidly)
// ---------------------------------------------------------------------------

export async function sendBatchSlackNotifications(input: {
  userId: string;
  payloads: SlackNotificationPayload[];
  throttleConfig?: ThrottleConfig;
  dryRun?: boolean;
}): Promise<SlackNotificationResult[]> {
  const results: SlackNotificationResult[] = [];

  for (const payload of input.payloads) {
    try {
      const result = await sendSlackNotification({
        userId: input.userId,
        payload,
        throttleConfig: input.throttleConfig,
        dryRun: input.dryRun,
      });
      results.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        sent: false,
        throttled: false,
        messageTs: null,
        channelId: payload.channelId,
        dedupeKey: buildNotificationDedupeKey(payload),
        reason: `error: ${message}`,
      });
    }
  }

  return results;
}
