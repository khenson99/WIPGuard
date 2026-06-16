import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationConnectionStatus, IntegrationProvider } from "@/generated/prisma/client";
import {
  buildNotificationDedupeKey,
  defaultThrottleConfig,
  getThrottleEntry,
  recordSend,
  renderNotificationMessage,
  resetThrottleState,
  sendSlackNotification,
  shouldThrottle,
  throttleStateSize,
  type SlackNotificationPayload,
  type ThrottleConfig,
} from "@/lib/integrations/slack-notifications";

const prismaMock = vi.hoisted(() => ({
  integrationConnection: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
  },
  outboxEvent: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/integrations/ownership", () => ({
  isConfiguredIntegrationOwner: vi.fn(() => false),
}));

vi.mock("@/lib/integrations/token-crypto", () => ({
  unprotectIntegrationSecret: vi.fn((value: string | null | undefined) => value ?? null),
}));

vi.mock("@/lib/event-bus", () => ({
  buildOutboxIdempotencyKey: vi.fn(() => "outbox-key"),
  publishDomainEvent: vi.fn(),
}));

describe("slack operating-alert notifications", () => {
  beforeEach(() => {
    resetThrottleState();
    vi.clearAllMocks();
    prismaMock.integrationConnection.findUnique.mockResolvedValue(null);
    prismaMock.integrationConnection.findFirst.mockResolvedValue(null);
    prismaMock.integrationConnection.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.integrationConnection.upsert.mockResolvedValue({});
    prismaMock.outboxEvent.create.mockResolvedValue({});
  });

  const payload: SlackNotificationPayload = {
    type: "ops_alert",
    alertId: "alert_1",
    title: "Pipeline coverage dropped",
    channelId: "C123",
    context: {
      severity: "high",
      provider: "HubSpot",
      kind: "pipeline",
      bucketStart: "2026-05-01",
      reason: "Qualified pipeline is below target.",
    },
  };

  it("uses operating-alert throttle defaults", () => {
    expect(defaultThrottleConfig()).toEqual({
      windowMs: 60_000,
      maxBurst: 5,
      bypassTypes: ["ops_alert"],
      minIntervalMs: 2_000,
    });
  });

  it("bypasses throttling for operating alerts", () => {
    const config: ThrottleConfig = {
      windowMs: 60_000,
      maxBurst: 1,
      bypassTypes: ["ops_alert"],
      minIntervalMs: 60_000,
    };
    recordSend("C123", 1_000, config.windowMs);

    expect(shouldThrottle("C123", "ops_alert", config, 1_100)).toEqual({ throttled: false });
  });

  it("records channel send windows", () => {
    recordSend("C123", 1_000, 60_000);
    recordSend("C123", 2_000, 60_000);

    expect(getThrottleEntry("C123")).toEqual({
      timestamps: [1_000, 2_000],
      lastSentAt: 2_000,
    });
  });

  it("renders an operating-alert message without task language", () => {
    const message = renderNotificationMessage(payload);

    expect(message).toContain("operating alert");
    expect(message).toContain("Pipeline coverage dropped");
    expect(message).toContain("Provider: HubSpot");
    expect(message).not.toMatch(/task|project|blocked/i);
  });

  it("builds dedupe keys from alert identity", () => {
    expect(buildNotificationDedupeKey(payload)).toBe(
      "slack:notification:C123:alert_1:ops_alert:no-thread"
    );
  });

  it("creates a missing Slack connection row when notification auth fails before send", async () => {
    prismaMock.integrationConnection.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      sendSlackNotification({
        userId: "user_1",
        payload,
      }),
    ).rejects.toThrow("Slack is not connected");

    expect(prismaMock.integrationConnection.upsert).toHaveBeenCalledWith({
      where: {
        userId_provider: {
          userId: "user_1",
          provider: IntegrationProvider.SLACK,
        },
      },
      update: {
        status: IntegrationConnectionStatus.ERROR,
        lastError: "Slack is not connected",
      },
      create: {
        userId: "user_1",
        provider: IntegrationProvider.SLACK,
        status: IntegrationConnectionStatus.ERROR,
        lastError: "Slack is not connected",
      },
    });
  });
});

describe("throttle map eviction (memory bound)", () => {
  beforeEach(() => {
    resetThrottleState();
  });

  it("does not retain channels that have gone idle past the window", () => {
    const windowMs = 60_000;
    // Many distinct channels each sent to once, long ago.
    for (let i = 0; i < 100; i++) {
      recordSend(`C-old-${i}`, 1_000, windowMs);
    }
    expect(throttleStateSize()).toBe(100);

    // A later send well outside the window evicts all the now-idle channels;
    // only the active channel remains.
    recordSend("C-active", 1_000 + windowMs + 1, windowMs);
    expect(throttleStateSize()).toBe(1);
    expect(getThrottleEntry("C-active")).toBeDefined();
    expect(getThrottleEntry("C-old-0")).toBeUndefined();
  });

  it("keeps channels that are still active within the window", () => {
    const windowMs = 60_000;
    recordSend("C-a", 1_000, windowMs);
    recordSend("C-b", 1_000, windowMs);
    // A send only slightly later — both prior channels are still inside the
    // window, so nothing is evicted.
    recordSend("C-c", 2_000, windowMs);
    expect(throttleStateSize()).toBe(3);
  });
});
