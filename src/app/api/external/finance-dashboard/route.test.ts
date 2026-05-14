import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/analytics/fetchers", () => ({
  fetchMercuryData: vi.fn(),
}));

const { fetchMercuryData } = await import("@/lib/analytics/fetchers");
const { GET, OPTIONS } = await import("./route");

const allowedOrigin = "https://vigilant-invention-j1n5g1p.pages.github.io";

function request(
  url = "https://wipguard.test/api/external/finance-dashboard?range=180d",
  headers: Record<string, string> = {},
) {
  return new NextRequest(url, { method: "GET", headers });
}

describe("external finance dashboard export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FINANCE_DASHBOARD_EXPORT_TOKEN = "test-export-token";
    process.env.FINANCE_DASHBOARD_PASSWORD_HASH =
      "ed2814b9fdf92b9693e2249637833b4441c1b63143a3d072c043f8715081b533";
    process.env.FINANCE_DASHBOARD_ALLOWED_ORIGINS = allowedOrigin;
    process.env.MERCURY_API_TOKEN = "test-mercury-token";
  });

  it("returns CORS headers for the private GitHub Pages origin", async () => {
    const response = await OPTIONS(
      request("https://wipguard.test/api/external/finance-dashboard", {
        origin: allowedOrigin,
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(allowedOrigin);
    expect(response.headers.get("access-control-allow-headers")).toContain("x-finance-dashboard-token");
    expect(response.headers.get("access-control-allow-headers")).toContain("x-finance-dashboard-password");
  });

  it("rejects requests without the scoped export token", async () => {
    const response = await GET(
      request("https://wipguard.test/api/external/finance-dashboard", {
        origin: allowedOrigin,
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(fetchMercuryData).not.toHaveBeenCalled();
  });

  it("fetches fresh Mercury data for authorized dashboard requests", async () => {
    vi.mocked(fetchMercuryData).mockResolvedValue({
      accounts: [],
      cashFlow: {
        totalBalance: 100,
        inflows30d: 10,
        outflows30d: 5,
        netCashFlow: 5,
        runway: 20,
        burnRate: 5,
      },
      transactions: [],
      _meta: { provider: "mercury", capturedAt: "2026-05-12T00:00:00.000Z" },
    } as never);

    const response = await GET(
      request("https://wipguard.test/api/external/finance-dashboard?range=90d", {
        origin: allowedOrigin,
        "x-finance-dashboard-token": "test-export-token",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(allowedOrigin);
    const body = await response.json();
    expect(body.mercury.cashFlow.totalBalance).toBe(100);
    expect(body.meta.range).toBe("90d");
    expect(fetchMercuryData).toHaveBeenCalledWith("test-mercury-token", {
      fromDate: expect.any(Date),
      toDate: expect.any(Date),
    });
  });

  it("fetches fresh Mercury data for password-authorized dashboard requests", async () => {
    vi.mocked(fetchMercuryData).mockResolvedValue({
      accounts: [],
      cashFlow: {
        totalBalance: 100,
        inflows30d: 10,
        outflows30d: 5,
        netCashFlow: 5,
        runway: 20,
        burnRate: 5,
      },
      transactions: [],
      _meta: { provider: "mercury", capturedAt: "2026-05-12T00:00:00.000Z" },
    } as never);

    const response = await GET(
      request("https://wipguard.test/api/external/finance-dashboard?range=90d", {
        origin: allowedOrigin,
        "x-finance-dashboard-password": ["born", "to", "flow"].join(""),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(allowedOrigin);
    const body = await response.json();
    expect(body.mercury.cashFlow.totalBalance).toBe(100);
    expect(body.meta.range).toBe("90d");
    expect(fetchMercuryData).toHaveBeenCalledWith("test-mercury-token", {
      fromDate: expect.any(Date),
      toDate: expect.any(Date),
    });
  });
});
