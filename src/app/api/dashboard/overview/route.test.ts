import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/session-user", () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/platform/dashboard/context", () => ({
  resolveDashboardOrganizationId: vi.fn(),
  tenantBypassEnabled: false,
}));

vi.mock("@/lib/platform/dashboard/overview", () => ({
  loadDashboardOverview: vi.fn(),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContextAsync: vi.fn(async (_context: unknown, fn: () => Promise<unknown>) => fn()),
}));

describe("GET /api/dashboard/overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the user is not authenticated", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAuthenticatedUser } = await import("@/lib/session-user");
    const { GET } = await import("@/app/api/dashboard/overview/route");

    vi.mocked(auth).mockResolvedValue(null as never);
    vi.mocked(getAuthenticatedUser).mockReturnValue(null as never);

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("loads the overview within organization request context", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAuthenticatedUser } = await import("@/lib/session-user");
    const { resolveDashboardOrganizationId } = await import("@/lib/platform/dashboard/context");
    const { loadDashboardOverview } = await import("@/lib/platform/dashboard/overview");
    const { runWithContextAsync } = await import("@/lib/request-context");
    const { GET } = await import("@/app/api/dashboard/overview/route");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(getAuthenticatedUser).mockReturnValue({
      id: "user-1",
      organizationId: "org-1",
    } as never);
    vi.mocked(resolveDashboardOrganizationId).mockResolvedValue("org-1" as never);
    vi.mocked(loadDashboardOverview).mockResolvedValue({
      generatedAt: "2026-03-11T16:00:00.000Z",
      revenueSummary: {
        workspaceId: "deals",
        openDeals: 0,
        pipelineValue: 0,
        closingThisMonth: 0,
        wonThisQuarter: 0,
      },
      integrationHealth: {
        workspaceId: "integrations",
        totalConnections: 0,
        connectedConnections: 0,
        degradedConnections: 0,
        errorConnections: 0,
        staleConnections: 0,
        missingConnections: 0,
      },
      automationAttention: {
        workspaceId: "automations",
        activeWorkflows: 0,
        pendingApprovals: 0,
        pendingRecommendations: 0,
        failingRuns: 0,
        waitingExternalRuns: 0,
      },
      analyticsFreshness: {
        workspaceId: "analytics",
        latestSnapshotAt: null,
        healthyDomains: 0,
        staleDomains: 0,
        errorDomains: 0,
        missingDomains: 0,
      },
    } as never);

    const response = await GET();
    const payload = await response.json();

    expect(runWithContextAsync).toHaveBeenCalledWith(
      { organizationId: "org-1", userId: "user-1" },
      expect.any(Function),
    );
    expect(loadDashboardOverview).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: "org-1",
    });
    expect(response.status).toBe(200);
    expect(payload.revenueSummary.workspaceId).toBe("deals");
  });

  it("returns 403 when organization context is required but unavailable", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAuthenticatedUser } = await import("@/lib/session-user");
    const { resolveDashboardOrganizationId } = await import("@/lib/platform/dashboard/context");
    const { GET } = await import("@/app/api/dashboard/overview/route");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(getAuthenticatedUser).mockReturnValue({
      id: "user-1",
      organizationId: null,
    } as never);
    vi.mocked(resolveDashboardOrganizationId).mockResolvedValue(null as never);

    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Organization context required for dashboard overview",
    });
  });
});
