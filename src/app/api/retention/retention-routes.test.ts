import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/customer-success/access", () => ({
  requireCustomerSuccessActor: vi.fn(),
}));

vi.mock("@/lib/retention/service", () => ({
  getRetentionSummary: vi.fn(),
  listRetentionTenants: vi.fn(),
  getRetentionTenantDetail: vi.fn(),
  normalizeRetentionFilters: vi.fn(() => ({ status: null })),
}));

vi.mock("@/lib/retention/customer-health-dashboard", () => ({
  buildCustomerHealthDashboard: vi.fn(),
}));

vi.mock("@/lib/retention/pipeline", () => ({
  syncRetentionSources: vi.fn(),
  buildRetentionDataset: vi.fn(),
  materializeRetentionCurrent: vi.fn(),
}));

const ACTOR = {
  id: "user_1",
  organizationId: "org_1",
  email: "owner@example.com",
  name: "Owner",
};

function detailContext(customerRecordId = "cust_1") {
  return { params: Promise.resolve({ customerRecordId }) };
}

describe("retention routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it("passes through auth failures for summary requests", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const { GET } = await import("@/app/api/retention/summary/route");
    const response = await GET(new NextRequest("http://localhost/api/retention/summary"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns retention summary data for authenticated actors", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { getRetentionSummary, normalizeRetentionFilters } = await import("@/lib/retention/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(normalizeRetentionFilters).mockReturnValue({ status: "At Risk" });
    vi.mocked(getRetentionSummary).mockResolvedValue({
      generatedAt: "2026-03-13T10:00:00.000Z",
      lirDefinition: {
        id: "mature-active-weeks",
        label: "Active weeks trailing 8",
        lifecyclePhase: "MATURE",
        metricKey: "activeWeeksTrailing8",
        comparator: "gte",
        threshold: 5,
        windowLabel: "Trailing 8 weeks",
        description: "Tenant is active in at least five of the last eight weeks.",
        rationale: "Habitual weekly operations are usually the clearest signal of embedded workflow value.",
      },
      totals: {
        tenants: 1,
        activeTenants: 1,
        lirPassingTenants: 1,
        atRiskTenants: 0,
        onboardingRiskTenants: 0,
        billingRiskTenants: 0,
      },
      kpis: [],
      byIcp: [],
      byPlan: [],
      byAgeBucket: [],
      sharpDeclines: [],
      onboardingMisses: [],
      supportHeavyHighUsage: [],
      billingRiskAccounts: [],
      cohorts: [],
      dataCoverage: [],
      dataQuality: {
        arda: {
          latestSync: null,
          tenantRecords: 0,
          activityRecords: 0,
          tenantsWithUserDetailsBreadth: 0,
          adoptionBreadthSource: "NONE",
          note: "No Arda activity history or User Details fallback breadth counts are currently available.",
        },
      },
    } as never);

    const { GET } = await import("@/app/api/retention/summary/route");
    const request = new NextRequest("http://localhost/api/retention/summary?status=At%20Risk");
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(normalizeRetentionFilters).toHaveBeenCalledWith(request.nextUrl.searchParams);
    expect(getRetentionSummary).toHaveBeenCalledWith(ACTOR, { status: "At Risk" });
  });

  it("returns retention tenant list data", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { listRetentionTenants } = await import("@/lib/retention/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(listRetentionTenants).mockResolvedValue([
      {
        customerRecordId: "cust_1",
        tenantName: "Arda Foods",
        status: "Healthy",
        lifecyclePhase: "MATURE",
        primaryLirPassed: true,
        primaryLirLabel: "Active weeks trailing 8",
        primaryLirValue: 6,
        primaryLirThreshold: 5,
        currentMonthActivity: 24,
        trendVsPriorPct: 8,
        supportRisk: false,
        billingRisk: false,
        onboardingRisk: false,
        icp: true,
        ownerName: "CS Owner",
        segment: "Mid-market",
        plan: "Growth",
        ageBucket: "180d+",
        reasonCodes: [],
        lastMaterializedAt: "2026-03-13T10:00:00.000Z",
      },
    ] as never);

    const { GET } = await import("@/app/api/retention/tenants/route");
    const response = await GET(new NextRequest("http://localhost/api/retention/tenants"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.tenants).toHaveLength(1);
    expect(listRetentionTenants).toHaveBeenCalledWith(ACTOR, { status: null });
  });

  it("returns 404 when retention tenant detail is missing", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { getRetentionTenantDetail } = await import("@/lib/retention/service");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(getRetentionTenantDetail).mockResolvedValue(null);

    const { GET } = await import("@/app/api/retention/tenants/[customerRecordId]/route");
    const response = await GET(
      new NextRequest("http://localhost/api/retention/tenants/cust_missing"),
      detailContext("cust_missing")
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Retention tenant not found" });
  });

  it("passes through auth failures for retention sync requests", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const { POST } = await import("@/app/api/retention/sync/route");
    const response = await POST(
      new NextRequest("http://localhost/api/retention/sync", {
        method: "POST",
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("runs the full retention pipeline for authenticated actors", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { syncRetentionSources, buildRetentionDataset, materializeRetentionCurrent } = await import("@/lib/retention/pipeline");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });

    const { POST } = await import("@/app/api/retention/sync/route");
    const response = await POST(
      new NextRequest("http://localhost/api/retention/sync", {
        method: "POST",
        body: JSON.stringify({ mode: "full" }),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(200);
    expect(syncRetentionSources).toHaveBeenCalledWith(ACTOR);
    expect(buildRetentionDataset).toHaveBeenCalledWith(ACTOR);
    expect(materializeRetentionCurrent).toHaveBeenCalledWith(ACTOR);
  });

  it("passes through auth failures for customer health dashboard requests", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { buildCustomerHealthDashboard } = await import("@/lib/retention/customer-health-dashboard");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const { GET } = await import("@/app/api/retention/customer-health/route");
    const response = await GET(new NextRequest("http://localhost/api/retention/customer-health"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(buildCustomerHealthDashboard).not.toHaveBeenCalled();
  });

  it("returns the materialized customer health dashboard for authenticated actors", async () => {
    const { requireCustomerSuccessActor } = await import("@/lib/customer-success/access");
    const { buildCustomerHealthDashboard } = await import("@/lib/retention/customer-health-dashboard");

    vi.mocked(requireCustomerSuccessActor).mockResolvedValue({ actor: ACTOR });
    vi.mocked(buildCustomerHealthDashboard).mockResolvedValue({
      generatedAt: "2026-03-15T00:00:00.000Z",
      totals: {
        totalAccounts: 1,
        healthyAccounts: 1,
        watchAccounts: 0,
        atRiskAccounts: 0,
        onboardingRiskAccounts: 0,
        billingRiskAccounts: 0,
        lirPassingAccounts: 1,
        avgCurrentMonthActivity: 24,
      },
      healthStatusBreakdown: [{ status: "Healthy", count: 1 }],
      sourceCoverage: [],
      ardaDataQuality: {
        latestSync: null,
        tenantRecords: 1,
        orderRecords: 0,
        cardRecords: 0,
        itemRecords: 0,
        activityRecords: 0,
        adoptionBreadthSource: "NONE",
        note: "No Arda activity history or User Details fallback breadth counts are currently available.",
      },
      riskQueues: { atRisk: [], onboardingRisk: [], billingRisk: [], sharpDeclines: [] },
      accounts: [],
    } as never);

    const { GET } = await import("@/app/api/retention/customer-health/route");
    const response = await GET(new NextRequest("http://localhost/api/retention/customer-health"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.totals.totalAccounts).toBe(1);
    expect(buildCustomerHealthDashboard).toHaveBeenCalledWith(ACTOR);
  });
});
