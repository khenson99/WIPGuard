import { describe, expect, it, vi } from "vitest";
import { IntegrationProvider } from "@/generated/prisma/client";
import {
  buildCompanyGoalsDashboard,
  type CompanyGoalsPrisma,
} from "@/lib/imladris/company-goals";

const CONTEXT = {
  userId: "user_1",
  organizationId: "org_1",
};

function projectRecord(input: {
  id: string;
  name: string;
  state: string;
  targetDate?: string | null;
  updatedAt?: string;
  completedAt?: string | null;
  issues?: Array<Record<string, unknown>>;
  userId?: string | null;
  organizationId?: string | null;
  scopeKey?: string | null;
}) {
  const issues = input.issues ?? [];
  const nonArchivedIssues = issues.filter((issue) => !issue.archivedAt);
  const completedIssueCount = nonArchivedIssues.filter((issue) => {
    const state = issue.state as Record<string, unknown> | undefined;
    return issue.completedAt || state?.type === "completed";
  }).length;
  const totalIssueCount = nonArchivedIssues.length;

  return {
    id: `raw_${input.id}`,
    provider: IntegrationProvider.LINEAR,
    objectType: "project",
    externalId: `linear:project:${input.id}`,
    scopeKey: input.scopeKey ?? "org:org_1",
    sourceCreatedAt: new Date("2026-05-01T00:00:00.000Z"),
    sourceUpdatedAt: new Date(input.updatedAt ?? "2026-05-31T00:00:00.000Z"),
    occurredAt: new Date(input.updatedAt ?? "2026-05-31T00:00:00.000Z"),
    payload: {
      id: input.id,
      name: input.name,
      state: input.state,
      url: `https://linear.app/acme/project/${input.id}`,
      targetDate: input.targetDate ?? null,
      updatedAt: input.updatedAt ?? "2026-05-31T00:00:00.000Z",
      completedAt: input.completedAt ?? null,
      lead: { id: "lead_1", name: "Ada Lovelace", email: "ada@example.com" },
      teams: [{ id: "team_1", key: "ENG", name: "Engineering" }],
      issues,
      completedIssueCount,
      totalIssueCount,
      progressPct: totalIssueCount === 0 ? 0 : Math.round((completedIssueCount / totalIssueCount) * 10000) / 100,
      warnings: totalIssueCount === 0 ? ["No linked issues."] : [],
    },
    userId: input.userId ?? "user_1",
    organizationId: input.organizationId ?? "org_1",
    createdAt: new Date("2026-06-01T11:55:00.000Z"),
    updatedAt: new Date("2026-06-01T12:00:00.000Z"),
  };
}

function prismaMock(rawRecords: unknown[]) {
  return {
    imladrisRawSourceRecord: {
      findMany: vi.fn(async () => rawRecords),
    },
  };
}

describe("buildCompanyGoalsDashboard", () => {
  it("builds active Linear project goals with summary counts and attention flags", async () => {
    const prisma = prismaMock([
      projectRecord({
        id: "project_1",
        name: "Launch self-serve onboarding",
        state: "started",
        targetDate: "2026-06-30",
        issues: [
          {
            id: "issue_1",
            identifier: "ENG-1",
            title: "Design onboarding checklist",
            completedAt: "2026-05-20T00:00:00.000Z",
            archivedAt: null,
            state: { type: "completed", name: "Done" },
          },
          {
            id: "issue_2",
            identifier: "ENG-2",
            title: "Instrument activation event",
            completedAt: null,
            archivedAt: null,
            state: { type: "started", name: "In Progress" },
          },
        ],
      }),
      projectRecord({
        id: "project_2",
        name: "Repair billing lifecycle",
        state: "started",
        targetDate: "2026-05-15",
        updatedAt: "2026-05-01T00:00:00.000Z",
        issues: [
          {
            id: "issue_3",
            identifier: "ENG-3",
            title: "Fix retry receipt",
            completedAt: null,
            archivedAt: null,
            state: { type: "blocked", name: "Blocked" },
          },
        ],
      }),
      projectRecord({
        id: "project_3",
        name: "Recently completed reporting",
        state: "completed",
        targetDate: "2026-05-20",
        completedAt: "2026-05-22T00:00:00.000Z",
        issues: [
          {
            id: "issue_4",
            identifier: "ENG-4",
            title: "Publish report",
            completedAt: "2026-05-21T00:00:00.000Z",
            archivedAt: null,
            state: { type: "completed", name: "Done" },
          },
        ],
      }),
      projectRecord({
        id: "project_4",
        name: "Canceled migration",
        state: "canceled",
      }),
    ]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        provider: IntegrationProvider.LINEAR,
        objectType: { in: expect.arrayContaining(["project"]) },
      }),
    }));
    expect(dashboard.summary).toEqual({
      totalActiveGoals: 2,
      onTrackGoals: 1,
      atRiskGoals: 1,
      completedRecently: 1,
      latestSyncAt: "2026-06-01T12:00:00.000Z",
    });
    expect(dashboard.goals).toEqual([
      expect.objectContaining({
        id: "project_1",
        name: "Launch self-serve onboarding",
        status: "on_track",
        progressPct: 50,
        completedIssueCount: 1,
        totalIssueCount: 2,
        blockedIssueCount: 0,
      }),
      expect.objectContaining({
        id: "project_2",
        name: "Repair billing lifecycle",
        status: "at_risk",
        progressPct: 0,
        blockedIssueCount: 1,
        warnings: expect.arrayContaining([
          "Target date has passed.",
          "No Linear activity in the last 14 days.",
          "1 blocked issue.",
        ]),
      }),
      expect.objectContaining({
        id: "project_3",
        state: "completed",
        status: "completed",
        progressPct: 100,
      }),
    ]);
    expect(dashboard.goals).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "project_4" }),
    ]));
  });

  it("returns an empty dashboard when no Linear project records have synced", async () => {
    const prisma = prismaMock([]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.summary).toEqual({
      totalActiveGoals: 0,
      onTrackGoals: 0,
      atRiskGoals: 0,
      completedRecently: 0,
      latestSyncAt: null,
    });
    expect(dashboard.goals).toEqual([]);
    expect(dashboard.emptyState).toEqual({
      title: "No Linear goals synced",
      description: "Connect Linear in Settings > Integrations or run the Linear sync to populate company goals.",
    });
  });

  it("loads legacy mixed-case Linear project object types", async () => {
    const prisma = prismaMock([
      {
        ...projectRecord({
          id: "legacy_project",
          name: "Legacy mixed-case project",
          state: "started",
          issues: [
            {
              id: "issue_legacy",
              completedAt: null,
              archivedAt: null,
              state: { type: "started", name: "In Progress" },
            },
          ],
        }),
        objectType: "Project",
      },
    ]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        objectType: { in: expect.arrayContaining(["project", "Project"]) },
      }),
    }));
    expect(dashboard.goals).toEqual([
      expect.objectContaining({
        id: "legacy_project",
        name: "Legacy mixed-case project",
      }),
    ]);
  });

  it("prefers the most specific Linear project row when duplicate scopes exist", async () => {
    const prisma = prismaMock([
      projectRecord({
        id: "project_1",
        name: "Global fallback launch plan",
        state: "started",
        updatedAt: "2026-05-01T00:00:00.000Z",
        userId: null,
        organizationId: null,
        scopeKey: "global",
        issues: [
          {
            id: "issue_1",
            completedAt: null,
            archivedAt: null,
            state: { type: "started", name: "In Progress" },
          },
        ],
      }),
      projectRecord({
        id: "project_1",
        name: "Organization launch plan",
        state: "started",
        updatedAt: "2026-05-31T00:00:00.000Z",
        userId: null,
        organizationId: "org_1",
        scopeKey: "org:org_1",
        issues: [
          {
            id: "issue_2",
            completedAt: "2026-05-30T00:00:00.000Z",
            archivedAt: null,
            state: { type: "completed", name: "Done" },
          },
          {
            id: "issue_3",
            completedAt: null,
            archivedAt: null,
            state: { type: "started", name: "In Progress" },
          },
        ],
      }),
    ]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.summary.totalActiveGoals).toBe(1);
    expect(dashboard.goals).toEqual([
      expect.objectContaining({
        id: "project_1",
        name: "Organization launch plan",
        progressPct: 50,
      }),
    ]);
  });

  it("ignores future duplicate Linear revisions when choosing current project state", async () => {
    const prisma = prismaMock([
      projectRecord({
        id: "project_1",
        name: "Current launch plan",
        state: "started",
        updatedAt: "2026-05-31T00:00:00.000Z",
        issues: [
          {
            id: "issue_1",
            completedAt: "2026-05-30T00:00:00.000Z",
            archivedAt: null,
            state: { type: "completed", name: "Done" },
          },
          {
            id: "issue_2",
            completedAt: null,
            archivedAt: null,
            state: { type: "started", name: "In Progress" },
          },
        ],
      }),
      projectRecord({
        id: "project_1",
        name: "Future skew launch plan",
        state: "started",
        updatedAt: "2099-01-01T00:00:00.000Z",
        issues: [
          {
            id: "issue_future",
            completedAt: null,
            archivedAt: null,
            state: { type: "started", name: "In Progress" },
          },
        ],
      }),
    ]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.goals).toEqual([
      expect.objectContaining({
        id: "project_1",
        name: "Current launch plan",
        progressPct: 50,
        updatedAt: "2026-05-31T00:00:00.000Z",
      }),
    ]);
  });

  it("ignores Linear project rows with incompatible scope keys", async () => {
    const prisma = prismaMock([
      projectRecord({
        id: "project_wrong_scope",
        name: "Wrong scope project",
        state: "started",
        userId: "user_1",
        organizationId: "org_1",
        scopeKey: "org:other_org",
        issues: [
          {
            id: "issue_1",
            completedAt: null,
            archivedAt: null,
            state: { type: "started", name: "In Progress" },
          },
        ],
      }),
      projectRecord({
        id: "project_valid",
        name: "Valid scope project",
        state: "started",
        userId: null,
        organizationId: "org_1",
        scopeKey: "org:org_1",
        issues: [
          {
            id: "issue_2",
            completedAt: null,
            archivedAt: null,
            state: { type: "started", name: "In Progress" },
          },
        ],
      }),
    ]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.goals).toEqual([
      expect.objectContaining({
        id: "project_valid",
        name: "Valid scope project",
      }),
    ]);
  });

  it("normalizes numeric Linear timestamps before stale goal checks", async () => {
    const numericUpdatedAt = 1_764_633_600;
    const prisma = prismaMock([
      {
        ...projectRecord({
          id: "project_1",
          name: "Numeric timestamp project",
          state: "started",
          updatedAt: "2025-12-02T00:00:00.000Z",
          issues: [
            {
              id: "issue_1",
              completedAt: null,
              archivedAt: null,
              state: { type: "started", name: "In Progress" },
            },
          ],
        }),
        sourceUpdatedAt: numericUpdatedAt,
        updatedAt: numericUpdatedAt,
        payload: {
          id: "project_1",
          name: "Numeric timestamp project",
          state: "started",
          updatedAt: numericUpdatedAt,
          issues: [
            {
              id: "issue_1",
              completedAt: null,
              archivedAt: null,
              state: { type: "started", name: "In Progress" },
            },
          ],
        },
      },
    ]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.summary.latestSyncAt).toBe("2025-12-02T00:00:00.000Z");
    expect(dashboard.goals[0]?.updatedAt).toBe("2025-12-02T00:00:00.000Z");
    expect(dashboard.goals[0]?.warnings).toContain("No Linear activity in the last 14 days.");
  });

  it("flags malformed Linear target dates instead of presenting them as on-track", async () => {
    const prisma = prismaMock([
      projectRecord({
        id: "project_bad_target_date",
        name: "Project with malformed target date",
        state: "started",
        targetDate: "soon-ish",
        updatedAt: "2026-05-31T00:00:00.000Z",
        issues: [
          {
            id: "issue_1",
            completedAt: null,
            archivedAt: null,
            state: { type: "started", name: "In Progress" },
          },
        ],
      }),
    ]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.summary).toMatchObject({
      totalActiveGoals: 1,
      onTrackGoals: 0,
      atRiskGoals: 1,
    });
    expect(dashboard.goals).toEqual([
      expect.objectContaining({
        id: "project_bad_target_date",
        targetDate: null,
        status: "at_risk",
        warnings: expect.arrayContaining(["Target date is invalid."]),
      }),
    ]);
  });

  it("clamps malformed aggregate Linear issue counts before calculating progress", async () => {
    const prisma = prismaMock([
      {
        ...projectRecord({
          id: "project_bad_counts",
          name: "Project with bad aggregate counts",
          state: "started",
          updatedAt: "2026-05-31T00:00:00.000Z",
          issues: [],
        }),
        payload: {
          id: "project_bad_counts",
          name: "Project with bad aggregate counts",
          state: "started",
          updatedAt: "2026-05-31T00:00:00.000Z",
          totalIssueCount: 2,
          completedIssueCount: 5,
          blockedIssueCount: 4,
        },
      },
    ]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.goals).toEqual([
      expect.objectContaining({
        id: "project_bad_counts",
        totalIssueCount: 2,
        completedIssueCount: 2,
        blockedIssueCount: 2,
        progressPct: 100,
      }),
    ]);
  });

  it("ignores future issue completion timestamps before calculating project progress", async () => {
    const prisma = prismaMock([
      projectRecord({
        id: "project_future_issue_completion",
        name: "Project with future issue completion",
        state: "started",
        updatedAt: "2026-05-31T00:00:00.000Z",
        issues: [
          {
            id: "issue_1",
            completedAt: "2099-01-01T00:00:00.000Z",
            archivedAt: null,
            state: { type: "started", name: "In Progress" },
          },
        ],
      }),
    ]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.goals).toEqual([
      expect.objectContaining({
        id: "project_future_issue_completion",
        completedIssueCount: 0,
        totalIssueCount: 1,
        progressPct: 0,
        status: "on_track",
      }),
    ]);
  });

  it("ignores future raw timestamps when reporting latest Linear sync time", async () => {
    const prisma = prismaMock([
      projectRecord({
        id: "project_current_sync",
        name: "Current sync project",
        state: "started",
        updatedAt: "2026-05-31T00:00:00.000Z",
        issues: [
          {
            id: "issue_1",
            completedAt: null,
            archivedAt: null,
            state: { type: "started", name: "In Progress" },
          },
        ],
      }),
      {
        ...projectRecord({
          id: "project_future_skew",
          name: "Future skew project",
          state: "started",
          updatedAt: "2099-01-01T00:00:00.000Z",
          issues: [
            {
              id: "issue_2",
              completedAt: null,
              archivedAt: null,
              state: { type: "started", name: "In Progress" },
            },
          ],
        }),
        updatedAt: new Date("2099-01-01T00:00:00.000Z"),
      },
    ]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.summary.latestSyncAt).toBe("2026-06-01T12:00:00.000Z");
  });

  it("uses raw record timestamps when deciding whether completed Linear projects are recent", async () => {
    const prisma = prismaMock([
      {
        ...projectRecord({
          id: "project_recent_complete",
          name: "Recently shipped without payload dates",
          state: "completed",
          updatedAt: "2026-05-31T00:00:00.000Z",
          completedAt: null,
          issues: [
            {
              id: "issue_1",
              completedAt: "2026-05-30T00:00:00.000Z",
              archivedAt: null,
              state: { type: "completed", name: "Done" },
            },
          ],
        }),
        sourceUpdatedAt: new Date("2026-05-31T00:00:00.000Z"),
        payload: {
          id: "project_recent_complete",
          name: "Recently shipped without payload dates",
          state: "completed",
          issues: [
            {
              id: "issue_1",
              completedAt: "2026-05-30T00:00:00.000Z",
              archivedAt: null,
              state: { type: "completed", name: "Done" },
            },
          ],
        },
      },
    ]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.summary.completedRecently).toBe(1);
    expect(dashboard.goals).toEqual([
      expect.objectContaining({
        id: "project_recent_complete",
        status: "completed",
      }),
    ]);
  });

  it("does not let future completed timestamps make old Linear projects look recently completed", async () => {
    const prisma = prismaMock([
      projectRecord({
        id: "project_future_complete",
        name: "Future completed project",
        state: "completed",
        updatedAt: "2025-01-01T00:00:00.000Z",
        completedAt: "2099-01-01T00:00:00.000Z",
        issues: [
          {
            id: "issue_1",
            completedAt: "2025-01-01T00:00:00.000Z",
            archivedAt: null,
            state: { type: "completed", name: "Done" },
          },
        ],
      }),
    ]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.summary.completedRecently).toBe(0);
    expect(dashboard.goals).toEqual([]);
  });

  it("uses raw record timestamps when stale active Linear projects lack payload dates", async () => {
    const prisma = prismaMock([
      {
        ...projectRecord({
          id: "project_stale_without_payload_dates",
          name: "Stale project without payload dates",
          state: "started",
          updatedAt: "2026-05-01T00:00:00.000Z",
          issues: [
            {
              id: "issue_1",
              completedAt: null,
              archivedAt: null,
              state: { type: "started", name: "In Progress" },
            },
          ],
        }),
        sourceUpdatedAt: new Date("2026-05-01T00:00:00.000Z"),
        payload: {
          id: "project_stale_without_payload_dates",
          name: "Stale project without payload dates",
          state: "started",
          issues: [
            {
              id: "issue_1",
              completedAt: null,
              archivedAt: null,
              state: { type: "started", name: "In Progress" },
            },
          ],
        },
      },
    ]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.goals[0]?.warnings).toContain("No Linear activity in the last 14 days.");
    expect(dashboard.goals[0]?.status).toBe("at_risk");
  });

  it("ignores future Linear update timestamps when checking stale active projects", async () => {
    const prisma = prismaMock([
      {
        ...projectRecord({
          id: "project_future_payload_update",
          name: "Future payload update project",
          state: "started",
          updatedAt: "2099-01-01T00:00:00.000Z",
          issues: [
            {
              id: "issue_1",
              completedAt: null,
              archivedAt: null,
              state: { type: "started", name: "In Progress" },
            },
          ],
        }),
        sourceUpdatedAt: new Date("2026-05-01T00:00:00.000Z"),
      },
    ]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.goals[0]?.warnings).toContain("No Linear activity in the last 14 days.");
    expect(dashboard.goals[0]?.status).toBe("at_risk");
  });
});
