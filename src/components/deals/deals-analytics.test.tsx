import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DealsAnalytics } from "@/components/deals/deals-analytics";
import { clearDashboardCache } from "@/lib/client/dashboard-cache-store";
import { DEALS_SCHEMA_MISSING_MESSAGE } from "@/lib/deals/schema-state";

describe("DealsAnalytics", () => {
  beforeEach(() => {
    clearDashboardCache();
    vi.restoreAllMocks();
  });

  it("renders deal analytics KPIs from the analytics API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            pipeline: {
              stages: [
                { stage: "LEAD", count: 2, totalAmount: 12000 },
                { stage: "QUALIFIED", count: 1, totalAmount: 24000 },
                { stage: "PROPOSAL", count: 1, totalAmount: 18000 },
                { stage: "NEGOTIATION", count: 1, totalAmount: 26000 },
                { stage: "CLOSED_WON", count: 2, totalAmount: 30000 },
                { stage: "CLOSED_LOST", count: 1, totalAmount: 14000 },
              ],
              totalValue: 80000,
              totalDeals: 5,
            },
            velocity: {
              avgDaysPerStage: {
                LEAD: 4,
                QUALIFIED: 7,
                PROPOSAL: 9,
                NEGOTIATION: 6,
                CLOSED_WON: 0,
                CLOSED_LOST: 0,
              },
              avgTotalDays: 28,
              trend: [
                { month: "2026-01", avgDays: 24 },
                { month: "2026-02", avgDays: 28 },
              ],
            },
            meetings: {
              total: 11,
              completed: 8,
              upcoming: 3,
              byMonth: [
                { month: "2026-01", count: 5 },
                { month: "2026-02", count: 6 },
              ],
              avgAttendanceRate: 0.75,
            },
            closeRate: {
              won: 2,
              lost: 1,
              open: 5,
              rate: 2 / 3,
              trend: [
                { month: "2026-01", won: 1, lost: 1, rate: 0.5 },
                { month: "2026-02", won: 1, lost: 0, rate: 1 },
              ],
            },
            sourceAttribution: [
              { source: "INBOUND", count: 3, totalAmount: 50000, wonCount: 1 },
              { source: "OUTBOUND", count: 2, totalAmount: 30000, wonCount: 1 },
            ],
            staleDeals: [],
          }),
        ),
      ),
    );

    render(<DealsAnalytics />);

    await waitFor(() => {
      expect(screen.getByText("Deals Analytics")).toBeTruthy();
    });

    expect(screen.getByText("$80.0K")).toBeTruthy();
    expect(screen.getByText("5 open deals")).toBeTruthy();
    expect(screen.getByText("66.7%")).toBeTruthy();
    expect(screen.getByText("28d")).toBeTruthy();
    expect(screen.getByText("11")).toBeTruthy();
  });

  it("renders a setup-required state when the deals schema is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: DEALS_SCHEMA_MISSING_MESSAGE,
            code: "DEALS_SCHEMA_MISSING",
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    render(<DealsAnalytics />);

    await waitFor(() => {
      expect(screen.getByText("Deals setup required")).toBeTruthy();
    });

    expect(screen.getByText(DEALS_SCHEMA_MISSING_MESSAGE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh now" })).toBeTruthy();
  });
});
