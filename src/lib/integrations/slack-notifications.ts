/**
 * Slack Notification Service
 *
 * Posts operating alerts to Slack channels.
 * Implements throttling to keep updates actionable and non-spammy:
 *
 *  - Per-channel rate limiting with configurable window and max burst
 *  - Deduplication via outbox idempotency keys
 *  - Collapsible notifications: batches rapid updates into single messages
 */

import {
  IntegrationConnectionStatus,
  IntegrationProvider,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { unprotectIntegrationSecret } from "@/lib/integrations/token-crypto";
import { isConfiguredIntegrationOwner } from "@/lib/integrations/ownership";
import { withRetries } from "@/lib/integrations/with-retries";
import { buildOutboxIdempotencyKey, publishDomainEvent } from "@/lib/event-bus";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SlackNotificationType = "ops_alert";

export interface SlackNotificationPayload {
  type: SlackNotificationType;
  alertId: string;
  title: string;
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
  ops_alert: ":rotating_light:",
};

// ---------------------------------------------------------------------------
// Throttle state (in-memory, per-process)
// ---------------------------------------------------------------------------

const throttleState = new Map<string, ThrottleEntry>();

export function defaultThrottleConfig(): ThrottleConfig {
  return {
    windowMs: 60_000,
    maxBurst: 5,
    bypassTypes: ["ops_alert"],
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

  switch (payload.type) {
    case "ops_alert": {
      const severity = payload.context?.severity?.trim().toUpperCase() || "ALERT";
      const kind = payload.context?.kind?.trim();
      const provider = payload.context?.provider?.trim();
      const reason = payload.context?.reason?.trim();
      const bucket = payload.context?.bucketStart?.trim();
      const suffixes = [
        provider ? `Provider: ${provider}` : null,
        kind ? `Type: ${kind}` : null,
        bucket ? `Window: ${bucket}` : null,
      ]
        .filter(Boolean)
        .join(" • ");
      const reasonSuffix = reason ? `\n> ${reason}` : "";
      return `${emoji} *${severity}* operating alert: *${payload.title}*${suffixes ? `\n>${suffixes}` : ""}${reasonSuffix}`;
    }
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
    payload.alertId,
    payload.type,
    // Include threadTs to avoid deduping across different threads
    payload.threadTs ?? "no-thread",
  ].join(":");
}

// ---------------------------------------------------------------------------
// Slack API helpers
// ---------------------------------------------------------------------------


class SlackAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlackAuthError";
  }
}

async function getSlackToken(userId: string): Promise<string> {
  let connection = await prisma.integrationConnection.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: IntegrationProvider.SLACK,
      },
    },
  });

  // Owner fallback: when the configured owner has no Slack connection yet
  // (migration hasn't run), look for any connected user's Slack connection.
  if (!connection && isConfiguredIntegrationOwner(userId)) {
    connection = await prisma.integrationConnection.findFirst({
      where: {
        provider: IntegrationProvider.SLACK,
        status: IntegrationConnectionStatus.CONNECTED,
      },
      orderBy: { connectedAt: "desc" },
    });
  }

  if (!connection || connection.status !== IntegrationConnectionStatus.CONNECTED) {
    throw new SlackAuthError("Slack is not connected");
  }

  const token = unprotectIntegrationSecret(connection.accessToken);
  if (!token) {
    throw new SlackAuthError("Slack access token is missing");
  }

  return token;
}

async function persistSlackConnectionError(input: {
  userId: string;
  message: string;
}): Promise<void> {
  const data = {
    status: IntegrationConnectionStatus.ERROR,
    lastError: input.message,
  };
  const updateResult = await prisma.integrationConnection.updateMany({
    where: {
      userId: input.userId,
      provider: IntegrationProvider.SLACK,
    },
    data,
  });
  if (updateResult?.count === 0) {
    await prisma.integrationConnection.upsert({
      where: {
        userId_provider: {
          userId: input.userId,
          provider: IntegrationProvider.SLACK,
        },
      },
      update: data,
      create: {
        userId: input.userId,
        provider: IntegrationProvider.SLACK,
        ...data,
      },
    });
  }
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

const SLACK_API_TIMEOUT_MS = 15_000;

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SLACK_API_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    const isAbort = error instanceof Error && error.name === "AbortError";
    throw new Error(isAbort ? "Slack chat.postMessage timed out" : `Slack chat.postMessage failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SLACK_API_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ users: input.slackUserId }),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    const isAbort = error instanceof Error && error.name === "AbortError";
    throw new Error(isAbort ? "Slack conversations.open timed out" : `Slack conversations.open failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }

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
      alertId: input.payload.alertId,
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
    await persistSlackConnectionError({
      userId: input.userId,
      message,
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
      aggregateType: "operating_alert",
      aggregateId: input.payload.alertId,
      payload: {
        type: input.payload.type,
        alertId: input.payload.alertId,
        channelId: input.payload.channelId,
        messageTs: posted.ts,
        actorId: input.payload.actorId,
      },
      idempotencyKey: buildOutboxIdempotencyKey({
        aggregateType: "operating_alert",
        aggregateId: input.payload.alertId,
        eventType: `slack_notification_${input.payload.type}_${now}`,
      }),
    });

    console.info("integration.slack.notification.sent", {
      provider: "slack",
      channelId: input.payload.channelId,
      type: input.payload.type,
      alertId: input.payload.alertId,
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
        aggregateType: "operating_alert",
        aggregateId: input.payload.alertId,
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
      alertId: input.payload.alertId,
      error: message,
    });

    throw error;
  }
}

// ---------------------------------------------------------------------------
// Batch notification sender
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
