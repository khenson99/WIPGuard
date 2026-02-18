import { describe, it, expect } from "vitest";
import {
  // Types
  type TaskSnapshot,
  type SprintTask,
  type CommitmentChangeLog,
  type PlannedVsUnplannedSummary,
  // Taxonomy
  UNPLANNED_REASON_TAXONOMY,
  VALID_UNPLANNED_REASONS,
  isValidUnplannedReason,
  // Pure functions
  categorizeTasks,
  summarizeThroughput,
  buildDailyDeltas,
  diffSnapshots,
  buildCommitmentChangeLog,
  buildPlanningSessionSummary,
  computeCommitmentDrift,
  computeUnplannedRatio,
} from "../sprint-ledger";

// ─── Test Helpers ────────────────────────────────────────────

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

function makeSnapshot(
  overrides: Partial<TaskSnapshot> & { taskId: string },
): TaskSnapshot {
  return {
    title: `Task ${overrides.taskId}`,
    status: "BACKLOG",
    priority: "P2",
    projectId: null,
    ...overrides,
  };
}

// ============================================================
// 1. UNPLANNED REASON TAXONOMY
// ============================================================

describe("Unplanned Reason Taxonomy", () => {
  it("contains all expected reason codes", () => {
    const codes = UNPLANNED_REASON_TAXONOMY.map((r) => r.code);
    expect(codes).toContain("ESCALATION");
    expect(codes).toContain("BUG_FIX");
    expect(codes).toContain("CUSTOMER_REQUEST");
    expect(codes).toContain("SCOPE_CHANGE");
    expect(codes).toContain("DEPENDENCY");
    expect(codes).toContain("OTHER");
  });

  it("has no duplicate codes", () => {
    const codes = UNPLANNED_REASON_TAXONOMY.map((r) => r.code);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it("each entry has non-empty label and description", () => {
    for (const entry of UNPLANNED_REASON_TAXONOMY) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("VALID_UNPLANNED_REASONS set matches taxonomy codes", () => {
    for (const entry of UNPLANNED_REASON_TAXONOMY) {
      expect(VALID_UNPLANNED_REASONS.has(entry.code)).toBe(true);
    }
    expect(VALID_UNPLANNED_REASONS.size).toBe(UNPLANNED_REASON_TAXONOMY.length);
  });

  it("isValidUnplannedReason returns true for valid codes", () => {
    expect(isValidUnplannedReason("ESCALATION")).toBe(true);
    expect(isValidUnplannedReason("BUG_FIX")).toBe(true);
    expect(isValidUnplannedReason("OTHER")).toBe(true);
  });

  it("isValidUnplannedReason returns false for invalid codes", () => {
    expect(isValidUnplannedReason("INVALID")).toBe(false);
    expect(isValidUnplannedReason("")).toBe(false);
    expect(isValidUnplannedReason("bug_fix")).toBe(false); // case-sensitive
  });
});

// ============================================================
// 2. COMMITMENT SNAPSHOT DIFFING
// ============================================================

describe("diffSnapshots", () => {
  it("returns empty changes when both snapshots are identical", () => {
    const prev = [
      makeSnapshot({ taskId: "t1" }),
      makeSnapshot({ taskId: "t2" }),
    ];
    const curr = [
      makeSnapshot({ taskId: "t1" }),
      makeSnapshot({ taskId: "t2" }),
    ];

    const changes = diffSnapshots(prev, curr);
    expect(changes).toHaveLength(0);
  });

  it("detects added tasks", () => {
    const prev = [makeSnapshot({ taskId: "t1" })];
    const curr = [
      makeSnapshot({ taskId: "t1" }),
      makeSnapshot({ taskId: "t2" }),
      makeSnapshot({ taskId: "t3" }),
    ];

    const changes = diffSnapshots(prev, curr);
    const added = changes.filter((c) => c.type === "ADDED");
    const removed = changes.filter((c) => c.type === "REMOVED");

    expect(added).toHaveLength(2);
    expect(removed).toHaveLength(0);
    expect(added.map((c) => c.taskId).sort()).toEqual(["t2", "t3"]);
  });

  it("detects removed tasks", () => {
    const prev = [
      makeSnapshot({ taskId: "t1" }),
      makeSnapshot({ taskId: "t2" }),
      makeSnapshot({ taskId: "t3" }),
    ];
    const curr = [makeSnapshot({ taskId: "t2" })];

    const changes = diffSnapshots(prev, curr);
    const added = changes.filter((c) => c.type === "ADDED");
    const removed = changes.filter((c) => c.type === "REMOVED");

    expect(added).toHaveLength(0);
    expect(removed).toHaveLength(2);
    expect(removed.map((c) => c.taskId).sort()).toEqual(["t1", "t3"]);
  });

  it("detects simultaneous additions and removals", () => {
    const prev = [
      makeSnapshot({ taskId: "t1" }),
      makeSnapshot({ taskId: "t2" }),
    ];
    const curr = [
      makeSnapshot({ taskId: "t2" }),
      makeSnapshot({ taskId: "t3" }),
    ];

    const changes = diffSnapshots(prev, curr);
    const added = changes.filter((c) => c.type === "ADDED");
    const removed = changes.filter((c) => c.type === "REMOVED");

    expect(added).toHaveLength(1);
    expect(added[0].taskId).toBe("t3");
    expect(removed).toHaveLength(1);
    expect(removed[0].taskId).toBe("t1");
  });

  it("handles empty previous snapshot (initial commitment)", () => {
    const prev: TaskSnapshot[] = [];
    const curr = [
      makeSnapshot({ taskId: "t1" }),
      makeSnapshot({ taskId: "t2" }),
    ];

    const changes = diffSnapshots(prev, curr);

    expect(changes).toHaveLength(2);
    expect(changes.every((c) => c.type === "ADDED")).toBe(true);
  });

  it("handles empty current snapshot (all tasks removed)", () => {
    const prev = [
      makeSnapshot({ taskId: "t1" }),
      makeSnapshot({ taskId: "t2" }),
    ];
    const curr: TaskSnapshot[] = [];

    const changes = diffSnapshots(prev, curr);

    expect(changes).toHaveLength(2);
    expect(changes.every((c) => c.type === "REMOVED")).toBe(true);
  });

  it("handles both empty snapshots", () => {
    const changes = diffSnapshots([], []);
    expect(changes).toHaveLength(0);
  });

  it("preserves task metadata in change records", () => {
    const prev: TaskSnapshot[] = [];
    const curr = [
      makeSnapshot({
        taskId: "t1",
        title: "Build API",
        status: "ACTIVE",
        priority: "P0",
      }),
    ];

    const changes = diffSnapshots(prev, curr);

    expect(changes[0]).toEqual({
      type: "ADDED",
      taskId: "t1",
      title: "Build API",
      status: "ACTIVE",
      priority: "P0",
    });
  });

  it("handles large snapshot diffs efficiently", () => {
    const prev = Array.from({ length: 200 }, (_, i) =>
      makeSnapshot({ taskId: `t${i}` }),
    );
    // Remove first 50, keep middle 100, add 50 new
    const curr = [
      ...prev.slice(50, 150),
      ...Array.from({ length: 50 }, (_, i) =>
        makeSnapshot({ taskId: `new${i}` }),
      ),
    ];

    const changes = diffSnapshots(prev, curr);
    const added = changes.filter((c) => c.type === "ADDED");
    const removed = changes.filter((c) => c.type === "REMOVED");

    expect(added).toHaveLength(50);
    expect(removed).toHaveLength(100); // t0-t49 and t150-t199
  });
});

// ============================================================
// 3. COMMITMENT CHANGE LOG
// ============================================================

describe("buildCommitmentChangeLog", () => {
  it("returns empty log for no snapshots", () => {
    const log = buildCommitmentChangeLog("sprint-1", []);

    expect(log.sprintId).toBe("sprint-1");
    expect(log.entries).toHaveLength(0);
    expect(log.totalSnapshots).toBe(0);
    expect(log.currentCommittedCount).toBe(0);
    expect(log.initialCommittedCount).toBe(0);
    expect(log.netChange).toBe(0);
  });

  it("first snapshot shows all tasks as ADDED", () => {
    const snapshots = [
      {
        id: "snap-1",
        snapshotAt: "2026-02-01T10:00:00Z",
        createdBy: "user-1",
        taskSnapshots: [
          makeSnapshot({ taskId: "t1" }),
          makeSnapshot({ taskId: "t2" }),
          makeSnapshot({ taskId: "t3" }),
        ],
      },
    ];

    const log = buildCommitmentChangeLog("sprint-1", snapshots);

    expect(log.entries).toHaveLength(1);
    expect(log.entries[0].changes).toHaveLength(3);
    expect(log.entries[0].changes.every((c) => c.type === "ADDED")).toBe(true);
    expect(log.initialCommittedCount).toBe(3);
    expect(log.currentCommittedCount).toBe(3);
    expect(log.netChange).toBe(0);
  });

  it("tracks additions across multiple snapshots", () => {
    const snapshots = [
      {
        id: "snap-1",
        snapshotAt: "2026-02-01T10:00:00Z",
        createdBy: "user-1",
        taskSnapshots: [
          makeSnapshot({ taskId: "t1" }),
          makeSnapshot({ taskId: "t2" }),
        ],
      },
      {
        id: "snap-2",
        snapshotAt: "2026-02-03T10:00:00Z",
        createdBy: "user-2",
        taskSnapshots: [
          makeSnapshot({ taskId: "t1" }),
          makeSnapshot({ taskId: "t2" }),
          makeSnapshot({ taskId: "t3" }),
        ],
      },
    ];

    const log = buildCommitmentChangeLog("sprint-1", snapshots);

    expect(log.entries).toHaveLength(2);
    // First entry: 2 initial tasks
    expect(log.entries[0].changes).toHaveLength(2);
    expect(log.entries[0].taskCount).toBe(2);
    // Second entry: 1 addition
    expect(log.entries[1].changes).toHaveLength(1);
    expect(log.entries[1].changes[0].type).toBe("ADDED");
    expect(log.entries[1].changes[0].taskId).toBe("t3");
    expect(log.entries[1].createdBy).toBe("user-2");
    // Metrics
    expect(log.initialCommittedCount).toBe(2);
    expect(log.currentCommittedCount).toBe(3);
    expect(log.netChange).toBe(1);
  });

  it("tracks removals across snapshots", () => {
    const snapshots = [
      {
        id: "snap-1",
        snapshotAt: "2026-02-01T10:00:00Z",
        createdBy: "user-1",
        taskSnapshots: [
          makeSnapshot({ taskId: "t1" }),
          makeSnapshot({ taskId: "t2" }),
          makeSnapshot({ taskId: "t3" }),
        ],
      },
      {
        id: "snap-2",
        snapshotAt: "2026-02-05T10:00:00Z",
        createdBy: "user-1",
        taskSnapshots: [makeSnapshot({ taskId: "t2" })],
      },
    ];

    const log = buildCommitmentChangeLog("sprint-1", snapshots);

    expect(log.entries[1].changes).toHaveLength(2);
    const removed = log.entries[1].changes.filter((c) => c.type === "REMOVED");
    expect(removed).toHaveLength(2);
    expect(removed.map((c) => c.taskId).sort()).toEqual(["t1", "t3"]);
    expect(log.netChange).toBe(-2);
  });

  it("tracks complex multi-snapshot evolution", () => {
    const snapshots = [
      {
        id: "snap-1",
        snapshotAt: "2026-02-01T10:00:00Z",
        createdBy: "user-1",
        taskSnapshots: [
          makeSnapshot({ taskId: "t1" }),
          makeSnapshot({ taskId: "t2" }),
        ],
      },
      {
        id: "snap-2",
        snapshotAt: "2026-02-03T10:00:00Z",
        createdBy: "user-2",
        taskSnapshots: [
          makeSnapshot({ taskId: "t2" }),
          makeSnapshot({ taskId: "t3" }),
        ],
      },
      {
        id: "snap-3",
        snapshotAt: "2026-02-05T10:00:00Z",
        createdBy: "user-1",
        taskSnapshots: [
          makeSnapshot({ taskId: "t2" }),
          makeSnapshot({ taskId: "t3" }),
          makeSnapshot({ taskId: "t4" }),
          makeSnapshot({ taskId: "t5" }),
        ],
      },
    ];

    const log = buildCommitmentChangeLog("sprint-1", snapshots);

    expect(log.totalSnapshots).toBe(3);
    // snap-1: +t1, +t2
    expect(log.entries[0].changes).toHaveLength(2);
    // snap-2: -t1, +t3
    expect(log.entries[1].changes).toHaveLength(2);
    // snap-3: +t4, +t5
    expect(log.entries[2].changes).toHaveLength(2);
    expect(log.initialCommittedCount).toBe(2);
    expect(log.currentCommittedCount).toBe(4);
    expect(log.netChange).toBe(2);
  });

  it("preserves snapshot metadata in entries", () => {
    const snapshots = [
      {
        id: "snap-abc",
        snapshotAt: "2026-02-01T10:30:00Z",
        createdBy: "user-xyz",
        taskSnapshots: [makeSnapshot({ taskId: "t1" })],
      },
    ];

    const log = buildCommitmentChangeLog("sprint-99", snapshots);

    expect(log.entries[0].snapshotId).toBe("snap-abc");
    expect(log.entries[0].snapshotAt).toBe("2026-02-01T10:30:00Z");
    expect(log.entries[0].createdBy).toBe("user-xyz");
    expect(log.entries[0].taskCount).toBe(1);
  });
});

// ============================================================
// 4. COMMITMENT DRIFT
// ============================================================

describe("computeCommitmentDrift", () => {
  it("returns 0 when no initial commitment", () => {
    const log: CommitmentChangeLog = {
      sprintId: "s1",
      entries: [],
      totalSnapshots: 0,
      currentCommittedCount: 0,
      initialCommittedCount: 0,
      netChange: 0,
    };

    expect(computeCommitmentDrift(log)).toBe(0);
  });

  it("returns 0 when no net change", () => {
    const log: CommitmentChangeLog = {
      sprintId: "s1",
      entries: [],
      totalSnapshots: 2,
      currentCommittedCount: 10,
      initialCommittedCount: 10,
      netChange: 0,
    };

    expect(computeCommitmentDrift(log)).toBe(0);
  });

  it("calculates positive drift (scope increase)", () => {
    const log: CommitmentChangeLog = {
      sprintId: "s1",
      entries: [],
      totalSnapshots: 2,
      currentCommittedCount: 15,
      initialCommittedCount: 10,
      netChange: 5,
    };

    expect(computeCommitmentDrift(log)).toBe(0.5);
  });

  it("calculates negative drift (scope decrease)", () => {
    const log: CommitmentChangeLog = {
      sprintId: "s1",
      entries: [],
      totalSnapshots: 2,
      currentCommittedCount: 7,
      initialCommittedCount: 10,
      netChange: -3,
    };

    expect(computeCommitmentDrift(log)).toBe(0.3);
  });
});

// ============================================================
// 5. UNPLANNED RATIO
// ============================================================

describe("computeUnplannedRatio", () => {
  it("returns 0 when no tasks", () => {
    const summary: PlannedVsUnplannedSummary = {
      totalPlanned: 0,
      totalUnplanned: 0,
      plannedDone: 0,
      unplannedDone: 0,
      unplannedByReason: {},
    };

    expect(computeUnplannedRatio(summary)).toBe(0);
  });

  it("returns 0 when all tasks are planned", () => {
    const summary: PlannedVsUnplannedSummary = {
      totalPlanned: 10,
      totalUnplanned: 0,
      plannedDone: 5,
      unplannedDone: 0,
      unplannedByReason: {},
    };

    expect(computeUnplannedRatio(summary)).toBe(0);
  });

  it("returns 1 when all tasks are unplanned", () => {
    const summary: PlannedVsUnplannedSummary = {
      totalPlanned: 0,
      totalUnplanned: 8,
      plannedDone: 0,
      unplannedDone: 4,
      unplannedByReason: { BUG_FIX: 8 },
    };

    expect(computeUnplannedRatio(summary)).toBe(1);
  });

  it("computes correct ratio for mixed workload", () => {
    const summary: PlannedVsUnplannedSummary = {
      totalPlanned: 7,
      totalUnplanned: 3,
      plannedDone: 5,
      unplannedDone: 2,
      unplannedByReason: { BUG_FIX: 2, ESCALATION: 1 },
    };

    expect(computeUnplannedRatio(summary)).toBe(0.3);
  });
});

// ============================================================
// 6. PLANNING SESSION SUMMARY
// ============================================================

describe("buildPlanningSessionSummary", () => {
  it("builds summary from session data", () => {
    const session = {
      id: "ps-1",
      sprintId: "sprint-1",
      createdBy: "user-1",
      startedAt: new Date("2026-02-01T09:00:00Z"),
      completedAt: new Date("2026-02-01T10:00:00Z"),
      notes: "Planning notes",
      tasks: [{ id: "t1" }, { id: "t2" }, { id: "t3" }],
    };

    const summary = buildPlanningSessionSummary(session, new Set());

    expect(summary.id).toBe("ps-1");
    expect(summary.sprintId).toBe("sprint-1");
    expect(summary.createdBy).toBe("user-1");
    expect(summary.startedAt).toBe("2026-02-01T09:00:00.000Z");
    expect(summary.completedAt).toBe("2026-02-01T10:00:00.000Z");
    expect(summary.notes).toBe("Planning notes");
    expect(summary.taskCount).toBe(3);
    expect(summary.taskIds).toEqual(["t1", "t2", "t3"]);
    expect(summary.hasCommitment).toBe(false);
  });

  it("handles incomplete session (null completedAt)", () => {
    const session = {
      id: "ps-2",
      sprintId: "sprint-1",
      createdBy: "user-1",
      startedAt: new Date("2026-02-01T09:00:00Z"),
      completedAt: null,
      notes: null,
      tasks: [],
    };

    const summary = buildPlanningSessionSummary(session, new Set());

    expect(summary.completedAt).toBeNull();
    expect(summary.notes).toBeNull();
    expect(summary.taskCount).toBe(0);
    expect(summary.taskIds).toEqual([]);
  });

  it("detects when session has an associated commitment", () => {
    const session = {
      id: "ps-3",
      sprintId: "sprint-1",
      createdBy: "user-1",
      startedAt: new Date("2026-02-01T09:00:00Z"),
      completedAt: new Date("2026-02-01T10:00:00Z"),
      notes: null,
      tasks: [{ id: "t1" }],
    };

    const commitmentSnapshotIds = new Set(["ps-3"]);
    const summary = buildPlanningSessionSummary(session, commitmentSnapshotIds);

    expect(summary.hasCommitment).toBe(true);
  });
});

// ============================================================
// 7. CATEGORIZE TASKS (extended)
// ============================================================

describe("categorizeTasks (commitment-ledger extensions)", () => {
  it("empty task list returns empty planned and unplanned", () => {
    const { planned, unplanned } = categorizeTasks([], new Set(["t1"]));
    expect(planned).toHaveLength(0);
    expect(unplanned).toHaveLength(0);
  });

  it("empty commitment set means all tasks are unplanned", () => {
    const tasks = [
      makeTask({ id: "t1", title: "A" }),
      makeTask({ id: "t2", title: "B" }),
    ];

    const { planned, unplanned } = categorizeTasks(tasks, new Set());
    expect(planned).toHaveLength(0);
    expect(unplanned).toHaveLength(2);
  });

  it("task in commitment AND marked unplanned goes to unplanned", () => {
    const tasks = [
      makeTask({
        id: "t1",
        title: "Bug fix",
        unplanned: true,
        unplannedReason: "BUG_FIX",
        addedBy: "user-1",
      }),
    ];

    const { planned, unplanned } = categorizeTasks(tasks, new Set(["t1"]));
    expect(planned).toHaveLength(0);
    expect(unplanned).toHaveLength(1);
    expect(unplanned[0].unplannedReason).toBe("BUG_FIX");
    expect(unplanned[0].addedBy).toBe("user-1");
  });

  it("correctly splits mixed planned/unplanned with attribution", () => {
    const tasks = [
      makeTask({ id: "t1", title: "Planned A" }),
      makeTask({ id: "t2", title: "Planned B" }),
      makeTask({
        id: "t3",
        title: "Unplanned escalation",
        unplanned: true,
        unplannedReason: "ESCALATION",
        addedBy: "user-2",
      }),
      makeTask({ id: "t4", title: "Not committed" }),
    ];

    const committed = new Set(["t1", "t2", "t3"]);
    const { planned, unplanned } = categorizeTasks(tasks, committed);

    expect(planned).toHaveLength(2);
    expect(unplanned).toHaveLength(2);
    // t3 is unplanned because it is marked as such
    expect(unplanned.find((t) => t.id === "t3")?.addedBy).toBe("user-2");
    // t4 is unplanned because it is not in the commitment
    expect(unplanned.find((t) => t.id === "t4")).toBeDefined();
  });
});

// ============================================================
// 8. SUMMARIZE THROUGHPUT (extended)
// ============================================================

describe("summarizeThroughput (commitment-ledger extensions)", () => {
  it("aggregates multiple unplanned reasons correctly", () => {
    const unplanned = [
      makeTask({ id: "t1", title: "A", unplannedReason: "BUG_FIX" }),
      makeTask({ id: "t2", title: "B", unplannedReason: "BUG_FIX" }),
      makeTask({ id: "t3", title: "C", unplannedReason: "ESCALATION" }),
      makeTask({ id: "t4", title: "D", unplannedReason: "CUSTOMER_REQUEST" }),
      makeTask({ id: "t5", title: "E", unplannedReason: null }),
    ];

    const summary = summarizeThroughput([], unplanned);

    expect(summary.unplannedByReason).toEqual({
      BUG_FIX: 2,
      ESCALATION: 1,
      CUSTOMER_REQUEST: 1,
      UNSPECIFIED: 1,
    });
  });

  it("counts done tasks only when status is DONE", () => {
    const planned = [
      makeTask({ id: "t1", title: "A", status: "DONE" }),
      makeTask({ id: "t2", title: "B", status: "ACTIVE" }),
      makeTask({ id: "t3", title: "C", status: "NOT_DONE" }),
      makeTask({ id: "t4", title: "D", status: "WORKING_ON_TODAY" }),
    ];
    const unplanned = [
      makeTask({ id: "t5", title: "E", status: "DONE" }),
      makeTask({ id: "t6", title: "F", status: "QUEUED" }),
    ];

    const summary = summarizeThroughput(planned, unplanned);

    expect(summary.totalPlanned).toBe(4);
    expect(summary.plannedDone).toBe(1);
    expect(summary.totalUnplanned).toBe(2);
    expect(summary.unplannedDone).toBe(1);
  });
});

// ============================================================
// 9. BUILD DAILY DELTAS (extended)
// ============================================================

describe("buildDailyDeltas (commitment-ledger extensions)", () => {
  it("unplanned additions include attribution details", () => {
    const start = new Date("2026-02-01T00:00:00Z");
    const end = new Date("2026-02-01T23:59:59Z");

    const tasks = [
      makeTask({
        id: "t1",
        title: "Emergency fix",
        unplanned: true,
        unplannedReason: "BUG_FIX",
        unplannedNote: "Prod is down",
        addedBy: "user-1",
        createdAt: new Date("2026-02-01T14:00:00Z"),
      }),
    ];

    const deltas = buildDailyDeltas(start, end, tasks, new Set());

    expect(deltas).toHaveLength(1);
    expect(deltas[0].additions).toHaveLength(1);
    expect(deltas[0].additions[0]).toEqual({
      taskId: "t1",
      title: "Emergency fix",
      addedBy: "user-1",
      unplannedReason: "BUG_FIX",
      unplannedNote: "Prod is down",
      addedAt: "2026-02-01T14:00:00.000Z",
    });
  });

  it("planned tasks show in planned counts, not in additions", () => {
    const start = new Date("2026-02-01T00:00:00Z");
    const end = new Date("2026-02-01T23:59:59Z");
    const committed = new Set(["t1"]);

    const tasks = [
      makeTask({
        id: "t1",
        title: "Planned task",
        createdAt: new Date("2026-02-01T10:00:00Z"),
      }),
    ];

    const deltas = buildDailyDeltas(start, end, tasks, committed);

    expect(deltas[0].planned.total).toBe(1);
    expect(deltas[0].unplanned.total).toBe(0);
    // Planned tasks added on that day do NOT show in unplanned additions
    expect(deltas[0].additions).toHaveLength(0);
  });

  it("handles 14-day sprint with mixed planned/unplanned", () => {
    const start = new Date("2026-02-01T00:00:00Z");
    const end = new Date("2026-02-14T23:59:59Z");
    const committed = new Set(["t1", "t2", "t3"]);

    const tasks = [
      // 3 planned tasks created before sprint
      makeTask({ id: "t1", title: "P1", createdAt: new Date("2026-01-28T10:00:00Z"), status: "DONE" }),
      makeTask({ id: "t2", title: "P2", createdAt: new Date("2026-01-29T10:00:00Z"), status: "ACTIVE" }),
      makeTask({ id: "t3", title: "P3", createdAt: new Date("2026-01-30T10:00:00Z"), status: "DONE" }),
      // 2 unplanned tasks added mid-sprint
      makeTask({
        id: "t4",
        title: "Bug",
        createdAt: new Date("2026-02-05T10:00:00Z"),
        unplannedReason: "BUG_FIX",
        addedBy: "user-1",
        status: "DONE",
      }),
      makeTask({
        id: "t5",
        title: "Escalation",
        createdAt: new Date("2026-02-10T10:00:00Z"),
        unplannedReason: "ESCALATION",
        addedBy: "user-2",
        status: "ACTIVE",
      }),
    ];

    const deltas = buildDailyDeltas(start, end, tasks, committed);

    expect(deltas).toHaveLength(14);

    // Day 1 (Feb 1): 3 planned (created before), 0 unplanned
    expect(deltas[0].planned.total).toBe(3);
    expect(deltas[0].unplanned.total).toBe(0);

    // Day 5 (Feb 5): 3 planned, 1 unplanned
    expect(deltas[4].planned.total).toBe(3);
    expect(deltas[4].unplanned.total).toBe(1);
    expect(deltas[4].additions).toHaveLength(1);
    expect(deltas[4].additions[0].taskId).toBe("t4");

    // Day 10 (Feb 10): 3 planned, 2 unplanned
    expect(deltas[9].planned.total).toBe(3);
    expect(deltas[9].unplanned.total).toBe(2);
    expect(deltas[9].additions).toHaveLength(1);
    expect(deltas[9].additions[0].taskId).toBe("t5");

    // Day 14 (Feb 14): same cumulative counts
    expect(deltas[13].planned.total).toBe(3);
    expect(deltas[13].planned.done).toBe(2);
    expect(deltas[13].unplanned.total).toBe(2);
    expect(deltas[13].unplanned.done).toBe(1);
  });

  it("byReason accumulates correctly across days", () => {
    const start = new Date("2026-02-01T00:00:00Z");
    const end = new Date("2026-02-03T23:59:59Z");

    const tasks = [
      makeTask({
        id: "t1",
        title: "Bug 1",
        createdAt: new Date("2026-02-01T10:00:00Z"),
        unplannedReason: "BUG_FIX",
      }),
      makeTask({
        id: "t2",
        title: "Bug 2",
        createdAt: new Date("2026-02-02T10:00:00Z"),
        unplannedReason: "BUG_FIX",
      }),
      makeTask({
        id: "t3",
        title: "Escalation",
        createdAt: new Date("2026-02-03T10:00:00Z"),
        unplannedReason: "ESCALATION",
      }),
    ];

    const deltas = buildDailyDeltas(start, end, tasks, new Set());

    // Day 1: 1 BUG_FIX
    expect(deltas[0].unplanned.byReason).toEqual({ BUG_FIX: 1 });
    // Day 2: 2 BUG_FIX (cumulative)
    expect(deltas[1].unplanned.byReason).toEqual({ BUG_FIX: 2 });
    // Day 3: 2 BUG_FIX + 1 ESCALATION
    expect(deltas[2].unplanned.byReason).toEqual({ BUG_FIX: 2, ESCALATION: 1 });
  });
});

// ============================================================
// 10. INTEGRATION: FULL REPORT FLOW (pure function path)
// ============================================================

describe("Integration: full ledger flow (pure functions)", () => {
  it("end-to-end: sprint with planning, commitment, and mid-sprint additions", () => {
    // Simulate a sprint lifecycle using only pure functions

    // Step 1: Initial commitment (3 tasks)
    const initialSnapshots: TaskSnapshot[] = [
      makeSnapshot({ taskId: "t1", title: "Feature A", priority: "P1" }),
      makeSnapshot({ taskId: "t2", title: "Feature B", priority: "P2" }),
      makeSnapshot({ taskId: "t3", title: "Feature C", priority: "P2" }),
    ];

    // Step 2: Mid-sprint re-commitment (added t4, removed t3)
    const midSprintSnapshots: TaskSnapshot[] = [
      makeSnapshot({ taskId: "t1", title: "Feature A", priority: "P1" }),
      makeSnapshot({ taskId: "t2", title: "Feature B", priority: "P2" }),
      makeSnapshot({ taskId: "t4", title: "Emergency Bug", priority: "P0" }),
    ];

    // Build change log
    const changeLog = buildCommitmentChangeLog("sprint-1", [
      {
        id: "snap-1",
        snapshotAt: "2026-02-01T10:00:00Z",
        createdBy: "user-1",
        taskSnapshots: initialSnapshots,
      },
      {
        id: "snap-2",
        snapshotAt: "2026-02-05T14:00:00Z",
        createdBy: "user-2",
        taskSnapshots: midSprintSnapshots,
      },
    ]);

    expect(changeLog.totalSnapshots).toBe(2);
    expect(changeLog.initialCommittedCount).toBe(3);
    expect(changeLog.currentCommittedCount).toBe(3);
    expect(changeLog.netChange).toBe(0);
    expect(computeCommitmentDrift(changeLog)).toBe(0);

    // Verify second snapshot changes
    const snap2Changes = changeLog.entries[1].changes;
    expect(snap2Changes).toHaveLength(2);
    expect(snap2Changes.find((c) => c.type === "ADDED")?.taskId).toBe("t4");
    expect(snap2Changes.find((c) => c.type === "REMOVED")?.taskId).toBe("t3");

    // Step 3: Categorize current tasks
    const currentTasks: SprintTask[] = [
      makeTask({ id: "t1", title: "Feature A", status: "DONE" }),
      makeTask({ id: "t2", title: "Feature B", status: "ACTIVE" }),
      makeTask({
        id: "t4",
        title: "Emergency Bug",
        status: "DONE",
        unplanned: true,
        unplannedReason: "BUG_FIX",
        addedBy: "user-2",
        createdAt: new Date("2026-02-05T14:00:00Z"),
      }),
      makeTask({
        id: "t5",
        title: "Customer escalation",
        unplanned: true,
        unplannedReason: "CUSTOMER_REQUEST",
        addedBy: "user-3",
        createdAt: new Date("2026-02-08T09:00:00Z"),
      }),
    ];

    // Use initial commitment for categorization
    const committedTaskIds = new Set(initialSnapshots.map((s) => s.taskId));
    const { planned, unplanned } = categorizeTasks(currentTasks, committedTaskIds);

    expect(planned).toHaveLength(2); // t1, t2
    expect(unplanned).toHaveLength(2); // t4 (not in initial commitment), t5

    // Step 4: Summarize throughput
    const summary = summarizeThroughput(planned, unplanned);

    expect(summary.totalPlanned).toBe(2);
    expect(summary.plannedDone).toBe(1);
    expect(summary.totalUnplanned).toBe(2);
    expect(summary.unplannedDone).toBe(1);
    expect(summary.unplannedByReason).toEqual({
      BUG_FIX: 1,
      CUSTOMER_REQUEST: 1,
    });

    // Step 5: Verify unplanned ratio
    expect(computeUnplannedRatio(summary)).toBe(0.5);
  });
});
