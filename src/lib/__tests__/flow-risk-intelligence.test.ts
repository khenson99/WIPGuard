import { describe, expect, it } from "vitest";
import type { TaskStatus } from "@/generated/prisma/client";
import { __private__, defaultFlowRiskConfig } from "@/lib/flow/risk-intelligence";

function makeTask(input: {
  id: string;
  status?: TaskStatus;
  dueDate?: Date | null;
  updatedAt?: Date;
  responsible?: Array<{ id: string; name: string | null; email: string }>;
  dependsOn?: Array<{
    id: string;
    title: string;
    status: TaskStatus;
    dueDate: Date | null;
    updatedAt: Date;
  }>;
}) {
  return {
    id: input.id,
    title: `Task ${input.id}`,
    status: input.status ?? "ACTIVE",
    dueDate: input.dueDate ?? null,
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    updatedAt: input.updatedAt ?? new Date("2026-02-10T00:00:00.000Z"),
    project: { id: "p1", name: "Project A" },
    responsible: input.responsible ?? [],
    dependsOn: input.dependsOn ?? [],
    dependedBy: [],
  };
}

describe("flow-risk-intelligence helpers", () => {
  it("normalizes config overrides within supported ranges", () => {
    const normalized = __private__.normalizeFlowRiskConfig({
      personWipLimit: 99,
      staleTaskDays: 0,
      riskAlertMinScore: 4,
      maxRecommendations: 1000,
    });

    expect(normalized.personWipLimit).toBe(12);
    expect(normalized.staleTaskDays).toBe(1);
    expect(normalized.riskAlertMinScore).toBe(10);
    expect(normalized.maxRecommendations).toBe(30);
  });

  it("computes person WIP pressure and overload state", () => {
    const owner = { id: "u1", name: "Alex", email: "alex@example.com" };
    const report = __private__.computePersonWipPressure({
      tasks: [
        makeTask({ id: "t1", status: "ACTIVE", responsible: [owner] }),
        makeTask({ id: "t2", status: "NOT_DONE", responsible: [owner] }),
      ],
      config: { ...defaultFlowRiskConfig(), personWipLimit: 1 },
    });

    expect(report).toHaveLength(1);
    expect(report[0].activeTaskCount).toBe(2);
    expect(report[0].pressureRatio).toBe(2);
    expect(report[0].overloaded).toBe(true);
  });

  it("detects chronic blocker patterns from repeated NOT_DONE transitions", () => {
    const report = __private__.computeChronicBlockers({
      tasks: [makeTask({ id: "t1", status: "NOT_DONE" }), makeTask({ id: "t2", status: "ACTIVE" })],
      blockerEvents: [
        { taskId: "t1", toStatus: "NOT_DONE" as TaskStatus, changedAt: new Date("2026-02-10T00:00:00.000Z") },
        { taskId: "t1", toStatus: "NOT_DONE" as TaskStatus, changedAt: new Date("2026-02-11T00:00:00.000Z") },
      ],
      config: { ...defaultFlowRiskConfig(), chronicBlockerThreshold: 2, blockerLookbackDays: 14 },
    });

    expect(report).toHaveLength(1);
    expect(report[0].taskId).toBe("t1");
    expect(report[0].blockerTransitions).toBe(2);
  });

  it("produces explainable fixed-date alerts and recommendation feed", () => {
    const now = new Date("2026-02-15T00:00:00.000Z");
    const tasks = [
      makeTask({
        id: "t-risk",
        status: "QUEUED",
        dueDate: new Date("2026-02-16T00:00:00.000Z"),
        updatedAt: new Date("2026-02-05T00:00:00.000Z"),
        responsible: [{ id: "u1", name: "Alex", email: "alex@example.com" }],
      }),
    ];

    const personPressure = [
      {
        userId: "u1",
        name: "Alex",
        email: "alex@example.com",
        activeTaskCount: 3,
        wipLimit: 2,
        pressureRatio: 1.5,
        pressureScore: 150,
        overloaded: true,
        topTaskIds: ["t-risk"],
      },
    ];

    const staleDependencies = [
      {
        taskId: "t-risk",
        title: "Task t-risk",
        projectId: "p1",
        projectName: "Project A",
        blockedByTaskIds: ["dep-1"],
        staleDependencyCount: 1,
        maxDependencyStaleDays: 9,
        urgencyScore: 75,
        reasons: ["1 dependency task is stale."],
      },
    ];

    const alerts = __private__.computeFixedDateAlerts({
      tasks,
      asOf: now,
      config: {
        ...defaultFlowRiskConfig(),
        fixedDateLookaheadDays: 7,
        riskAlertMinScore: 30,
      },
      personPressure,
      staleDependencies,
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].taskId).toBe("t-risk");
    expect(alerts[0].riskScore).toBeGreaterThanOrEqual(30);
    expect(alerts[0].reasons.length).toBeGreaterThan(0);

    const recommendations = __private__.buildRecommendations({
      personPressure,
      chronicBlockers: [],
      staleDependencies,
      fixedDateAlerts: alerts,
      config: defaultFlowRiskConfig(),
    });

    expect(recommendations.some((item) => item.type === "descope_owner_wip")).toBe(true);
    expect(recommendations.some((item) => item.type === "protect_fixed_date")).toBe(true);
  });
});
