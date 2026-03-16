import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RetentionDashboard } from "@/components/retention/retention-dashboard";
import { clearDashboardCache } from "@/lib/client/dashboard-cache-store";

vi.mock("next/navigation", () => ({
  usePathname: () => "/analytics/retention",
  useSearchParams: () => new URLSearchParams(),
}));

describe("RetentionDashboard", () => {
  beforeEach(() => {
    clearDashboardCache();
    vi.restoreAllMocks();
  });

  it("keeps the summary visible when the tenant list request fails", async () => {
    const summary = {
      generatedAt: "2026-03-15T00:00:00.000Z",
      lirDefinition: {
        id: "lir",
        label: "Active seats",
        description: "Seats active in the current month.",
        comparator: "gte" as const,
        threshold: 3,
        windowDays: 30,
        windowLabel: "30 days",
      },
      totals: {
        tenants: 4,
        activeTenants: 4,
        lirPassingTenants: 3,
        atRiskTenants: 1,
        onboardingRiskTenants: 1,
        billingRiskTenants: 1,
      },
      kpis: [
        {
          label: "LIR attainment",
          value: 75,
          delta: null,
          helpText: "Percent of tenants passing the LIR.",
        },
      ],
      byIcp: [],
      byPlan: [],
      byAgeBucket: [],
      sharpDeclines: [],
      onboardingMisses: [],
      supportHeavyHighUsage: [],
      billingRiskAccounts: [],
      cohorts: [],
      dataCoverage: [],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/retention/summary")) {
          return {
            ok: true,
            json: async () => summary,
          } satisfies Partial<Response>;
        }
        if (url.includes("/api/retention/tenants")) {
          return {
            ok: false,
            status: 500,
          } satisfies Partial<Response>;
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }) as unknown as typeof fetch,
    );

    render(<RetentionDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Retention")).toBeTruthy();
    });

    expect(screen.getByText("Data could not be refreshed.")).toBeTruthy();
    expect(
      screen.getByText("Retention tenant list request failed (500). Summary metrics are still shown below.")
    ).toBeTruthy();
    expect(screen.getByText("LIR Pass Rate")).toBeTruthy();
    expect(screen.getByText("75.0%")).toBeTruthy();
    expect(screen.getByText("Tenant-level retention rows are temporarily unavailable. Refresh to retry this panel.")).toBeTruthy();
    expect(screen.queryByText("No retention dataset has been materialized for this organization yet.")).toBeNull();
  });

  it("explains when summary data exists but tenant rows are empty", async () => {
    const summary = {
      generatedAt: "2026-03-15T00:00:00.000Z",
      lirDefinition: {
        id: "lir",
        label: "Active seats",
        description: "Seats active in the current month.",
        comparator: "gte" as const,
        threshold: 3,
        windowDays: 30,
        windowLabel: "30 days",
      },
      totals: {
        tenants: 4,
        activeTenants: 4,
        lirPassingTenants: 3,
        atRiskTenants: 1,
        onboardingRiskTenants: 0,
        billingRiskTenants: 0,
      },
      kpis: [
        {
          label: "LIR attainment",
          value: 75,
          delta: null,
          helpText: "Percent of tenants passing the LIR.",
        },
      ],
      byIcp: [],
      byPlan: [],
      byAgeBucket: [],
      sharpDeclines: [],
      onboardingMisses: [],
      supportHeavyHighUsage: [],
      billingRiskAccounts: [],
      cohorts: [],
      dataCoverage: [],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/retention/summary")) {
          return {
            ok: true,
            json: async () => summary,
          } satisfies Partial<Response>;
        }
        if (url.includes("/api/retention/tenants")) {
          return {
            ok: true,
            json: async () => ({
              generatedAt: summary.generatedAt,
              tenants: [],
            }),
          } satisfies Partial<Response>;
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }) as unknown as typeof fetch,
    );

    render(<RetentionDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Retention")).toBeTruthy();
    });

    expect(screen.getByText("Retention summary metrics are available, but no tenant-level rows were returned for this range yet.")).toBeTruthy();
    expect(screen.getByText("No ICP or segment rollups are available yet.")).toBeTruthy();
    expect(screen.getByText("No source coverage diagnostics are available yet.")).toBeTruthy();
    expect(screen.getByText("75.0%")).toBeTruthy();
  });
});
