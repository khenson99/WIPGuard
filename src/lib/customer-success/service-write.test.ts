import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CustomerSuccessAlertStatus,
  CustomerSuccessOutreachChannel,
  CustomerSuccessOutreachStatus,
  CustomerSuccessPlanStatus,
  Priority,
  TaskStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { runWithContextAsync } from "@/lib/request-context";
import { getNextColumnOrder } from "@/lib/task-order";
import { buildOutboxIdempotencyKey, publishDomainEvent } from "@/lib/event-bus";
import {
  createCustomerSuccessNote,
  createCustomerSuccessPlan,
  createCustomerSuccessTask,
  sendCustomerSuccessOutreach,
  updateCustomerSuccessAlertStatus,
} from "@/lib/customer-success/service";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customerRecord: {
      findFirst: vi.fn(),
    },
    customerSuccessNote: {
      create: vi.fn(),
    },
    customerSuccessAlertRecord: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    task: {
      create: vi.fn(),
    },
    customerSuccessPlan: {
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    customerSuccessOutreachMessage: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/request-context", () => ({
  runWithContextAsync: vi.fn(async (_context, fn) => fn()),
}));

vi.mock("@/lib/task-order", () => ({
  getNextColumnOrder: vi.fn(),
}));

vi.mock("@/lib/event-bus", () => ({
  buildOutboxIdempotencyKey: vi.fn(() => "outbox-key"),
  publishDomainEvent: vi.fn().mockResolvedValue({ id: "evt_1" }),
}));

const ACTOR = {
  id: "user_1",
  organizationId: "org_1",
  role: "member",
  name: "CS Owner",
  email: "owner@example.com",
};

describe("customer success write service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(runWithContextAsync).mockImplementation(async (_context, fn) => fn());
    vi.mocked(prisma.customerRecord.findFirst).mockResolvedValue({
      id: "acct_1",
      name: "Acme Co",
    } as never);
  });

  it("creates customer-success notes with defaults and actor ownership", async () => {
    vi.mocked(prisma.customerSuccessNote.create).mockResolvedValue({
      id: "note_1",
      customerRecordId: "acct_1",
      authorUserId: "user_1",
      body: "Health review complete",
      source: "MANUAL",
      visibility: "INTERNAL",
    } as never);

    const note = await createCustomerSuccessNote(ACTOR, {
      accountId: "acct_1",
      title: " Weekly review ",
      body: "  Health review complete  ",
    });

    expect(prisma.customerSuccessNote.create).toHaveBeenCalledWith({
      data: {
        customerRecordId: "acct_1",
        authorUserId: "user_1",
        title: "Weekly review",
        body: "Health review complete",
        source: "MANUAL",
        visibility: "INTERNAL",
        metadata: undefined,
      },
    });
    expect(note).toMatchObject({
      id: "note_1",
      customerRecordId: "acct_1",
    });
  });

  it("creates linked customer-success tasks with task ordering and status history", async () => {
    vi.mocked(getNextColumnOrder).mockResolvedValue(7);
    vi.mocked(prisma.task.create).mockResolvedValue({
      id: "task_1",
      title: "Follow up",
      status: "ACTIVE",
    } as never);

    await createCustomerSuccessTask(ACTOR, {
      accountId: "acct_1",
      title: " Follow up ",
      notes: " Share next steps ",
      status: "ACTIVE",
      priority: "P1",
      dueDate: "2026-03-12T10:00:00.000Z",
      responsibleIds: ["user_2"],
      accountableIds: ["user_3"],
    });

    expect(getNextColumnOrder).toHaveBeenCalledWith(prisma, TaskStatus.ACTIVE);
    expect(prisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Follow up",
        notes: "Share next steps",
        status: TaskStatus.ACTIVE,
        priority: Priority.P1,
        customerRecordId: "acct_1",
        columnOrder: 7,
        addedBy: "user_1",
        responsible: { connect: [{ id: "user_2" }] },
        accountable: { connect: [{ id: "user_3" }] },
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: TaskStatus.ACTIVE,
            changedBy: "user_1",
          },
        },
      }),
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        customerRecordId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it("archives existing active plans before creating a new active success plan", async () => {
    const tx = {
      customerSuccessPlan: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({
          id: "plan_1",
          status: CustomerSuccessPlanStatus.ACTIVE,
          milestones: [{ id: "milestone_1", title: "Kickoff", sortOrder: 0 }],
        }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation(
      (async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) as never
    );

    const plan = await createCustomerSuccessPlan(ACTOR, {
      accountId: "acct_1",
      name: " Adoption Plan ",
      templateKey: "adoption",
      milestoneTitles: [" Kickoff ", " Executive review "],
      targetDate: "2026-04-01T00:00:00.000Z",
    });

    expect(tx.customerSuccessPlan.updateMany).toHaveBeenCalledWith({
      where: {
        customerRecordId: "acct_1",
        status: CustomerSuccessPlanStatus.ACTIVE,
      },
      data: {
        status: CustomerSuccessPlanStatus.ARCHIVED,
      },
    });
    expect(tx.customerSuccessPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerRecordId: "acct_1",
        name: "Adoption Plan",
        templateKey: "adoption",
        status: CustomerSuccessPlanStatus.ACTIVE,
        ownerUserId: "user_1",
        milestones: {
          create: [
            { title: "Kickoff", sortOrder: 0 },
            { title: "Executive review", sortOrder: 1 },
          ],
        },
      }),
      include: {
        milestones: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    });
    expect(plan).toMatchObject({ id: "plan_1" });
  });

  it("resolves customer-success alerts with updated evaluation timestamps", async () => {
    vi.mocked(prisma.customerSuccessAlertRecord.findFirst).mockResolvedValue({
      id: "alert_1",
    } as never);
    vi.mocked(prisma.customerSuccessAlertRecord.update).mockResolvedValue({
      id: "alert_1",
      status: CustomerSuccessAlertStatus.RESOLVED,
    } as never);

    const updated = await updateCustomerSuccessAlertStatus(ACTOR, {
      accountId: "acct_1",
      alertId: "alert_1",
      status: "RESOLVED",
    });

    expect(prisma.customerSuccessAlertRecord.update).toHaveBeenCalledWith({
      where: { id: "alert_1" },
      data: expect.objectContaining({
        status: CustomerSuccessAlertStatus.RESOLVED,
      }),
    });
    expect(updated).toMatchObject({
      id: "alert_1",
      status: CustomerSuccessAlertStatus.RESOLVED,
    });
  });

  it("moves customer-success alerts into progress and clears resolvedAt", async () => {
    vi.mocked(prisma.customerSuccessAlertRecord.findFirst).mockResolvedValue({
      id: "alert_1",
    } as never);
    vi.mocked(prisma.customerSuccessAlertRecord.update).mockResolvedValue({
      id: "alert_1",
      status: CustomerSuccessAlertStatus.IN_PROGRESS,
      resolvedAt: null,
    } as never);

    const updated = await updateCustomerSuccessAlertStatus(ACTOR, {
      accountId: "acct_1",
      alertId: "alert_1",
      status: "IN_PROGRESS",
    });

    expect(prisma.customerSuccessAlertRecord.update).toHaveBeenCalledWith({
      where: { id: "alert_1" },
      data: expect.objectContaining({
        status: CustomerSuccessAlertStatus.IN_PROGRESS,
        resolvedAt: null,
        lastEvaluatedAt: expect.any(Date),
      }),
    });
    expect(updated).toMatchObject({
      id: "alert_1",
      status: CustomerSuccessAlertStatus.IN_PROGRESS,
      resolvedAt: null,
    });
  });

  it("queues outreach sends and publishes an outbox event after persisting the message", async () => {
    const tx = {
      customerSuccessOutreachMessage: {
        create: vi.fn().mockResolvedValue({
          id: "msg_1",
          templateKey: "check-in",
          recipientName: "Taylor",
          recipientAddress: "taylor@example.com",
          subject: "Check-in",
          body: "How is rollout going?",
          queuedAt: new Date("2026-03-09T15:00:00.000Z"),
        }),
      },
      outboxEvent: {
        upsert: vi.fn(),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation(
      (async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) as never
    );

    const message = await sendCustomerSuccessOutreach(ACTOR, {
      accountId: "acct_1",
      channel: CustomerSuccessOutreachChannel.EMAIL,
      templateKey: "check-in",
      recipientName: "Taylor",
      recipientAddress: "taylor@example.com",
      subject: "Check-in",
      body: "How is rollout going?",
    });

    expect(tx.customerSuccessOutreachMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerRecordId: "acct_1",
        authorUserId: "user_1",
        channel: CustomerSuccessOutreachChannel.EMAIL,
        status: CustomerSuccessOutreachStatus.QUEUED,
        recipientAddress: "taylor@example.com",
        subject: "Check-in",
        body: "How is rollout going?",
      }),
    });
    expect(buildOutboxIdempotencyKey).toHaveBeenCalledWith({
      aggregateType: "customer_success_outreach_message",
      aggregateId: "msg_1",
      eventType: "customer_success.outreach.send",
    });
    expect(publishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "customer_success.outreach.send",
        aggregateType: "customer_success_outreach_message",
        aggregateId: "msg_1",
      }),
      { outboxEvent: tx.outboxEvent }
    );
    expect(message).toMatchObject({
      id: "msg_1",
      recipientAddress: "taylor@example.com",
    });
  });
});
