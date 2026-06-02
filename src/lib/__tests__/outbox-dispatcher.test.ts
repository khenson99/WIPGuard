import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OutboxEvent } from "@/generated/prisma/client";

const {
  mockWorkflowRunFindUnique,
  mockSendSlackDirectMessage,
  mockSendSlackNotification,
} = vi.hoisted(() => ({
  mockWorkflowRunFindUnique: vi.fn(),
  mockSendSlackDirectMessage: vi.fn(),
  mockSendSlackNotification: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflowRun: {
      findUnique: mockWorkflowRunFindUnique,
    },
  },
}));

vi.mock("@/lib/integrations/slack-notifications", () => ({
  sendSlackDirectMessage: mockSendSlackDirectMessage,
  sendSlackNotification: mockSendSlackNotification,
}));

import { dispatchOutboxEvent } from "@/lib/outbox-dispatcher";

function makeEvent(overrides: Partial<OutboxEvent>): OutboxEvent {
  const now = new Date("2026-03-11T18:00:00.000Z");
  return {
    id: "evt-1",
    eventType: "unknown.event",
    aggregateType: "workflow_run",
    aggregateId: "run-1",
    payload: {},
    status: "PENDING",
    retryCount: 0,
    nextAttemptAt: now,
    dispatchedAt: null,
    lastAttemptAt: null,
    failedAt: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as OutboxEvent;
}

describe("outbox-dispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches automation Slack notifications to the run requester", async () => {
    mockWorkflowRunFindUnique.mockResolvedValue({
      requestedById: "user-1",
      workflow: { ownerId: "owner-1" },
    });

    await dispatchOutboxEvent(
      makeEvent({
        eventType: "automation.slack.notify",
        payload: { message: "Ship the GTM report" },
      }),
    );

    expect(mockSendSlackDirectMessage).toHaveBeenCalledWith({
      userId: "user-1",
      message: "Ship the GTM report",
    });
  });

  it("falls back to the workflow owner when the requester is missing", async () => {
    mockWorkflowRunFindUnique.mockResolvedValue({
      requestedById: null,
      workflow: { ownerId: "owner-1" },
    });

    await dispatchOutboxEvent(
      makeEvent({
        eventType: "automation.slack.notify",
        payload: { message: "Owner fallback" },
      }),
    );

    expect(mockSendSlackDirectMessage).toHaveBeenCalledWith({
      userId: "owner-1",
      message: "Owner fallback",
    });
  });

  it("throws when the automation Slack payload has no message", async () => {
    await expect(
      dispatchOutboxEvent(
        makeEvent({
          eventType: "automation.slack.notify",
          payload: {},
        }),
      ),
    ).rejects.toThrow("automation.slack.notify missing message");
  });

  it("dispatches visitor funnel alert notifications", async () => {
    await dispatchOutboxEvent(
      makeEvent({
        eventType: "visitor_funnel.enrichment.slack_alert",
        aggregateId: "alert-1",
        payload: {
          alertId: "alert-1",
          ownerUserId: "user-9",
          channelId: "C123",
          title: "Unify drift detected",
          message: "Signal freshness degraded",
          bucketStart: "2026-03-11T00:00:00.000Z",
          kind: "freshness",
          providerLabel: "UNIFY",
          severity: "warning",
        },
      }),
    );

    expect(mockSendSlackNotification).toHaveBeenCalledWith({
      userId: "user-9",
      payload: {
        type: "ops_alert",
        alertId: "alert-1",
        title: "Unify drift detected",
        channelId: "C123",
        context: {
          bucketStart: "2026-03-11T00:00:00.000Z",
          kind: "freshness",
          provider: "UNIFY",
          reason: "Signal freshness degraded",
          severity: "warning",
        },
      },
    });
  });

  it("no-ops for telemetry-only events", async () => {
    await expect(dispatchOutboxEvent(makeEvent({ eventType: "telemetry.only" }))).resolves.toBeUndefined();
    expect(mockSendSlackDirectMessage).not.toHaveBeenCalled();
    expect(mockSendSlackNotification).not.toHaveBeenCalled();
  });
});
