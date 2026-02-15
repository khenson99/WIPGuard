import { describe, it, expect } from "vitest";
import {
  categorizeTasks,
  summarizeThroughput,
  buildDailyDeltas,
  type SprintTask,
} from "../sprint-ledger";

// ---------- Test helpers ----------

function makeTask(
  overrides: Partial<SprintTask> & { id: string; title: string },
): SprintTask {
  return {
    status: "BACKLOG",
    unplanned: false,
    unplannedReason: null,
    unplannedNote: null,
    addedBy: null,
    createdAt: new Date("2026-02-10T10:00:00Z"),
    ...overrides,
  };
}

// ---------- categorizeTasks ----------

describe("categorizeTasks", () => {
  it("marks all tasks as unplanned when no commitment exists", () => {
    const tasks = [
      makeTask({ id: "t1", title: "Task 1" }),
      makeTask({ id: "t2", title: "Task 2" }),
    ];
    const committed = new Set<string>();

    const { planned, unplanned } = categorizeTasks(tasks, committed);

    expect(planned).toHaveLength(0);
    expect(unplanned).toHaveLength(2);
  });

  it("splits tasks into planned and unplanned based on commitment", () => {
    const tasks = [
      makeTask({ id: "t1", title: "Committed task" }),
      makeTask({ id: "t2", title: "New task" }),
      makeTask({ id: "t3", title: "Another committed" }),
    ];
    const committed = new Set(["t1", "t3"]);

    const { planned, unplanned } = categorizeTasks(tasks, committed);

    expect(planned.map((t) => t.id)).toEqual(["t1", "t3"]);
    expect(unplanned.map((t) => t.id)).toEqual(["t2"]);
  });

  it("treats committed but explicitly-unplanned tasks as unplanned", () => {
    const tasks = [
      makeTask({ id: "t1", title: "Was committed but marked unplanned", unplanned: true }),
    ];
    const committed = new Set(["t1"]);

    const { planned, unplanned } = categorizeTasks(tasks, committed);

    expect(planned).toHaveLength(0);
    expect(unplanned).toHaveLength(1);
    expect(unplanned[0].id).toBe("t1");
  });

  it("returns empty arrays for empty input", () => {
    const { planned, unplanned } = categorizeTasks([], new Set());
    expect(planned).toHaveLength(0);
    expect(unplanned).toHaveLength(0);
  });
});

// ---------- summarizeThroughput ----------

describe("summarizeThroughput", () => {
  it("counts planned and unplanned done tasks", () => {
    const planned = [
      makeTask({ id: "t1", title: "Planned done", status: "DONE" }),
      makeTask({ id: "t2", title: "Planned active", status: "ACTIVE" }),
      makeTask({ id: "t3", title: "Planned backlog", status: "BACKLOG" }),
    ];
    const unplanned = [
      makeTask({ id: "t4", title: "Unplanned done", status: "DONE", unplannedReason: "BUG_FIX" }),
      makeTask({ id: "t5", title: "Unplanned active", status: "ACTIVE", unplannedReason: "ESCALATION" }),
    ];

    const summary = summarizeThroughput(planned, unplanned);

    expect(summary.totalPlanned).toBe(3);
    expect(summary.totalUnplanned).toBe(2);
    expect(summary.plannedDone).toBe(1);
    expect(summary.unplannedDone).toBe(1);
  });

  it("aggregates unplanned reasons correctly", () => {
    const unplanned = [
      makeTask({ id: "t1", title: "Bug 1", unplannedReason: "BUG_FIX" }),
      makeTask({ id: "t2", title: "Bug 2", unplannedReason: "BUG_FIX" }),
      makeTask({ id: "t3", title: "Escalation", unplannedReason: "ESCALATION" }),
      makeTask({ id: "t4", title: "No reason" }),
    ];

    const summary = summarizeThroughput([], unplanned);

    expect(summary.unplannedByReason).toEqual({
      BUG_FIX: 2,
      ESCALATION: 1,
      UNSPECIFIED: 1,
    });
  });

  it("handles empty inputs", () => {
    const summary = summarizeThroughput([], []);
    expect(summary.totalPlanned).toBe(0);
    expect(summary.totalUnplanned).toBe(0);
    expect(summary.plannedDone).toBe(0);
    expect(summary.unplannedDone).toBe(0);
    expect(summary.unplannedByReason).toEqual({});
  });
});

// ---------- buildDailyDeltas ----------

describe("buildDailyDeltas", () => {
  it("generates one entry per day in the sprint range", () => {
    const start = new Date("2026-02-01T00:00:00Z");
    const end = new Date("2026-02-03T23:59:59Z");

    const deltas = buildDailyDeltas(start, end, [], new Set());

    expect(deltas).toHaveLength(3);
    expect(deltas.map((d) => d.date)).toEqual([
      "2026-02-01",
      "2026-02-02",
      "2026-02-03",
    ]);
  });

  it("shows cumulative planned counts across days", () => {
    const start = new Date("2026-02-01T00:00:00Z");
    const end = new Date("2026-02-03T23:59:59Z");
    const committed = new Set(["t1", "t2"]);

    const tasks = [
      makeTask({
        id: "t1",
        title: "Committed day 1",
        createdAt: new Date("2026-02-01T08:00:00Z"),
      }),
      makeTask({
        id: "t2",
        title: "Committed day 2",
        createdAt: new Date("2026-02-02T08:00:00Z"),
      }),
    ];

    const deltas = buildDailyDeltas(start, end, tasks, committed);

    // Day 1: only t1 exists
    expect(deltas[0].planned.total).toBe(1);
    // Day 2: t1 + t2
    expect(deltas[1].planned.total).toBe(2);
    // Day 3: still t1 + t2
    expect(deltas[2].planned.total).toBe(2);
  });

  it("tracks unplanned additions with reason attribution", () => {
    const start = new Date("2026-02-01T00:00:00Z");
    const end = new Date("2026-02-02T23:59:59Z");
    const committed = new Set(["t1"]);

    const tasks = [
      makeTask({
        id: "t1",
        title: "Committed",
        createdAt: new Date("2026-02-01T08:00:00Z"),
      }),
      makeTask({
        id: "t2",
        title: "Unplanned bug",
        unplanned: true,
        unplannedReason: "BUG_FIX",
        unplannedNote: "Production crash",
        addedBy: "user-123",
        createdAt: new Date("2026-02-02T14:00:00Z"),
      }),
    ];

    const deltas = buildDailyDeltas(start, end, tasks, committed);

    // Day 1: no unplanned
    expect(deltas[0].unplanned.total).toBe(0);
    expect(deltas[0].additions).toHaveLength(0);

    // Day 2: t2 added
    expect(deltas[1].unplanned.total).toBe(1);
    expect(deltas[1].additions).toHaveLength(1);
    expect(deltas[1].additions[0]).toMatchObject({
      taskId: "t2",
      title: "Unplanned bug",
      addedBy: "user-123",
      unplannedReason: "BUG_FIX",
      unplannedNote: "Production crash",
    });
  });

  it("correctly counts done tasks in planned and unplanned", () => {
    const start = new Date("2026-02-01T00:00:00Z");
    const end = new Date("2026-02-01T23:59:59Z");
    const committed = new Set(["t1"]);

    const tasks = [
      makeTask({
        id: "t1",
        title: "Planned done",
        status: "DONE",
        createdAt: new Date("2026-02-01T08:00:00Z"),
      }),
      makeTask({
        id: "t2",
        title: "Unplanned done",
        status: "DONE",
        createdAt: new Date("2026-02-01T10:00:00Z"),
      }),
    ];

    const deltas = buildDailyDeltas(start, end, tasks, committed);

    expect(deltas[0].planned.done).toBe(1);
    expect(deltas[0].unplanned.done).toBe(1);
  });

  it("handles sprint with no tasks", () => {
    const start = new Date("2026-02-01T00:00:00Z");
    const end = new Date("2026-02-01T23:59:59Z");

    const deltas = buildDailyDeltas(start, end, [], new Set());

    expect(deltas).toHaveLength(1);
    expect(deltas[0].planned.total).toBe(0);
    expect(deltas[0].unplanned.total).toBe(0);
    expect(deltas[0].additions).toHaveLength(0);
  });

  it("groups unplanned by reason in daily deltas", () => {
    const start = new Date("2026-02-01T00:00:00Z");
    const end = new Date("2026-02-01T23:59:59Z");

    const tasks = [
      makeTask({
        id: "t1",
        title: "Bug",
        unplannedReason: "BUG_FIX",
        createdAt: new Date("2026-02-01T08:00:00Z"),
      }),
      makeTask({
        id: "t2",
        title: "Customer req",
        unplannedReason: "CUSTOMER_REQUEST",
        createdAt: new Date("2026-02-01T09:00:00Z"),
      }),
      makeTask({
        id: "t3",
        title: "Another bug",
        unplannedReason: "BUG_FIX",
        createdAt: new Date("2026-02-01T10:00:00Z"),
      }),
    ];

    const deltas = buildDailyDeltas(start, end, tasks, new Set());

    expect(deltas[0].unplanned.byReason).toEqual({
      BUG_FIX: 2,
      CUSTOMER_REQUEST: 1,
    });
  });

  it("does not count tasks created before sprint start", () => {
    const start = new Date("2026-02-05T00:00:00Z");
    const end = new Date("2026-02-05T23:59:59Z");

    const tasks = [
      makeTask({
        id: "t1",
        title: "Pre-sprint task",
        createdAt: new Date("2026-02-01T08:00:00Z"),
      }),
    ];

    const deltas = buildDailyDeltas(start, end, tasks, new Set());

    // t1 was created before sprint start, so it exists cumulatively on day 1
    expect(deltas[0].unplanned.total).toBe(1);
    // But it's not an "addition" on this day since it was created before
    expect(deltas[0].additions).toHaveLength(0);
  });
});
