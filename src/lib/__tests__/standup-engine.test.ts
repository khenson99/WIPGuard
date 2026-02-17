import { describe, expect, it } from "vitest";
import {
  groupTasksByOwner,
  identifyBlockers,
  generateCoachingPrompts,
  calculateStandupMetrics,
  formatStandupForSlack,
  DEFAULT_COACHING_CONFIG,
} from "@/lib/standup-engine";
import type {
  TaskSummary,
  TeamMember,
  OwnerGroup,
  CoachingConfig,
} from "@/lib/standup-engine";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const alice: TeamMember = { id: "u1", name: "Alice" };
const bob: TeamMember = { id: "u2", name: "Bob" };
const carol: TeamMember = { id: "u3", name: "Carol" };

const members: TeamMember[] = [alice, bob, carol];

function task(overrides: Partial<TaskSummary> & { id: string }): TaskSummary {
  return {
    title: `Task ${overrides.id}`,
    status: "in_progress",
    ownerId: "u1",
    priority: "medium",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// groupTasksByOwner
// ---------------------------------------------------------------------------

describe("groupTasksByOwner", () => {
  it("groups tasks by owner id", () => {
    const tasks = [
      task({ id: "t1", ownerId: "u1" }),
      task({ id: "t2", ownerId: "u2" }),
      task({ id: "t3", ownerId: "u1" }),
    ];
    const groups = groupTasksByOwner(tasks, members);
    const aliceGroup = groups.find((g) => g.member.id === "u1");
    expect(aliceGroup).toBeDefined();
    expect(aliceGroup!.tasks).toHaveLength(2);
  });

  it("returns members with blocked tasks first", () => {
    const tasks = [
      task({ id: "t1", ownerId: "u1", status: "in_progress" }),
      task({ id: "t2", ownerId: "u2", status: "blocked", blockedReason: "waiting on API" }),
    ];
    const groups = groupTasksByOwner(tasks, members);
    expect(groups[0].member.id).toBe("u2");
  });

  it("puts unassigned tasks under synthetic Unassigned member", () => {
    const tasks = [task({ id: "t1", ownerId: "" })];
    const groups = groupTasksByOwner(tasks, members);
    expect(groups[0].member.name).toBe("Unassigned");
  });

  it("counts in-progress and blocked separately", () => {
    const tasks = [
      task({ id: "t1", ownerId: "u1", status: "in_progress" }),
      task({ id: "t2", ownerId: "u1", status: "blocked" }),
      task({ id: "t3", ownerId: "u1", status: "done" }),
    ];
    const groups = groupTasksByOwner(tasks, members);
    const g = groups.find((g) => g.member.id === "u1")!;
    expect(g.inProgressCount).toBe(1);
    expect(g.blockedCount).toBe(1);
  });

  it("returns empty array when no tasks exist", () => {
    expect(groupTasksByOwner([], members)).toEqual([]);
  });

  it("handles unknown owner ids gracefully", () => {
    const tasks = [task({ id: "t1", ownerId: "unknown-user" })];
    const groups = groupTasksByOwner(tasks, members);
    expect(groups).toHaveLength(1);
    expect(groups[0].member.id).toBe("unknown-user");
  });

  it("sorts by in-progress count when blocked counts are equal", () => {
    const tasks = [
      task({ id: "t1", ownerId: "u1", status: "in_progress" }),
      task({ id: "t2", ownerId: "u1", status: "in_progress" }),
      task({ id: "t3", ownerId: "u2", status: "in_progress" }),
    ];
    const groups = groupTasksByOwner(tasks, members);
    expect(groups[0].member.id).toBe("u1"); // 2 in progress > 1
  });

  it("initialises each group action as started", () => {
    const tasks = [task({ id: "t1", ownerId: "u1" })];
    const groups = groupTasksByOwner(tasks, members);
    expect(groups.every((g) => g.action === "started")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// identifyBlockers
// ---------------------------------------------------------------------------

describe("identifyBlockers", () => {
  it("returns only blocked tasks", () => {
    const tasks = [
      task({ id: "t1", status: "in_progress" }),
      task({ id: "t2", status: "blocked", blockedReason: "waiting" }),
      task({ id: "t3", status: "done" }),
    ];
    const blockers = identifyBlockers(tasks);
    expect(blockers).toHaveLength(1);
    expect(blockers[0].id).toBe("t2");
  });

  it("returns empty array when nothing is blocked", () => {
    const tasks = [task({ id: "t1", status: "in_progress" })];
    expect(identifyBlockers(tasks)).toEqual([]);
  });

  it("returns multiple blocked tasks", () => {
    const tasks = [
      task({ id: "t1", status: "blocked" }),
      task({ id: "t2", status: "blocked" }),
    ];
    expect(identifyBlockers(tasks)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// generateCoachingPrompts
// ---------------------------------------------------------------------------

describe("generateCoachingPrompts", () => {
  const now = new Date("2026-02-16T10:00:00Z");

  it("warns when member WIP exceeds per-member limit", () => {
    const tasks = [
      task({ id: "t1", ownerId: "u1", status: "in_progress" }),
      task({ id: "t2", ownerId: "u1", status: "in_progress" }),
      task({ id: "t3", ownerId: "u1", status: "in_progress" }),
      task({ id: "t4", ownerId: "u1", status: "in_progress" }),
    ];
    const config: CoachingConfig = {
      ...DEFAULT_COACHING_CONFIG,
      wipLimits: { perMember: 3, team: 20 },
    };
    const prompts = generateCoachingPrompts(tasks, members, config, now);
    expect(prompts.some((p) => p.type === "wip_exceeded")).toBe(true);
  });

  it("emits critical when team WIP exceeds team limit", () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      task({ id: `t${i}`, ownerId: "u1", status: "in_progress" }),
    );
    const config: CoachingConfig = {
      ...DEFAULT_COACHING_CONFIG,
      wipLimits: { perMember: 10, team: 4 },
    };
    const prompts = generateCoachingPrompts(tasks, members, config, now);
    const teamPrompt = prompts.find((p) => p.type === "finish_first");
    expect(teamPrompt).toBeDefined();
    expect(teamPrompt!.severity).toBe("critical");
  });

  it("flags aging tasks over threshold", () => {
    const tasks = [
      task({
        id: "t1",
        ownerId: "u1",
        status: "in_progress",
        statusChangedAt: "2026-02-10T10:00:00Z",
      }),
    ];
    const config: CoachingConfig = {
      ...DEFAULT_COACHING_CONFIG,
      agingThresholdDays: 5,
    };
    const prompts = generateCoachingPrompts(tasks, members, config, now);
    expect(prompts.some((p) => p.type === "aging_task")).toBe(true);
  });

  it("uses ageDays when provided instead of computing from date", () => {
    const tasks = [
      task({
        id: "t1",
        ownerId: "u1",
        status: "in_progress",
        ageDays: 10,
      }),
    ];
    const config: CoachingConfig = {
      ...DEFAULT_COACHING_CONFIG,
      agingThresholdDays: 5,
    };
    const prompts = generateCoachingPrompts(tasks, members, config, now);
    expect(prompts.some((p) => p.type === "aging_task")).toBe(true);
  });

  it("flags blockers stuck too long", () => {
    const tasks = [
      task({
        id: "t1",
        ownerId: "u1",
        status: "blocked",
        blockedReason: "waiting on vendor",
        statusChangedAt: "2026-02-13T10:00:00Z",
      }),
    ];
    const config: CoachingConfig = {
      ...DEFAULT_COACHING_CONFIG,
      blockedThresholdDays: 2,
    };
    const prompts = generateCoachingPrompts(tasks, members, config, now);
    const bp = prompts.find((p) => p.type === "blocked_too_long");
    expect(bp).toBeDefined();
    expect(bp!.severity).toBe("critical");
  });

  it("suggests defer actions for WIP exceeded", () => {
    const tasks = [
      task({ id: "t1", ownerId: "u1", status: "in_progress" }),
      task({ id: "t2", ownerId: "u1", status: "in_progress" }),
      task({ id: "t3", ownerId: "u1", status: "in_progress" }),
      task({ id: "t4", ownerId: "u1", status: "in_progress" }),
    ];
    const config: CoachingConfig = {
      ...DEFAULT_COACHING_CONFIG,
      wipLimits: { perMember: 3, team: 20 },
    };
    const prompts = generateCoachingPrompts(tasks, members, config, now);
    const wipPrompt = prompts.find((p) => p.type === "wip_exceeded");
    expect(wipPrompt!.suggestedActions.length).toBeGreaterThan(0);
    expect(wipPrompt!.suggestedActions[0].kind).toBe("defer");
  });

  it("suggests split and pair for aging tasks", () => {
    const tasks = [
      task({
        id: "t1",
        ownerId: "u1",
        status: "in_progress",
        ageDays: 10,
      }),
    ];
    const prompts = generateCoachingPrompts(tasks, members, DEFAULT_COACHING_CONFIG, now);
    const aging = prompts.find((p) => p.type === "aging_task");
    expect(aging!.suggestedActions.map((a) => a.kind)).toEqual(["split", "pair"]);
  });

  it("suggests unblock and drop for long-blocked tasks", () => {
    const tasks = [
      task({
        id: "t1",
        ownerId: "u1",
        status: "blocked",
        ageDays: 5,
      }),
    ];
    const prompts = generateCoachingPrompts(tasks, members, DEFAULT_COACHING_CONFIG, now);
    const bp = prompts.find((p) => p.type === "blocked_too_long");
    expect(bp!.suggestedActions.map((a) => a.kind)).toEqual(["unblock", "drop"]);
  });

  it("returns empty prompts when everything is within limits", () => {
    const tasks = [
      task({ id: "t1", ownerId: "u1", status: "in_progress" }),
    ];
    const prompts = generateCoachingPrompts(tasks, members, DEFAULT_COACHING_CONFIG, now);
    expect(prompts).toHaveLength(0);
  });

  it("sorts critical prompts before warnings", () => {
    const tasks = [
      // aging (warning)
      task({ id: "t1", ownerId: "u1", status: "in_progress", ageDays: 10 }),
      // blocked too long (critical)
      task({ id: "t2", ownerId: "u2", status: "blocked", ageDays: 5 }),
    ];
    const prompts = generateCoachingPrompts(tasks, members, DEFAULT_COACHING_CONFIG, now);
    expect(prompts.length).toBeGreaterThanOrEqual(2);
    expect(prompts[0].severity).toBe("critical");
  });

  it("handles tasks without statusChangedAt or ageDays", () => {
    const tasks = [
      task({ id: "t1", ownerId: "u1", status: "in_progress" }),
    ];
    const config: CoachingConfig = {
      ...DEFAULT_COACHING_CONFIG,
      agingThresholdDays: 0,
    };
    // ageDays=0, threshold=0 -> 0 >= 0 -> should flag
    const prompts = generateCoachingPrompts(tasks, members, config, now);
    expect(prompts.some((p) => p.type === "aging_task")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calculateStandupMetrics
// ---------------------------------------------------------------------------

describe("calculateStandupMetrics", () => {
  it("calculates total duration in seconds", () => {
    const metrics = calculateStandupMetrics({
      startTime: new Date("2026-02-16T09:00:00Z"),
      endTime: new Date("2026-02-16T09:15:00Z"),
      groups: [],
      coachingPromptsShown: 0,
    });
    expect(metrics.totalDurationSeconds).toBe(900);
  });

  it("computes average seconds per member", () => {
    const groups: OwnerGroup[] = [
      { member: alice, tasks: [], inProgressCount: 0, blockedCount: 0, action: "completed" },
      { member: bob, tasks: [], inProgressCount: 0, blockedCount: 0, action: "completed" },
    ];
    const metrics = calculateStandupMetrics({
      startTime: new Date("2026-02-16T09:00:00Z"),
      endTime: new Date("2026-02-16T09:10:00Z"),
      groups,
      coachingPromptsShown: 0,
    });
    expect(metrics.avgSecondsPerMember).toBe(300); // 600 / 2
  });

  it("sums blocker count across groups", () => {
    const groups: OwnerGroup[] = [
      { member: alice, tasks: [task({ id: "t1", status: "blocked" })], inProgressCount: 0, blockedCount: 1, action: "completed" },
      { member: bob, tasks: [task({ id: "t2", status: "blocked" })], inProgressCount: 0, blockedCount: 1, action: "completed" },
    ];
    const metrics = calculateStandupMetrics({
      startTime: new Date("2026-02-16T09:00:00Z"),
      endTime: new Date("2026-02-16T09:10:00Z"),
      groups,
      coachingPromptsShown: 3,
    });
    expect(metrics.blockerCount).toBe(2);
    expect(metrics.coachingPromptsShown).toBe(3);
  });

  it("counts total tasks discussed", () => {
    const groups: OwnerGroup[] = [
      { member: alice, tasks: [task({ id: "t1" }), task({ id: "t2" })], inProgressCount: 2, blockedCount: 0, action: "completed" },
      { member: bob, tasks: [task({ id: "t3" })], inProgressCount: 1, blockedCount: 0, action: "completed" },
    ];
    const metrics = calculateStandupMetrics({
      startTime: new Date("2026-02-16T09:00:00Z"),
      endTime: new Date("2026-02-16T09:05:00Z"),
      groups,
      coachingPromptsShown: 0,
    });
    expect(metrics.tasksDiscussed).toBe(3);
  });

  it("handles zero members without dividing by zero", () => {
    const metrics = calculateStandupMetrics({
      startTime: new Date("2026-02-16T09:00:00Z"),
      endTime: new Date("2026-02-16T09:10:00Z"),
      groups: [],
      coachingPromptsShown: 0,
    });
    expect(metrics.avgSecondsPerMember).toBe(0);
  });

  it("clamps negative duration to zero", () => {
    const metrics = calculateStandupMetrics({
      startTime: new Date("2026-02-16T09:10:00Z"),
      endTime: new Date("2026-02-16T09:00:00Z"),
      groups: [],
      coachingPromptsShown: 0,
    });
    expect(metrics.totalDurationSeconds).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// formatStandupForSlack
// ---------------------------------------------------------------------------

describe("formatStandupForSlack", () => {
  it("includes header and duration line", () => {
    const groups: OwnerGroup[] = [];
    const metrics = calculateStandupMetrics({
      startTime: new Date("2026-02-16T09:00:00Z"),
      endTime: new Date("2026-02-16T09:12:30Z"),
      groups,
      coachingPromptsShown: 0,
    });
    const text = formatStandupForSlack(groups, metrics, []);
    expect(text).toContain("Daily Standup Summary");
    expect(text).toContain("12m 30s");
  });

  it("lists member names with tasks", () => {
    const groups: OwnerGroup[] = [
      {
        member: alice,
        tasks: [task({ id: "t1", ownerId: "u1", title: "Fix auth bug" })],
        inProgressCount: 1,
        blockedCount: 0,
        action: "completed",
      },
    ];
    const metrics = calculateStandupMetrics({
      startTime: new Date("2026-02-16T09:00:00Z"),
      endTime: new Date("2026-02-16T09:05:00Z"),
      groups,
      coachingPromptsShown: 0,
    });
    const text = formatStandupForSlack(groups, metrics, []);
    expect(text).toContain("Alice");
    expect(text).toContain("Fix auth bug");
  });

  it("shows blocked tasks with reason", () => {
    const groups: OwnerGroup[] = [
      {
        member: bob,
        tasks: [
          task({
            id: "t1",
            ownerId: "u2",
            status: "blocked",
            title: "Deploy",
            blockedReason: "CI broken",
          }),
        ],
        inProgressCount: 0,
        blockedCount: 1,
        action: "completed",
      },
    ];
    const metrics = calculateStandupMetrics({
      startTime: new Date("2026-02-16T09:00:00Z"),
      endTime: new Date("2026-02-16T09:01:00Z"),
      groups,
      coachingPromptsShown: 0,
    });
    const text = formatStandupForSlack(groups, metrics, []);
    expect(text).toContain(":red_circle:");
    expect(text).toContain("CI broken");
  });

  it("appends coaching notes when prompts are present", () => {
    const prompts = [
      {
        type: "wip_exceeded" as const,
        severity: "warning" as const,
        message: "Alice has too many tasks",
        suggestedActions: [],
      },
    ];
    const text = formatStandupForSlack([], {
      totalDurationSeconds: 60,
      memberCount: 0,
      avgSecondsPerMember: 0,
      blockerCount: 0,
      tasksDiscussed: 0,
      coachingPromptsShown: 1,
    }, prompts);
    expect(text).toContain("Coaching Notes");
    expect(text).toContain("Alice has too many tasks");
  });

  it("uses correct emoji for skipped members", () => {
    const groups: OwnerGroup[] = [
      {
        member: carol,
        tasks: [],
        inProgressCount: 0,
        blockedCount: 0,
        action: "skipped",
      },
    ];
    const metrics = calculateStandupMetrics({
      startTime: new Date("2026-02-16T09:00:00Z"),
      endTime: new Date("2026-02-16T09:01:00Z"),
      groups,
      coachingPromptsShown: 0,
    });
    const text = formatStandupForSlack(groups, metrics, []);
    expect(text).toContain(":fast_forward:");
  });
});
