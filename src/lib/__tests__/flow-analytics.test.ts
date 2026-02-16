import { describe, expect, it } from "vitest";
import type { TaskStatus } from "@/generated/prisma/client";
import { __private__ } from "@/lib/flow/analytics";

describe("flow analytics helpers", () => {
  it("computes percentiles and mean for duration stats", () => {
    const stats = __private__.durationStats([1, 2, 3, 4, 5]);

    expect(stats.sampleSize).toBe(5);
    expect(stats.mean).toBe(3);
    expect(stats.p50).toBe(3);
    expect(stats.p75).toBe(4);
    expect(stats.p90).toBe(4.6);
  });

  it("builds throughput buckets from DONE transitions", () => {
    const transitions = [
      {
        id: "a",
        taskId: "t1",
        fromStatus: "ACTIVE" as TaskStatus,
        toStatus: "DONE" as TaskStatus,
        changedAt: new Date("2026-02-10T12:00:00.000Z"),
      },
      {
        id: "b",
        taskId: "t2",
        fromStatus: "ACTIVE" as TaskStatus,
        toStatus: "DONE" as TaskStatus,
        changedAt: new Date("2026-02-10T18:00:00.000Z"),
      },
      {
        id: "c",
        taskId: "t3",
        fromStatus: "ACTIVE" as TaskStatus,
        toStatus: "NOT_DONE" as TaskStatus,
        changedAt: new Date("2026-02-11T18:00:00.000Z"),
      },
      {
        id: "d",
        taskId: "t4",
        fromStatus: "ACTIVE" as TaskStatus,
        toStatus: "DONE" as TaskStatus,
        changedAt: new Date("2026-02-12T00:00:00.000Z"),
      },
    ];

    const buckets = __private__.buildThroughputSeries({
      transitions,
      from: new Date("2026-02-10T00:00:00.000Z"),
      to: new Date("2026-02-11T23:59:59.000Z"),
      interval: "day",
    });

    expect(buckets).toHaveLength(2);
    expect(buckets[0].completed).toBe(2);
    expect(buckets[1].completed).toBe(0);
  });

  it("uses first transition fromStatus as initial CFD state", () => {
    const cfd = __private__.buildCfdSeries({
      tasks: [
        {
          id: "task-1",
          status: "DONE" as TaskStatus,
          createdAt: new Date("2026-02-10T00:00:00.000Z"),
          completedOn: null,
        },
      ],
      transitionsByTask: new Map([
        [
          "task-1",
          [
            {
              id: "tr-1",
              taskId: "task-1",
              fromStatus: "BACKLOG" as TaskStatus,
              toStatus: "ACTIVE" as TaskStatus,
              changedAt: new Date("2026-02-11T12:00:00.000Z"),
            },
          ],
        ],
      ]),
      from: new Date("2026-02-10T00:00:00.000Z"),
      to: new Date("2026-02-11T23:59:59.000Z"),
      interval: "day",
    });

    expect(cfd[0].counts.BACKLOG).toBe(1);
    expect(cfd[0].counts.ACTIVE).toBe(0);
    expect(cfd[1].counts.ACTIVE).toBe(1);
  });

  it("flags data quality issues and counts valid tasks by unique task id", () => {
    const report = __private__.evaluateDataQuality({
      tasks: [
        {
          id: "task-1",
          status: "DONE" as TaskStatus,
          createdAt: new Date("2026-02-10T00:00:00.000Z"),
          completedOn: null,
        },
        {
          id: "task-2",
          status: "ACTIVE" as TaskStatus,
          createdAt: new Date("2026-02-10T00:00:00.000Z"),
          completedOn: null,
        },
        {
          id: "task-3",
          status: "ACTIVE" as TaskStatus,
          createdAt: new Date("2026-02-10T00:00:00.000Z"),
          completedOn: null,
        },
      ],
      transitionsByTask: new Map([
        [
          "task-2",
          [
            {
              id: "tr-1",
              taskId: "task-2",
              fromStatus: "BACKLOG" as TaskStatus,
              toStatus: "ACTIVE" as TaskStatus,
              changedAt: new Date("2026-02-09T00:00:00.000Z"),
            },
          ],
        ],
        [
          "task-3",
          [
            {
              id: "tr-2",
              taskId: "task-3",
              fromStatus: "BACKLOG" as TaskStatus,
              toStatus: "ACTIVE" as TaskStatus,
              changedAt: new Date("2026-02-10T12:00:00.000Z"),
            },
          ],
        ],
      ]),
    });

    expect(report.checkedTaskCount).toBe(3);
    expect(report.issueCount).toBe(3);
    expect(report.validTaskCount).toBe(1);

    const missingHistory = report.issues.find((issue) => issue.issue === "missing_status_history");
    const missingDoneTransition = report.issues.find(
      (issue) => issue.issue === "done_without_done_transition"
    );
    const invalidTransitionOrder = report.issues.find(
      (issue) => issue.issue === "transition_before_task_created"
    );

    expect(missingHistory?.count).toBe(1);
    expect(missingDoneTransition?.count).toBe(1);
    expect(invalidTransitionOrder?.count).toBe(1);
    expect(report.issues.some((issue) => issue.issue === "missing_status_history")).toBe(true);
    expect(
      report.issues.some((issue) => issue.issue === "transition_before_task_created")
    ).toBe(true);
  });
});
