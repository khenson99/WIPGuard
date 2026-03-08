import { buildOutboxIdempotencyKey, publishDomainEvent } from "@/lib/event-bus";
import type { VisitorFunnelEnrichmentAlert } from "@/lib/analytics/types";

export interface VisitorFunnelAlertDeliveryConfig {
  enabled: boolean;
  ownerUserId: string | null;
  slackChannelId: string | null;
  minIntervalHours: number;
}

export interface VisitorFunnelAlertDeliveryResult {
  enabled: boolean;
  ownerUserId: string | null;
  slackChannelId: string | null;
  minIntervalHours: number;
  bucketStart: string | null;
  enqueued: number;
  skippedReason: string | null;
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function parseEnabled(value: string | null | undefined, fallback: boolean): boolean {
  const trimmed = trimOrNull(value)?.toLowerCase();
  if (!trimmed) return fallback;
  if (["1", "true", "yes", "on"].includes(trimmed)) return true;
  if (["0", "false", "no", "off"].includes(trimmed)) return false;
  return fallback;
}

function parsePositiveInt(value: string | null | undefined, fallback: number): number {
  const trimmed = trimOrNull(value);
  if (!trimmed) return fallback;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveVisitorFunnelAlertDeliveryConfig(
  env: NodeJS.ProcessEnv = process.env,
): VisitorFunnelAlertDeliveryConfig {
  const ownerUserId = trimOrNull(env.INTEGRATION_OWNER_USER_ID);
  const slackChannelId = trimOrNull(env.VISITOR_FUNNEL_ALERT_SLACK_CHANNEL_ID);

  return {
    enabled: parseEnabled(
      env.VISITOR_FUNNEL_ALERTS_ENABLED,
      Boolean(ownerUserId && slackChannelId),
    ),
    ownerUserId,
    slackChannelId,
    minIntervalHours: parsePositiveInt(env.VISITOR_FUNNEL_ALERT_MIN_INTERVAL_HOURS, 24),
  };
}

export function computeVisitorFunnelAlertBucketStart(
  now: Date,
  intervalHours: number,
): string {
  const intervalMs = Math.max(1, intervalHours) * 60 * 60 * 1000;
  const bucketStartMs = Math.floor(now.getTime() / intervalMs) * intervalMs;
  return new Date(bucketStartMs).toISOString();
}

export async function enqueueVisitorFunnelEnrichmentAlertNotifications(input: {
  alerts: VisitorFunnelEnrichmentAlert[];
  now?: Date;
  config?: VisitorFunnelAlertDeliveryConfig;
  publishEvent?: typeof publishDomainEvent;
}): Promise<VisitorFunnelAlertDeliveryResult> {
  const now = input.now ?? new Date();
  const config = input.config ?? resolveVisitorFunnelAlertDeliveryConfig();

  if (!config.enabled) {
    return {
      ...config,
      bucketStart: null,
      enqueued: 0,
      skippedReason: "VISITOR_FUNNEL_ALERTS_ENABLED is disabled.",
    };
  }

  if (!config.ownerUserId || !config.slackChannelId) {
    return {
      ...config,
      bucketStart: null,
      enqueued: 0,
      skippedReason: "Missing INTEGRATION_OWNER_USER_ID or VISITOR_FUNNEL_ALERT_SLACK_CHANNEL_ID.",
    };
  }

  const bucketStart = computeVisitorFunnelAlertBucketStart(now, config.minIntervalHours);
  if (input.alerts.length === 0) {
    return {
      ...config,
      bucketStart,
      enqueued: 0,
      skippedReason: "No active visitor funnel enrichment alerts.",
    };
  }

  const publishEvent = input.publishEvent ?? publishDomainEvent;

  for (const alert of input.alerts) {
    await publishEvent({
      eventType: "visitor_funnel.enrichment.slack_alert",
      aggregateType: "visitor_funnel_alert",
      aggregateId: alert.id,
      payload: {
        alertId: alert.id,
        bucketStart,
        channelId: config.slackChannelId,
        kind: alert.kind,
        lastSignalAt: alert.lastSignalAt,
        message: alert.message,
        ownerUserId: config.ownerUserId,
        provider: alert.provider,
        providerLabel: alert.providerLabel,
        severity: alert.severity,
        title: alert.title,
      },
      idempotencyKey: buildOutboxIdempotencyKey({
        aggregateType: "visitor_funnel_alert",
        aggregateId: `${alert.id}:${bucketStart}`,
        eventType: "slack_alert",
      }),
    });
  }

  return {
    ...config,
    bucketStart,
    enqueued: input.alerts.length,
    skippedReason: null,
  };
}
