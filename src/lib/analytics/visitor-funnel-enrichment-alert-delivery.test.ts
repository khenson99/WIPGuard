import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeVisitorFunnelAlertBucketStart,
  enqueueVisitorFunnelEnrichmentAlertNotifications,
  resolveVisitorFunnelAlertDeliveryConfig,
} from "@/lib/analytics/visitor-funnel-enrichment-alert-delivery";
import type { VisitorFunnelEnrichmentAlert } from "@/lib/analytics/types";

const ORIGINAL_ENV = {
  integrationOwnerUserId: process.env.INTEGRATION_OWNER_USER_ID,
  visitorFunnelAlertsEnabled: process.env.VISITOR_FUNNEL_ALERTS_ENABLED,
  visitorFunnelAlertSlackChannelId: process.env.VISITOR_FUNNEL_ALERT_SLACK_CHANNEL_ID,
  visitorFunnelAlertMinIntervalHours: process.env.VISITOR_FUNNEL_ALERT_MIN_INTERVAL_HOURS,
};

function sampleAlert(
  overrides: Partial<VisitorFunnelEnrichmentAlert> = {},
): VisitorFunnelEnrichmentAlert {
  return {
    id: "unify:stale",
    provider: "unify",
    providerLabel: "UNIFY",
    severity: "critical",
    kind: "stale",
    title: "UNIFY enrichment is stale",
    message: "UNIFY has not delivered an enrichment signal in 14 days.",
    lastSignalAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  if (ORIGINAL_ENV.integrationOwnerUserId == null) {
    delete process.env.INTEGRATION_OWNER_USER_ID;
  } else {
    process.env.INTEGRATION_OWNER_USER_ID = ORIGINAL_ENV.integrationOwnerUserId;
  }

  if (ORIGINAL_ENV.visitorFunnelAlertsEnabled == null) {
    delete process.env.VISITOR_FUNNEL_ALERTS_ENABLED;
  } else {
    process.env.VISITOR_FUNNEL_ALERTS_ENABLED = ORIGINAL_ENV.visitorFunnelAlertsEnabled;
  }

  if (ORIGINAL_ENV.visitorFunnelAlertSlackChannelId == null) {
    delete process.env.VISITOR_FUNNEL_ALERT_SLACK_CHANNEL_ID;
  } else {
    process.env.VISITOR_FUNNEL_ALERT_SLACK_CHANNEL_ID =
      ORIGINAL_ENV.visitorFunnelAlertSlackChannelId;
  }

  if (ORIGINAL_ENV.visitorFunnelAlertMinIntervalHours == null) {
    delete process.env.VISITOR_FUNNEL_ALERT_MIN_INTERVAL_HOURS;
  } else {
    process.env.VISITOR_FUNNEL_ALERT_MIN_INTERVAL_HOURS =
      ORIGINAL_ENV.visitorFunnelAlertMinIntervalHours;
  }
});

describe("resolveVisitorFunnelAlertDeliveryConfig", () => {
  it("defaults to enabled when owner and channel are configured", () => {
    process.env.INTEGRATION_OWNER_USER_ID = "user-1";
    process.env.VISITOR_FUNNEL_ALERT_SLACK_CHANNEL_ID = "C123";
    delete process.env.VISITOR_FUNNEL_ALERTS_ENABLED;

    expect(resolveVisitorFunnelAlertDeliveryConfig()).toMatchObject({
      enabled: true,
      ownerUserId: "user-1",
      slackChannelId: "C123",
      minIntervalHours: 24,
    });
  });

  it("honors explicit disable and custom interval", () => {
    process.env.INTEGRATION_OWNER_USER_ID = "user-1";
    process.env.VISITOR_FUNNEL_ALERT_SLACK_CHANNEL_ID = "C123";
    process.env.VISITOR_FUNNEL_ALERTS_ENABLED = "false";
    process.env.VISITOR_FUNNEL_ALERT_MIN_INTERVAL_HOURS = "6";

    expect(resolveVisitorFunnelAlertDeliveryConfig()).toMatchObject({
      enabled: false,
      minIntervalHours: 6,
    });
  });
});

describe("computeVisitorFunnelAlertBucketStart", () => {
  it("buckets notifications by the configured interval", () => {
    expect(
      computeVisitorFunnelAlertBucketStart(
        new Date("2026-03-08T10:45:00.000Z"),
        6,
      ),
    ).toBe("2026-03-08T06:00:00.000Z");
  });
});

describe("enqueueVisitorFunnelEnrichmentAlertNotifications", () => {
  it("skips cleanly when delivery is disabled", async () => {
    const result = await enqueueVisitorFunnelEnrichmentAlertNotifications({
      alerts: [sampleAlert()],
      config: {
        enabled: false,
        ownerUserId: "user-1",
        slackChannelId: "C123",
        minIntervalHours: 24,
      },
    });

    expect(result).toMatchObject({
      enabled: false,
      enqueued: 0,
      skippedReason: "VISITOR_FUNNEL_ALERTS_ENABLED is disabled.",
    });
  });

  it("publishes bucketed outbox events for each active alert", async () => {
    const publishEvent = vi.fn().mockResolvedValue({});
    const now = new Date("2026-03-08T10:45:00.000Z");

    const result = await enqueueVisitorFunnelEnrichmentAlertNotifications({
      alerts: [sampleAlert(), sampleAlert({ id: "clay:misconfigured", provider: "clay", providerLabel: "Clay" })],
      now,
      config: {
        enabled: true,
        ownerUserId: "owner-1",
        slackChannelId: "COPS",
        minIntervalHours: 12,
      },
      publishEvent,
    });

    expect(result).toMatchObject({
      enabled: true,
      enqueued: 2,
      bucketStart: "2026-03-08T00:00:00.000Z",
      skippedReason: null,
    });
    expect(publishEvent).toHaveBeenCalledTimes(2);
    expect(publishEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        eventType: "visitor_funnel.enrichment.slack_alert",
        aggregateType: "visitor_funnel_alert",
        aggregateId: "unify:stale",
        idempotencyKey:
          "visitor_funnel_alert:unify:stale:2026-03-08t00:00:00.000z:slack_alert",
        payload: expect.objectContaining({
          ownerUserId: "owner-1",
          channelId: "COPS",
          alertId: "unify:stale",
          bucketStart: "2026-03-08T00:00:00.000Z",
        }),
      }),
    );
  });
});
