import { describe, expect, it } from "vitest";
import type { TaskStatus } from "@/generated/prisma/client";
import { __private__ } from "@/lib/analytics/decision-dashboard";

function makeTask(input: {
  status?: TaskStatus;
  departmentName?: string | null;
  ownerIds?: string[];
  sponsorIds?: string[];
}) {
  return {
    id: "task-1",
    status: input.status ?? "ACTIVE",
    dueDate: null,
    completedOn: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    unplanned: false,
    addedBy: null,
    responsible: (input.ownerIds ?? []).map((id) => ({ id })),
    project: {
      department: input.departmentName ? { name: input.departmentName } : null,
      sponsor: (input.sponsorIds ?? []).map((id) => ({ id })),
    },
  };
}

describe("decision dashboard helpers", () => {
  it("normalizes config overrides", () => {
    const config = __private__.normalizeDecisionDashboardConfig({
      lookbackDays: 1,
      monthlyWindowMonths: 100,
      staleTaskDays: 0,
    });

    expect(config.lookbackDays).toBe(7);
    expect(config.monthlyWindowMonths).toBe(12);
    expect(config.staleTaskDays).toBe(1);
  });

  it("classifies cohorts by admin ownership and department", () => {
    const cohorts = __private__.cohortForTask({
      task: makeTask({
        ownerIds: ["u-admin"],
        departmentName: "Marketing",
      }),
      adminUserIds: new Set(["u-admin"]),
    });

    expect(cohorts.has("CEO")).toBe(true);
    expect(cohorts.has("MARKETING")).toBe(true);
  });

  it("builds monthly narrative annotations from flow deltas", () => {
    const narrative = __private__.buildMonthlyNarrative([
      {
        month: "2026-01",
        created: 12,
        completed: 8,
        netFlow: -4,
        overdueCarryover: 3,
        unplannedCompleted: 4,
      },
    ]);

    expect(narrative.length).toBeGreaterThan(0);
    expect(narrative.some((line) => line.includes("Intake exceeded completion"))).toBe(true);
    expect(narrative.some((line) => line.includes("overdue"))).toBe(true);
  });

  it("renders board-ready monthly export markdown", () => {
    const markdown = __private__.buildMonthlyMarkdown(
      [
        {
          month: "2026-01",
          created: 10,
          completed: 9,
          netFlow: -1,
          overdueCarryover: 2,
          unplannedCompleted: 3,
        },
      ],
      ["2026-01: Intake exceeded completion by 1."]
    );

    expect(markdown).toContain("| Month | Created | Completed |");
    expect(markdown).toContain("## Narrative Annotations");
    expect(markdown).toContain("2026-01: Intake exceeded completion by 1.");
  });
});
