import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/analytics/monthly-pnl-history", () => ({
  buildMonthlyPnLHistory: vi.fn(),
}));

vi.mock("@/lib/analytics/executive-ai-analysis", () => ({
  generateExecutiveAnalysis: vi.fn(),
}));

describe("GET /api/financial-planning/ai-analysis", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    const { GET } = await import("@/app/api/financial-planning/ai-analysis/route");

    vi.mocked(auth).mockResolvedValue(null as never);

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("uses expanded monthly history for executive analysis", async () => {
    const { auth } = await import("@/lib/auth");
    const { buildMonthlyPnLHistory } = await import("@/lib/analytics/monthly-pnl-history");
    const { generateExecutiveAnalysis } = await import("@/lib/analytics/executive-ai-analysis");
    const { GET } = await import("@/app/api/financial-planning/ai-analysis/route");
    const history = {
      months: [
        {
          month: "2025-01",
          sourceCoverage: { stripe: true, mercury: true },
          revenue: 100,
          cogs: 0,
          grossProfit: 100,
          grossMarginPct: 100,
          operatingExpenses: {
            payroll: 0,
            marketing: 0,
            infrastructure: 0,
            ops: 0,
          },
          totalOpex: 0,
          operatingIncome: 100,
          operatingMarginPct: 100,
          netIncome: 100,
          cashBalance: 1000,
          burnRate: 0,
          mrr: 100,
          activeSubscriptions: 1,
          churnRate: 0,
        },
      ],
      latestMoM: null,
    };

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(buildMonthlyPnLHistory).mockResolvedValue(history as never);
    vi.mocked(generateExecutiveAnalysis).mockResolvedValue({
      summary: "Revenue is steady.",
    } as never);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(buildMonthlyPnLHistory).toHaveBeenCalledWith("user-1");
    expect(generateExecutiveAnalysis).toHaveBeenCalledWith(history);
    expect(payload).toEqual({ summary: "Revenue is steady." });
  });

  it("returns 422 when no monthly history is available", async () => {
    const { auth } = await import("@/lib/auth");
    const { buildMonthlyPnLHistory } = await import("@/lib/analytics/monthly-pnl-history");
    const { generateExecutiveAnalysis } = await import("@/lib/analytics/executive-ai-analysis");
    const { GET } = await import("@/app/api/financial-planning/ai-analysis/route");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(buildMonthlyPnLHistory).mockResolvedValue({
      months: [],
      latestMoM: null,
    } as never);

    const response = await GET();

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "No monthly financial data available for analysis",
    });
    expect(generateExecutiveAnalysis).not.toHaveBeenCalled();
  });
});
