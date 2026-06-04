import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildExpenseDashboard } from "@/lib/imladris/expense-dashboard";
import { auth } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({
    user: {
      id: "user_1",
      email: "founder@example.com",
      organizationId: "org_1",
    },
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    imladrisRawSourceRecord: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/imladris/expense-dashboard", () => ({
  buildExpenseDashboard: vi.fn(async () => ({
    months: [],
    categories: [],
    categoryMonthly: {},
    categoryTotals: {},
    vendorMonthly: {},
    vendorTotals: {},
    vendorCategory: {},
    txnIndex: {},
    chartSeries: {
      operatingInflows: [],
      operatingOutflows: [],
      grossBurn: [],
      netBurn: [],
    },
    refreshedAt: "2026-06-03T12:00:00.000Z",
  })),
}));

describe("GET /api/imladris/dashboards/expenses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serves the signed-in user's expense dashboard with the requested range", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest("http://localhost/api/imladris/dashboards/expenses?range=90d"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      months: [],
      categories: [],
      chartSeries: expect.any(Object),
      refreshedAt: "2026-06-03T12:00:00.000Z",
    }));
    expect(buildExpenseDashboard).toHaveBeenCalledWith(expect.objectContaining({
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      range: "90d",
    }));
  });

  it("falls back to the 180 day range for unsupported range values", async () => {
    const { GET } = await import("./route");

    await GET(new NextRequest("http://localhost/api/imladris/dashboards/expenses?range=365d"));

    expect(buildExpenseDashboard).toHaveBeenCalledWith(expect.objectContaining({
      range: "180d",
    }));
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const { GET } = await import("./route");

    const response = await GET(new NextRequest("http://localhost/api/imladris/dashboards/expenses"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(buildExpenseDashboard).not.toHaveBeenCalled();
  });
});
