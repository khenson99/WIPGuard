import { describe, expect, it, vi } from "vitest";
import type { OutboxEvent } from "@/generated/prisma/client";

const mockSendSlackNotification = vi.fn();
const mockSendSlackDirectMessage = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflowRun: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/integrations/slack-notifications", () => ({
  sendSlackNotification: mockSendSlackNotification,
  sendSlackDirectMessage: mockSendSlackDirectMessage,
}));

describe("dispatchOutboxEvent visitor funnel alert routing", () => {
  it("routes visitor funnel enrichment slack alerts into the Slack sender", async () => {
    const { dispatchOutboxEvent } = await import("@/lib/outbox-dispatcher");

    await dispatchOutboxEvent({
      id: "evt_1",
      eventType: "visitor_funnel.enrichment.slack_alert",
      aggregateType: "visitor_funnel_alert",
      aggregateId: "unify:stale",
      schemaVersion: 1,
      payload: {
        ownerUserId: "owner-1",
        channelId: "COPS",
        alertId: "unify:stale",
        title: "UNIFY enrichment is stale",
        message: "UNIFY has not delivered an enrichment signal in 14 days.",
        severity: "critical",
        kind: "stale",
        bucketStart: "2026-03-08T00:00:00.000Z",
      },
      idempotencyKey: "visitor_funnel_alert:unify:stale:2026-03-08t00:00:00.000z:slack_alert",
      status: "PENDING",
      retryCount: 0,
      nextAttemptAt: new Date(),
      lastAttemptAt: null,
      dispatchedAt: null,
      failedAt: null,
      error: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as OutboxEvent);

    expect(mockSendSlackNotification).toHaveBeenCalledWith({
      userId: "owner-1",
      payload: {
        type: "ops_alert",
        taskId: "unify:stale",
        taskTitle: "UNIFY enrichment is stale",
        channelId: "COPS",
        context: {
          bucketStart: "2026-03-08T00:00:00.000Z",
          kind: "stale",
          provider: "",
          reason: "UNIFY has not delivered an enrichment signal in 14 days.",
          severity: "critical",
        },
      },
    });
  });
});
