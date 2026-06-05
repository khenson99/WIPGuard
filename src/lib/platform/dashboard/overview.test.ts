import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AnalyticsSnapshotStatus,
  DealStage,
  IntegrationConnectionStatus,
} from "@/generated/prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: { count: vi.fn(), aggregate: vi.fn() },
    workflowDefinition: { count: vi.fn() },
    workflowApproval: { count: vi.fn() },
    automationRecommendation: { count: vi.fn() },
    workflowRun: { count: vi.fn() },
    integrationConnection: { findMany: vi.fn() },
    analyticsSnapshot: { groupBy: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("@/lib/integrations/ownership", () => ({
  resolveIntegrationOwnerUserId: vi.fn((userId: string) => `owner:${userId}`),
}));

vi.mock("@/lib/integrations/catalog", () => ({
  listIntegrationDefinitions: vi.fn(() => [
    { provider: "HUBSPOT" },
    { provider: "SLACK" },
    { provider: "GOOGLE_ANALYTICS" },
  ]),
}));

vi.mock("@/lib/analytics/provider-health", () => ({
  snapshotKeysForIntegrationProvider: vi.fn((provider: string) => {
    if (provider === "GOOGLE_ANALYTICS") return ["googleAnalytics"];
    if (provider === "HUBSPOT") return ["hubspot"];
    return ["slack"];
  }),
}));

vi.mock("@/lib/analytics/credentials", () => ({
  getCredentials: vi.fn(async () => ({ hubspotToken: "hubspot-token" })),
  hasIntegrationCredential: vi.fn((provider: string, credentials: Record<string, unknown>) => {
    if (provider === "HUBSPOT") return Boolean(credentials.hubspotToken);
    return false;
  }),
}));

describe("loadDashboardOverview", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("summarizes revenue, integrations, automations, and analytics freshness", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { loadDashboardOverview } = await import("@/lib/platform/dashboard/overview");

    vi.mocked(prisma.deal.count)
      .mockResolvedValueOnce(6 as never)
      .mockResolvedValueOnce(3 as never)
      .mockResolvedValueOnce(2 as never);
    vi.mocked(prisma.deal.aggregate).mockResolvedValue({ _sum: { amount: 42500 } } as never);
    vi.mocked(prisma.workflowDefinition.count).mockResolvedValue(5 as never);
    vi.mocked(prisma.workflowApproval.count).mockResolvedValue(1 as never);
    vi.mocked(prisma.automationRecommendation.count).mockResolvedValue(2 as never);
    vi.mocked(prisma.workflowRun.count)
      .mockResolvedValueOnce(1 as never)
      .mockResolvedValueOnce(1 as never);
    vi.mocked(prisma.integrationConnection.findMany).mockResolvedValue([
      {
        provider: "SLACK",
        status: IntegrationConnectionStatus.ERROR,
        lastSyncedAt: new Date("2026-03-11T09:00:00.000Z"),
      },
    ] as never);
    vi.mocked(prisma.analyticsSnapshot.groupBy).mockResolvedValue([
      { providerKey: "hubspot", _max: { capturedAt: new Date("2026-03-11T15:00:00.000Z") } },
      { providerKey: "slack", _max: { capturedAt: new Date("2026-03-11T14:00:00.000Z") } },
    ] as never);
    vi.mocked(prisma.analyticsSnapshot.findMany).mockResolvedValue([
      {
        providerKey: "hubspot",
        status: AnalyticsSnapshotStatus.SUCCESS,
        capturedAt: new Date("2026-03-11T15:00:00.000Z"),
        expiresAt: new Date("2099-03-11T17:00:00.000Z"),
      },
      {
        providerKey: "slack",
        status: AnalyticsSnapshotStatus.ERROR,
        capturedAt: new Date("2026-03-11T14:00:00.000Z"),
        expiresAt: new Date("2026-03-11T16:00:00.000Z"),
      },
    ] as never);

    const payload = await loadDashboardOverview({
      userId: "user-1",
      organizationId: "org-1",
    });

    expect(payload.revenueSummary).toMatchObject({
      workspaceId: "sources",
      openDeals: 6,
      pipelineValue: 42500,
      closingThisMonth: 3,
      wonThisQuarter: 2,
    });
    expect(payload.integrationHealth).toMatchObject({
      workspaceId: "sources",
      totalConnections: 3,
      connectedConnections: 1,
      degradedConnections: 1,
      errorConnections: 1,
      staleConnections: 0,
      missingConnections: 1,
    });
    expect(payload.automationAttention).toMatchObject({
      workspaceId: "pipelines",
      activeWorkflows: 5,
      pendingApprovals: 1,
      pendingRecommendations: 2,
      failingRuns: 1,
      waitingExternalRuns: 1,
    });
    expect(payload.analyticsFreshness).toMatchObject({
      workspaceId: "metrics",
      healthyDomains: 1,
      errorDomains: 1,
      missingDomains: 1,
    });
  });

  it("counts snapshot-key variants as one analytics freshness domain", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { snapshotKeysForIntegrationProvider } = await import("@/lib/analytics/provider-health");
    const { loadDashboardOverview } = await import("@/lib/platform/dashboard/overview");

    vi.mocked(snapshotKeysForIntegrationProvider).mockImplementation((provider: string) => {
      if (provider === "GOOGLE_ANALYTICS") return ["googleAnalytics", "google_analytics"];
      if (provider === "HUBSPOT") return ["hubspot"];
      return ["slack"];
    });
    vi.mocked(prisma.deal.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.deal.aggregate).mockResolvedValue({ _sum: { amount: 0 } } as never);
    vi.mocked(prisma.workflowDefinition.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.workflowApproval.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.automationRecommendation.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.workflowRun.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.integrationConnection.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.analyticsSnapshot.groupBy).mockResolvedValue([
      { providerKey: "google_analytics", _max: { capturedAt: new Date("2026-03-11T15:00:00.000Z") } },
    ] as never);
    vi.mocked(prisma.analyticsSnapshot.findMany).mockResolvedValue([
      {
        providerKey: "google_analytics",
        status: AnalyticsSnapshotStatus.SUCCESS,
        capturedAt: new Date("2026-03-11T15:00:00.000Z"),
        expiresAt: new Date("2099-03-11T17:00:00.000Z"),
      },
    ] as never);

    const payload = await loadDashboardOverview({
      userId: "user-1",
      organizationId: "org-1",
    });

    expect(prisma.analyticsSnapshot.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          providerKey: {
            in: expect.arrayContaining(["googleAnalytics", "google_analytics"]),
          },
        }),
      }),
    );
    expect(payload.analyticsFreshness).toMatchObject({
      healthyDomains: 1,
      missingDomains: 2,
    });
  });

  it("ignores future-dated snapshots when summarizing analytics freshness", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-11T16:00:00.000Z"));
    const { prisma } = await import("@/lib/prisma");
    const { loadDashboardOverview } = await import("@/lib/platform/dashboard/overview");

    vi.mocked(prisma.deal.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.deal.aggregate).mockResolvedValue({ _sum: { amount: 0 } } as never);
    vi.mocked(prisma.workflowDefinition.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.workflowApproval.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.automationRecommendation.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.workflowRun.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.integrationConnection.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.analyticsSnapshot.groupBy).mockResolvedValue([
      { providerKey: "hubspot", _max: { capturedAt: new Date("2026-03-11T15:00:00.000Z") } },
      { providerKey: "slack", _max: { capturedAt: new Date("2026-03-12T15:00:00.000Z") } },
    ] as never);
    vi.mocked(prisma.analyticsSnapshot.findMany).mockResolvedValue([
      {
        providerKey: "hubspot",
        status: AnalyticsSnapshotStatus.SUCCESS,
        capturedAt: new Date("2026-03-11T15:00:00.000Z"),
        expiresAt: new Date("2099-03-11T17:00:00.000Z"),
      },
      {
        providerKey: "slack",
        status: AnalyticsSnapshotStatus.SUCCESS,
        capturedAt: new Date("2026-03-12T15:00:00.000Z"),
        expiresAt: new Date("2099-03-12T17:00:00.000Z"),
      },
    ] as never);

    const payload = await loadDashboardOverview({
      userId: "user-1",
      organizationId: "org-1",
    });

    expect(prisma.analyticsSnapshot.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          capturedAt: { lte: new Date("2026-03-11T16:00:00.000Z") },
        }),
      }),
    );
    expect(payload.analyticsFreshness).toMatchObject({
      latestSnapshotAt: "2026-03-11T15:00:00.000Z",
      healthyDomains: 1,
      missingDomains: 2,
    });
  });

  it("queries open and won deal stages using revenue-specific filters", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { loadDashboardOverview } = await import("@/lib/platform/dashboard/overview");

    vi.mocked(prisma.deal.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.deal.aggregate).mockResolvedValue({ _sum: { amount: 0 } } as never);
    vi.mocked(prisma.workflowDefinition.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.workflowApproval.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.automationRecommendation.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.workflowRun.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.integrationConnection.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.analyticsSnapshot.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.analyticsSnapshot.findMany).mockResolvedValue([] as never);

    await loadDashboardOverview({ userId: "user-1", organizationId: "org-1" });

    const dealCountCalls = vi.mocked(prisma.deal.count).mock.calls;
    expect(dealCountCalls[0]?.[0]?.where?.stage).toEqual({
      notIn: [DealStage.CLOSED_WON, DealStage.CLOSED_LOST],
    });
    expect(dealCountCalls[2]?.[0]?.where?.stage).toBe(DealStage.CLOSED_WON);
  });
});
