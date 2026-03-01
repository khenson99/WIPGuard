import { describe, expect, it } from "vitest";
import { computeConferenceSummary } from "@/lib/conferences/summary";

describe("computeConferenceSummary", () => {
  it("computes overdue counts, next deadline, and budget variance", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    const summary = computeConferenceSummary({
      now,
      startDate: new Date("2026-02-01T00:00:00Z"),
      endDate: new Date("2026-02-03T00:00:00Z"),
      tasks: [
        { status: "DONE", dueDate: new Date("2026-01-05T00:00:00Z") },
        { status: "ACTIVE", dueDate: new Date("2026-01-09T00:00:00Z") },
        { status: "ACTIVE", dueDate: new Date("2026-01-11T00:00:00Z") },
      ],
      deadlines: [
        { dueAt: new Date("2026-01-08T00:00:00Z"), completedAt: null },
        { dueAt: new Date("2026-01-12T00:00:00Z"), completedAt: null },
        { dueAt: new Date("2026-01-07T00:00:00Z"), completedAt: new Date("2026-01-07T00:00:00Z") },
      ],
      budgetLineItems: [{ plannedAmount: 100 }, { plannedAmount: 50 }],
      expenses: [{ amount: 200 }],
      leads: [
        { status: "NEW", pushedToHubspotAt: now, followupTaskId: "t1" },
        { status: "QUALIFIED", pushedToHubspotAt: null, followupTaskId: null },
      ],
      followupTasksById: {
        t1: { status: "ACTIVE" },
      },
    });

    expect(summary.tasks.total).toBe(3);
    expect(summary.tasks.done).toBe(1);
    expect(summary.tasks.overdue).toBe(1);

    expect(summary.deadlines.total).toBe(3);
    expect(summary.deadlines.completed).toBe(1);
    expect(summary.deadlines.overdue).toBe(1);
    expect(summary.deadlines.nextDueAt).toBe("2026-01-08T00:00:00.000Z");

    expect(summary.costs.plannedTotal).toBe(150);
    expect(summary.costs.actualTotal).toBe(200);
    expect(summary.costs.variance).toBe(50);

    expect(summary.leads.total).toBe(2);
    expect(summary.leads.pushedCount).toBe(1);
    expect(summary.leads.followupOpenCount).toBe(1);
    expect(summary.leads.byStatus.NEW).toBe(1);
    expect(summary.leads.byStatus.QUALIFIED).toBe(1);
  });
});
