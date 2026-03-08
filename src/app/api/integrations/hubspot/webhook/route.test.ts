import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const txMocks = vi.hoisted(() => ({
  integrationReceiptCreate: vi.fn(),
  taskUpdate: vi.fn(),
}));

vi.mock("@/lib/integrations/hubspot-sync", () => ({
  verifyWebhookSignature: vi.fn(),
  parseDealStageChanges: vi.fn(),
  computeReconciliation: vi.fn(),
  buildAuditEntry: vi.fn(() => ({ kind: "audit" })),
  buildWebhookDedupeKey: vi.fn(() => null),
}));

vi.mock("@/lib/integrations/hubspot-bidirectional-sync", () => ({
  HUBSPOT_BIDIRECTIONAL_RULE_KEY: "hubspot_bidirectional_sync",
  __private__: {
    normalizeConfig: vi.fn(() => ({ sync: true })),
  },
}));

vi.mock("@/lib/task-order", () => ({
  getNextColumnOrder: vi.fn(async () => 0),
}));

vi.mock("@/lib/event-bus", () => ({
  buildOutboxIdempotencyKey: vi.fn(() => "outbox-key"),
  publishDomainEvent: vi.fn(async () => ({})),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      findMany: vi.fn(),
    },
    integrationRule: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    integrationReceipt: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    outboxEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (input: unknown) => {
      if (typeof input !== "function") {
        throw new Error("Expected interactive transaction");
      }

      return input({
        integrationReceipt: {
          create: txMocks.integrationReceiptCreate,
        },
        task: {
          update: txMocks.taskUpdate,
        },
      });
    }),
  },
}));

function makeWebhookRequest(body: unknown) {
  return new NextRequest("http://localhost/api/integrations/hubspot/webhook", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "x-hubspot-signature-v3": "sig",
      "x-hubspot-request-timestamp": "123",
    },
  });
}

describe("POST /api/integrations/hubspot/webhook", () => {
  const originalSecret = process.env.HUBSPOT_CLIENT_SECRET;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();
    process.env.HUBSPOT_CLIENT_SECRET = "test-secret";

    txMocks.integrationReceiptCreate.mockResolvedValue({});
    txMocks.taskUpdate.mockResolvedValue({});

    const { verifyWebhookSignature, parseDealStageChanges, computeReconciliation } =
      await import("@/lib/integrations/hubspot-sync");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(verifyWebhookSignature).mockReturnValue({
      valid: true,
    } as never);

    vi.mocked(parseDealStageChanges).mockReturnValue([
      {
        dealId: "deal-1",
        portalId: "portal-1",
        eventId: "evt-1",
        previousStage: "appointmentscheduled",
        newStage: "qualifiedtobuy",
        occurredAt: new Date("2026-03-01T10:00:00.000Z"),
        changeSource: "CRM_UI",
      },
      {
        dealId: "deal-2",
        portalId: "portal-1",
        eventId: "evt-2",
        previousStage: "appointmentscheduled",
        newStage: "qualifiedtobuy",
        occurredAt: new Date("2026-03-01T10:05:00.000Z"),
        changeSource: "CRM_UI",
      },
    ] as never);

    vi.mocked(computeReconciliation).mockImplementation(
      ((input: { dealId: string }) => ({
        type: "update_task",
        taskId: `task-for-${input.dealId}`,
        fromStatus: "BACKLOG",
        toStatus: "ACTIVE",
      })) as never
    );

    vi.mocked(prisma.integrationConnection.findMany).mockResolvedValue([
      { userId: "user-1" },
    ] as never);
    vi.mocked(prisma.integrationRule.findUnique).mockResolvedValue({
      id: "rule-1",
      enabled: true,
      config: {},
    } as never);
    vi.mocked(prisma.integrationRule.update).mockResolvedValue({} as never);
    vi.mocked(prisma.integrationReceipt.findMany).mockResolvedValue([
      {
        task: {
          id: "task-1",
          status: "BACKLOG",
          updatedAt: new Date("2026-03-01T09:00:00.000Z"),
          completedOn: null,
        },
      },
    ] as never);
    vi.mocked(prisma.integrationReceipt.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.outboxEvent.create).mockResolvedValue({} as never);
  });

  afterEach(() => {
    process.env.HUBSPOT_CLIENT_SECRET = originalSecret;
    vi.useRealTimers();
  });

  it("returns 207 and dead-letters failed changes when processing is partial", async () => {
    const { prisma } = await import("@/lib/prisma");

    txMocks.taskUpdate
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("task update failed"));

    const { POST } = await import("@/app/api/integrations/hubspot/webhook/route");
    const response = await POST(makeWebhookRequest([{ eventId: "ignored" }]));
    const body = await response.json();

    expect(response.status).toBe(207);
    expect(body.ok).toBe(false);
    expect(body.processed).toBe(2);
    expect(body.applied).toBe(1);
    expect(body.errors).toBe(1);
    expect(body.failures).toEqual([
      {
        dealId: "deal-2",
        error: "task update failed",
      },
    ]);
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "integration.hubspot.webhook.failed",
        aggregateId: "rule-1",
        status: "DEAD_LETTER",
        error: "task update failed",
      }),
    });
    expect(prisma.integrationRule.update).toHaveBeenCalledWith({
      where: { id: "rule-1" },
      data: expect.objectContaining({
        lastError: "1 webhook processing error(s)",
      }),
    });
  });

  it("returns 500 when webhook processing exceeds the timeout", async () => {
    vi.useFakeTimers();

    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.integrationConnection.findMany).mockImplementation(
      (() => new Promise(() => {})) as never
    );

    const { POST } = await import("@/app/api/integrations/hubspot/webhook/route");
    const responsePromise = POST(makeWebhookRequest([{ eventId: "ignored" }]));

    await vi.advanceTimersByTimeAsync(30_000);

    const response = await responsePromise;
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "HubSpot webhook processing timed out",
      timeoutMs: 30000,
    });
  });
});
