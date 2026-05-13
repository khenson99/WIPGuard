import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/analytics/monthly-pnl-history", () => ({
  buildMonthlyPnLHistory: vi.fn(),
}));

describe("GET /api/financial-planning/monthly-history", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-07T12:00:00.000Z"));
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    const { GET } = await import("@/app/api/financial-planning/monthly-history/route");

    vi.mocked(auth).mockResolvedValue(null as never);

    const response = await GET(
      new NextRequest("http://localhost/api/financial-planning/monthly-history"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("uses the expanded default history window when months is omitted", async () => {
    const { auth } = await import("@/lib/auth");
    const { buildMonthlyPnLHistory } = await import("@/lib/analytics/monthly-pnl-history");
    const { GET } = await import("@/app/api/financial-planning/monthly-history/route");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(buildMonthlyPnLHistory).mockResolvedValue({
      months: [],
      latestMoM: null,
    } as never);

    const response = await GET(
      new NextRequest("http://localhost/api/financial-planning/monthly-history"),
    );

    expect(response.status).toBe(200);
    expect(buildMonthlyPnLHistory).toHaveBeenCalledWith("user-1", undefined);
  });

  it("keeps explicit months query as a bounded relative override", async () => {
    const { auth } = await import("@/lib/auth");
    const { buildMonthlyPnLHistory } = await import("@/lib/analytics/monthly-pnl-history");
    const { GET } = await import("@/app/api/financial-planning/monthly-history/route");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(buildMonthlyPnLHistory).mockResolvedValue({
      months: [],
      latestMoM: null,
    } as never);

    const response = await GET(
      new NextRequest("http://localhost/api/financial-planning/monthly-history?months=12"),
    );

    expect(response.status).toBe(200);
    expect(buildMonthlyPnLHistory).toHaveBeenCalledWith("user-1", {
      startDate: new Date("2025-05-01T00:00:00.000Z"),
    });
  });
});
