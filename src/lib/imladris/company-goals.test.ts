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

  it("unwraps scalar Linear project object type envelopes before goal analysis", async () => {
    const prisma = prismaMock([
      {
        ...projectRecord({
          id: "scalar_type_project",
          name: "Scalar object type project",
          state: "started",
          issues: [
            {
              id: "issue_scalar_type",
              completedAt: null,
              archivedAt: null,
              state: { type: "started", name: "In Progress" },
            },
          ],
        }),
        objectType: { value: "Project" },
      },
    ]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.goals).toEqual([
      expect.objectContaining({
        id: "scalar_type_project",
        name: "Scalar object type project",
      }),
    ]);
  });

  it("unwraps JSON API Linear project object type envelopes before goal analysis", async () => {
    const prisma = prismaMock([
      {
        ...projectRecord({
          id: "json_api_type_project",
          name: "JSON API object type project",
          state: "started",
          issues: [
            {
              id: "issue_json_api_type",
              completedAt: null,
              archivedAt: null,
              state: { type: "started", name: "In Progress" },
            },
          ],
        }),
        objectType: { data: { type: "Project" } },
      },
    ]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.goals).toEqual([
      expect.objectContaining({
        id: "json_api_type_project",
        name: "JSON API object type project",
      }),
    ]);
  });

  it("reads Linear project state objects before filtering visible goals", async () => {
    const project = projectRecord({
      id: "project_state_object",
      name: "Project with object state",
      state: "started",
      targetDate: "2026-06-30",
      issues: [
        {
          id: "issue_1",
          completedAt: null,
          archivedAt: null,
          state: { type: "started", name: "In Progress" },
        },
      ],
    });
    (project.payload as Record<string, unknown>).state = { type: "started", name: "Started" };
    const prisma = prismaMock([project]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.goals).toEqual([
      expect.objectContaining({
        id: "project_state_object",
        state: "started",
        totalIssueCount: 1,
      }),
    ]);
  });

  it("reads wrapped Linear project fields before goal analysis", async () => {
    const project = projectRecord({
      id: "project_wrapped_values",
      name: "Wrapped project",
      state: "started",
      updatedAt: "2026-05-31T00:00:00.000Z",
      issues: [],
    });
    (project as { payload: unknown }).payload = {
      values: {
        id: "project_wrapped_values",
        name: "Wrapped Linear launch",
        description: "Ship the wrapped payload parser.",
        url: "https://linear.app/acme/project/project_wrapped_values",
        state: { type: "started", name: "Started" },
        target_date: "2026-05-15",
        updated_at: "2026-05-01T00:00:00.000Z",
        lead: { id: "lead_2", name: "Grace Hopper" },
        teams: [{ id: "team_2", key: "DATA", name: "Data" }],
        total_issue_count: "4",
        completed_issue_count: "2",
        blocked_issue_count: "1",
      },
    };
    const prisma = prismaMock([project]);

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
        id: "project_wrapped_values",
        name: "Wrapped Linear launch",
        description: "Ship the wrapped payload parser.",
        state: "started",
        leadName: "Grace Hopper",
        teamLabels: ["DATA"],
        targetDate: "2026-05-15",
        updatedAt: "2026-05-01T00:00:00.000Z",
        totalIssueCount: 4,
        completedIssueCount: 2,
        blockedIssueCount: 1,
        progressPct: 50,
        warnings: expect.arrayContaining([
          "Target date has passed.",
          "No Linear activity in the last 14 days.",
          "1 blocked issue.",
        ]),
      }),
    ]);
  });

  it("unwraps scalar Linear project text field envelopes before goal analysis", async () => {
    const project = projectRecord({
      id: "project_scalar_text_envelopes",
      name: "Fallback wrapped project",
      state: "started",
      updatedAt: "2026-05-31T00:00:00.000Z",
      issues: [],
    });
    (project as { payload: unknown }).payload = {
      id: { data: { attributes: { value: "project_scalar_text_envelopes" } } },
      name: { value: "Scalar wrapped Linear launch" },
      description: { data: { value: "Ship scalar text parsing." } },
      url: { attributes: { value: "https://linear.app/acme/project/project_scalar_text_envelopes" } },
      state: { value: "started" },
      updatedAt: "2026-05-31T00:00:00.000Z",
      lead: { name: { value: "Margaret Hamilton" } },
      teams: [{ key: { value: "ENG" }, name: { value: "Engineering" } }],
      totalIssueCount: 2,
      completedIssueCount: 1,
      blockedIssueCount: 0,
    };
    const prisma = prismaMock([project]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.goals).toEqual([
      expect.objectContaining({
        id: "project_scalar_text_envelopes",
        name: "Scalar wrapped Linear launch",
        description: "Ship scalar text parsing.",
        url: "https://linear.app/acme/project/project_scalar_text_envelopes",
        state: "started",
        leadName: "Margaret Hamilton",
        teamLabels: ["ENG"],
        progressPct: 50,
      }),
    ]);
  });

  it("reads JSON:API data attribute Linear project fields before goal analysis", async () => {
    const project = projectRecord({
      id: "project_json_api",
      name: "JSON API project",
      state: "started",
      updatedAt: "2026-05-31T00:00:00.000Z",
      issues: [],
    });
    (project as { payload: unknown }).payload = {
      data: {
        type: "projects",
        id: "project_json_api",
        attributes: {
          name: "JSON API Linear launch",
          description: "Ship the JSON API payload parser.",
          url: "https://linear.app/acme/project/project_json_api",
          state: { type: "started", name: "Started" },
          target_date: "2026-05-15",
          updated_at: "2026-05-01T00:00:00.000Z",
          lead: { id: "lead_3", name: "Katherine Johnson" },
          teams: [{ id: "team_3", key: "OPS", name: "Operations" }],
          total_issue_count: "4",
          completed_issue_count: "2",
          blocked_issue_count: "1",
        },
      },
    };
    const prisma = prismaMock([project]);

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
        id: "project_json_api",
        name: "JSON API Linear launch",
        description: "Ship the JSON API payload parser.",
        state: "started",
        leadName: "Katherine Johnson",
        teamLabels: ["OPS"],
        targetDate: "2026-05-15",
        updatedAt: "2026-05-01T00:00:00.000Z",
        totalIssueCount: 4,
        completedIssueCount: 2,
        blockedIssueCount: 1,
        progressPct: 50,
        warnings: expect.arrayContaining([
          "Target date has passed.",
          "No Linear activity in the last 14 days.",
          "1 blocked issue.",
        ]),
      }),
    ]);
  });

  it("unwraps single-value JSON:API Linear project attributes before goal analysis", async () => {
    const project = projectRecord({
      id: "project_json_api_value",
      name: "JSON API value project",
      state: "started",
      updatedAt: "2026-05-31T00:00:00.000Z",
      issues: [],
    });
    (project as { payload: unknown }).payload = {
      data: {
        type: "projects",
        id: "project_json_api_value",
        attributes: {
          value: {
            name: "JSON API Value Linear launch",
            description: "Ship the JSON API value payload parser.",
            url: "https://linear.app/acme/project/project_json_api_value",
            state: { type: "started", name: "Started" },
            target_date: "2026-05-15",
            updated_at: "2026-05-01T00:00:00.000Z",
            lead: { id: "lead_4", name: "Dorothy Vaughan" },
            teams: [{ id: "team_4", key: "ENG", name: "Engineering" }],
            total_issue_count: "4",
            completed_issue_count: "2",
            blocked_issue_count: "1",
          },
        },
      },
    };
    const prisma = prismaMock([project]);

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
        id: "project_json_api_value",
        name: "JSON API Value Linear launch",
        description: "Ship the JSON API value payload parser.",
        state: "started",
        leadName: "Dorothy Vaughan",
        teamLabels: ["ENG"],
        targetDate: "2026-05-15",
        updatedAt: "2026-05-01T00:00:00.000Z",
        totalIssueCount: 4,
        completedIssueCount: 2,
        blockedIssueCount: 1,
        progressPct: 50,
        warnings: expect.arrayContaining([
          "Target date has passed.",
          "No Linear activity in the last 14 days.",
          "1 blocked issue.",
        ]),
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

  it("ignores wrong-provider project-shaped rows returned by the data layer", async () => {
    const prisma = prismaMock([
      {
        ...projectRecord({
          id: "project_valid",
          name: "Valid Linear launch plan",
          state: "started",
          issues: [
            {
              id: "issue_1",
              completedAt: null,
              archivedAt: null,
              state: { type: "started", name: "In Progress" },
            },
          ],
        }),
        provider: { value: "linear" },
      },
      {
        ...projectRecord({
          id: "hubspot_project_shape",
          name: "HubSpot deal cleanup",
          state: "started",
          issues: [
            {
              id: "issue_hubspot",
              completedAt: null,
              archivedAt: null,
              state: { type: "started", name: "In Progress" },
            },
          ],
        }),
        provider: IntegrationProvider.HUBSPOT,
      },
    ]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.summary.totalActiveGoals).toBe(1);
    expect(dashboard.goals).toEqual([
      expect.objectContaining({
        id: "project_valid",
        name: "Valid Linear launch plan",
      }),
    ]);
    expect(dashboard.goals).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "hubspot_project_shape" }),
    ]));
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

  it("unwraps provider date envelopes before goal freshness and issue completion analysis", async () => {
    const project = projectRecord({
      id: "project_date_envelopes",
      name: "Project with date envelopes",
      state: "started",
      targetDate: "2026-06-30",
      updatedAt: "2026-05-31T00:00:00.000Z",
      issues: [],
    });
    (project as { payload: unknown }).payload = {
      id: "project_date_envelopes",
      name: "Project with date envelopes",
      state: "started",
      targetDate: { data: { attributes: { value: "2026-05-15" } } },
      updatedAt: { value: "2026-05-01T00:00:00.000Z" },
      completedAt: null,
      issues: [
        {
          id: "issue_1",
          completedAt: { data: { attributes: { value: "2026-05-20T00:00:00.000Z" } } },
          archivedAt: null,
          state: { type: "started", name: "In Progress" },
        },
        {
          id: "issue_2",
          completedAt: null,
          archivedAt: null,
          state: { type: "started", name: "In Progress" },
        },
      ],
    };
    const prisma = prismaMock([project]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.goals).toEqual([
      expect.objectContaining({
        id: "project_date_envelopes",
        targetDate: "2026-05-15",
        updatedAt: "2026-05-01T00:00:00.000Z",
        completedIssueCount: 1,
        totalIssueCount: 2,
        progressPct: 50,
        status: "at_risk",
        warnings: expect.arrayContaining([
          "Target date has passed.",
          "No Linear activity in the last 14 days.",
        ]),
      }),
    ]);
  });

  it("unwraps provider warning envelopes before calculating company goal risk", async () => {
    const project = projectRecord({
      id: "project_warning_envelope",
      name: "Project with provider warning envelope",
      state: "started",
      targetDate: "2026-06-30",
      updatedAt: "2026-05-31T00:00:00.000Z",
      issues: [
        {
          id: "issue_1",
          completedAt: null,
          archivedAt: null,
          state: { type: "started", name: "In Progress" },
        },
      ],
    });
    const prisma = prismaMock([
      {
        ...project,
        payload: {
          ...(project.payload as Record<string, unknown>),
          warnings: {
            data: {
              attributes: {
                warnings: [" Linear import completed with warnings. ", "", 42],
                warning: "Linear import has unmapped fields.",
                error: { detail: "Linear project labels are stale." },
              },
            },
            messages: [{ message: "Linear project is missing an owner." }],
            error: { detail: "Linear milestone sync is stale." },
          },
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
        id: "project_warning_envelope",
        status: "at_risk",
        warnings: expect.arrayContaining([
          "Linear import completed with warnings.",
          "Linear import has unmapped fields.",
          "Linear project labels are stale.",
          "Linear project is missing an owner.",
          "Linear milestone sync is stale.",
        ]),
      }),
    ]);
  });

  it("unwraps direct data warning envelopes before calculating company goal risk", async () => {
    const project = projectRecord({
      id: "project_direct_data_warning_envelope",
      name: "Project with direct data warning envelope",
      state: "started",
      targetDate: "2026-06-30",
      updatedAt: "2026-05-31T00:00:00.000Z",
      issues: [
        {
          id: "issue_1",
          completedAt: null,
          archivedAt: null,
          state: { type: "started", name: "In Progress" },
        },
      ],
    });
    const prisma = prismaMock([
      {
        ...project,
        payload: {
          ...(project.payload as Record<string, unknown>),
          warnings: {
            data: {
              warning: " Linear import completed with warnings. ",
              error: { detail: "Linear milestone sync is stale." },
            },
          },
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
        id: "project_direct_data_warning_envelope",
        status: "at_risk",
        warnings: expect.arrayContaining([
          "Linear import completed with warnings.",
          "Linear milestone sync is stale.",
        ]),
      }),
    ]);
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

  it("reads snake_case aggregate Linear issue counts before calculating progress", async () => {
    const prisma = prismaMock([
      {
        ...projectRecord({
          id: "project_snake_counts",
          name: "Project with snake case aggregate counts",
          state: "started",
          updatedAt: "2026-05-31T00:00:00.000Z",
          issues: [],
        }),
        payload: {
          id: "project_snake_counts",
          name: "Project with snake case aggregate counts",
          state: "started",
          updated_at: "2026-05-31T00:00:00.000Z",
          total_issue_count: "4",
          completed_issue_count: "2",
          blocked_issue_count: "1",
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
        id: "project_snake_counts",
        totalIssueCount: 4,
        completedIssueCount: 2,
        blockedIssueCount: 1,
        progressPct: 50,
        warnings: expect.arrayContaining(["1 blocked issue."]),
      }),
    ]);
  });

  it("parses formatted aggregate Linear issue counts before calculating progress", async () => {
    const prisma = prismaMock([
      {
        ...projectRecord({
          id: "project_formatted_counts",
          name: "Project with formatted aggregate counts",
          state: "started",
          updatedAt: "2026-05-31T00:00:00.000Z",
          issues: [],
        }),
        payload: {
          id: "project_formatted_counts",
          name: "Project with formatted aggregate counts",
          state: "started",
          updatedAt: "2026-05-31T00:00:00.000Z",
          totalIssueCount: "1,250",
          completedIssueCount: "625",
          blockedIssueCount: "25",
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
        id: "project_formatted_counts",
        totalIssueCount: 1_250,
        completedIssueCount: 625,
        blockedIssueCount: 25,
        progressPct: 50,
      }),
    ]);
  });

  it("parses compact aggregate Linear issue counts before calculating progress", async () => {
    const prisma = prismaMock([
      {
        ...projectRecord({
          id: "project_compact_counts",
          name: "Project with compact aggregate counts",
          state: "started",
          updatedAt: "2026-05-31T00:00:00.000Z",
          issues: [],
        }),
        payload: {
          id: "project_compact_counts",
          name: "Project with compact aggregate counts",
          state: "started",
          updatedAt: "2026-05-31T00:00:00.000Z",
          totalIssueCount: "1.2k",
          completedIssueCount: "600",
          blockedIssueCount: "24",
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
        id: "project_compact_counts",
        totalIssueCount: 1_200,
        completedIssueCount: 600,
        blockedIssueCount: 24,
        progressPct: 50,
      }),
    ]);
  });

  it("unwraps provider aggregate Linear issue count envelopes before calculating progress", async () => {
    const prisma = prismaMock([
      {
        ...projectRecord({
          id: "project_wrapped_counts",
          name: "Project with wrapped aggregate counts",
          state: "started",
          updatedAt: "2026-05-31T00:00:00.000Z",
          issues: [],
        }),
        payload: {
          id: "project_wrapped_counts",
          name: "Project with wrapped aggregate counts",
          state: "started",
          updatedAt: "2026-05-31T00:00:00.000Z",
          totalIssueCount: { data: { attributes: { value: "1,250" } } },
          completedIssueCount: { metricValue: "625" },
          blockedIssueCount: { count: "25" },
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
        id: "project_wrapped_counts",
        totalIssueCount: 1_250,
        completedIssueCount: 625,
        blockedIssueCount: 25,
        progressPct: 50,
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

  it("does not treat string false Linear issue archive timestamps as archived", async () => {
    const prisma = prismaMock([
      projectRecord({
        id: "project_string_false_archive",
        name: "Project with string false issue archive timestamp",
        state: "started",
        updatedAt: "2026-05-31T00:00:00.000Z",
        issues: [
          {
            id: "issue_1",
            completedAt: null,
            archivedAt: "false",
            state: { type: "started", name: "In Progress" },
          },
          {
            id: "issue_2",
            completedAt: null,
            archivedAt: "2099-01-01T00:00:00.000Z",
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
        id: "project_string_false_archive",
        totalIssueCount: 2,
        completedIssueCount: 0,
        progressPct: 0,
      }),
    ]);
  });

  it("excludes Linear issues with explicit archived flags before calculating progress and risk", async () => {
    const prisma = prismaMock([
      projectRecord({
        id: "project_archived_flag",
        name: "Project with explicit archived issue flag",
        state: "started",
        updatedAt: "2026-05-31T00:00:00.000Z",
        issues: [
          {
            id: "issue_archived_flag",
            completedAt: null,
            archived: { value: true },
            state: "blocked",
          },
          {
            id: "issue_active",
            completedAt: null,
            archived: { value: false },
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
        id: "project_archived_flag",
        totalIssueCount: 1,
        completedIssueCount: 0,
        blockedIssueCount: 0,
        status: "on_track",
        warnings: [],
      }),
    ]);
  });

  it("reads Linear issue state names before calculating project progress", async () => {
    const prisma = prismaMock([
      projectRecord({
        id: "project_issue_state_name",
        name: "Project with completed issue state name",
        state: "started",
        updatedAt: "2026-05-31T00:00:00.000Z",
        issues: [
          {
            id: "issue_1",
            completedAt: null,
            archivedAt: null,
            state: { name: "Done" },
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
        id: "project_issue_state_name",
        totalIssueCount: 1,
        completedIssueCount: 1,
        progressPct: 100,
      }),
    ]);
  });

  it("reads Linear issue completion fields before calculating project progress", async () => {
    const prisma = prismaMock([
      projectRecord({
        id: "project_issue_completion_fields",
        name: "Project with explicit completion fields",
        state: "started",
        updatedAt: "2026-05-31T00:00:00.000Z",
        issues: [
          {
            id: "issue_completed_flag",
            completed: { value: true },
            archivedAt: null,
            state: { type: "started", name: "In Progress" },
          },
          {
            id: "issue_incomplete_flag",
            isCompleted: { value: false },
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
        id: "project_issue_completion_fields",
        totalIssueCount: 2,
        completedIssueCount: 1,
        progressPct: 50,
      }),
    ]);
  });

  it("reads Linear issue string states before calculating blocked project risk", async () => {
    const prisma = prismaMock([
      projectRecord({
        id: "project_issue_string_blocked",
        name: "Project with blocked issue string state",
        state: "started",
        updatedAt: "2026-05-31T00:00:00.000Z",
        issues: [
          {
            id: "issue_1",
            completedAt: null,
            archivedAt: null,
            state: "blocked",
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
        id: "project_issue_string_blocked",
        status: "at_risk",
        blockedIssueCount: 1,
        warnings: expect.arrayContaining(["1 blocked issue."]),
      }),
    ]);
  });

  it("reads Linear issue blocker fields before calculating blocked project risk", async () => {
    const prisma = prismaMock([
      projectRecord({
        id: "project_issue_blocker_fields",
        name: "Project with explicit blocker fields",
        state: "started",
        updatedAt: "2026-05-31T00:00:00.000Z",
        issues: [
          {
            id: "issue_boolean_blocked",
            completedAt: null,
            archivedAt: null,
            state: { type: "started", name: "In Progress" },
            blocked: { value: true },
          },
          {
            id: "issue_relation_blocked",
            completedAt: null,
            archivedAt: null,
            state: { type: "started", name: "In Progress" },
            relations: {
              blockedBy: [{ id: "issue_boolean_blocked" }],
            },
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
        id: "project_issue_blocker_fields",
        status: "at_risk",
        blockedIssueCount: 2,
        warnings: expect.arrayContaining(["2 blocked issues."]),
      }),
    ]);
  });

  it("reads wrapped Linear issue fields before calculating project progress and risk", async () => {
    const prisma = prismaMock([
      projectRecord({
        id: "project_wrapped_issues",
        name: "Project with wrapped issue fields",
        state: "started",
        updatedAt: "2026-05-31T00:00:00.000Z",
        issues: [
          {
            id: "issue_completed",
            values: {
              completed_at: "2026-05-30T00:00:00.000Z",
              state: { type: "completed", name: "Done" },
            },
          },
          {
            id: "issue_blocked",
            fields: {
              state: "blocked",
            },
          },
          {
            id: "issue_archived",
            attributes: {
              archived_at: "2026-05-01T00:00:00.000Z",
              state: { type: "started", name: "In Progress" },
            },
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
        id: "project_wrapped_issues",
        totalIssueCount: 2,
        completedIssueCount: 1,
        blockedIssueCount: 1,
        progressPct: 50,
        status: "at_risk",
        warnings: expect.arrayContaining(["1 blocked issue."]),
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

  it("falls back to source update time when Linear row update timestamps are future-skewed", async () => {
    const prisma = prismaMock([
      {
        ...projectRecord({
          id: "project_future_row_sync",
          name: "Future row sync project",
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
        sourceUpdatedAt: new Date("2026-06-01T11:30:00.000Z"),
        updatedAt: new Date("2099-01-01T00:00:00.000Z"),
      },
    ]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.summary.latestSyncAt).toBe("2026-06-01T11:30:00.000Z");
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

  it("does not expose future Linear update timestamps in company goal rows", async () => {
    const prisma = prismaMock([
      {
        ...projectRecord({
          id: "project_future_row_update",
          name: "Future row update project",
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
        sourceUpdatedAt: new Date("2026-05-31T00:00:00.000Z"),
      },
    ]);

    const dashboard = await buildCompanyGoalsDashboard({
      prisma: prisma as unknown as CompanyGoalsPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.goals).toEqual([
      expect.objectContaining({
        id: "project_future_row_update",
        updatedAt: "2026-05-31T00:00:00.000Z",
      }),
    ]);
  });

  it("does not expose future Linear completion timestamps in completed goal rows", async () => {
    const prisma = prismaMock([
      projectRecord({
        id: "project_future_row_completion",
        name: "Future row completion project",
        state: "completed",
        updatedAt: "2026-05-31T00:00:00.000Z",
        completedAt: "2099-01-01T00:00:00.000Z",
        issues: [
          {
            id: "issue_1",
            completedAt: "2026-05-30T00:00:00.000Z",
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

    expect(dashboard.goals).toEqual([
      expect.objectContaining({
        id: "project_future_row_completion",
        status: "completed",
        completedAt: null,
      }),
    ]);
  });
});
