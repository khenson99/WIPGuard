import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockAuth,
  mockDeadLetterOutboxEvents,
  mockGetOutboxOperationalMetrics,
  mockReplayOutboxEvents,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDeadLetterOutboxEvents: vi.fn(),
  mockGetOutboxOperationalMetrics: vi.fn(),
  mockReplayOutboxEvents: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/lib/outbox-worker", () => ({
  deadLetterOutboxEvents: mockDeadLetterOutboxEvents,
  getOutboxOperationalMetrics: mockGetOutboxOperationalMetrics,
  replayOutboxEvents: mockReplayOutboxEvents,
}));

function request(url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "content-type": "application/json" },
  });
}

function metrics() {
  return {
    counts: {
      pending: 1,
      failed: 2,
      deadLetter: 3,
      dispatched: 4,
      total: 10,
    },
    lag: {
      oldestRetryableEventAgeSeconds: 120,
      oldestRetryableEventId: "evt_old",
    },
    failuresByEventType: [{ eventType: "integration.sync", count: 2 }],
    recentDeadLetters: [
      {
        id: "dead_1",
        eventType: "integration.sync",
        aggregateType: "integration",
        aggregateId: "slack",
        retryCount: 5,
        failedAt: "2026-02-15T00:00:00.000Z",
        error: "timeout",
      },
    ],
  };
}

describe("events API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    mockGetOutboxOperationalMetrics.mockResolvedValue(metrics());
    mockReplayOutboxEvents.mockResolvedValue(2);
    mockDeadLetterOutboxEvents.mockResolvedValue(1);
  });

  it("returns canonical outbox metrics from /api/events/dashboard", async () => {
    const { GET } = await import("@/app/api/events/dashboard/route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.metrics.lag.oldestRetryableEventAgeSeconds).toBe(120);
    expect(mockGetOutboxOperationalMetrics).toHaveBeenCalledTimes(1);
  });

  it("replays failed and dead-letter events through the worker", async () => {
    const { POST } = await import("@/app/api/events/replay/route");

    const response = await POST(
      request("http://localhost/api/events/replay", {
        statuses: ["FAILED", "DEAD_LETTER"],
        limit: 50,
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      action: "replay",
      replayed: 2,
      eventIds: null,
      statuses: ["FAILED", "DEAD_LETTER"],
      limit: 50,
    });
    expect(mockReplayOutboxEvents).toHaveBeenCalledWith(
      {},
      {
        eventIds: [],
        statuses: ["FAILED", "DEAD_LETTER"],
        limit: 50,
      }
    );
  });

  it("dead-letters selected retryable events", async () => {
    const { POST } = await import("@/app/api/events/dead-letter/route");

    const response = await POST(
      request("http://localhost/api/events/dead-letter", {
        eventIds: ["evt_1"],
        reason: "manual queue unblock",
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      action: "dead-letter",
      deadLettered: 1,
      eventIds: ["evt_1"],
      statuses: ["PENDING", "FAILED"],
    });
    expect(mockDeadLetterOutboxEvents).toHaveBeenCalledWith(
      {},
      {
        eventIds: ["evt_1"],
        statuses: [],
        reason: "manual queue unblock",
      }
    );
  });

  it("rejects dead-letter requests without event IDs", async () => {
    const { POST } = await import("@/app/api/events/dead-letter/route");

    const response = await POST(
      request("http://localhost/api/events/dead-letter", {
        eventIds: [],
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("eventIds must contain at least one event id");
    expect(mockDeadLetterOutboxEvents).not.toHaveBeenCalled();
  });

  it("requires admin access for dead-letter requests", async () => {
    mockAuth.mockResolvedValue({ user: { id: "viewer-1", role: "member" } });
    const { POST } = await import("@/app/api/events/dead-letter/route");

    const response = await POST(
      request("http://localhost/api/events/dead-letter", {
        eventIds: ["evt_1"],
      })
    );

    expect(response.status).toBe(403);
    expect(mockDeadLetterOutboxEvents).not.toHaveBeenCalled();
  });
});
