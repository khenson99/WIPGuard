import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CeoCommandCenter } from "@/components/analytics/ceo-command-center";
import { clearDashboardCache } from "@/lib/client/dashboard-cache-store";

describe("CeoCommandCenter", () => {
  beforeEach(() => {
    clearDashboardCache();
    vi.restoreAllMocks();
  });

  it("renders trusted metrics, trust labels, and report packs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/ceo/metrics") {
          return Response.json({
            generatedAt: "2026-05-01T12:00:00.000Z",
            periodStart: "2026-04-01T00:00:00.000Z",
            periodEnd: "2026-05-01T12:00:00.000Z",
            trustSummary: { fresh: 1, stale: 1, partial: 0, missing: 0, error: 0, conflicted: 0 },
            readiness: {
              status: "not_board_final",
              ready: false,
              summary: "Not board-final: 1 readiness gate is failing.",
              failingGates: [
                {
                  metricKey: "finance.cash_balance",
                  label: "Cash Balance",
                  reason: "Metric source trust is stale.",
                },
              ],
            },
            metrics: [
              {
                definition: {
                  key: "ceo.flow_reliability_score",
                  label: "Internal Execution Reliability",
                  domain: "ceo",
                  unit: "score",
                  sourceDependencies: ["wipguard"],
                },
                value: 91,
                delta: 4,
                asOf: "2026-05-01T12:00:00.000Z",
                trust: { status: "fresh", confidence: 1, warnings: [], sourceStates: [] },
                lineage: [],
              },
              {
                definition: {
                  key: "finance.cash_balance",
                  label: "Cash Balance",
                  domain: "finance",
                  unit: "currency",
                  sourceDependencies: ["mercury"],
                },
                value: 100000,
                delta: null,
                asOf: "2026-05-01T11:00:00.000Z",
                trust: {
                  status: "stale",
                  confidence: 0.7,
                  warnings: ["Required source mercury is stale."],
                  sourceStates: [],
                },
                lineage: [],
              },
            ],
            reportPacks: [
              {
                slug: "weekly-exec",
                name: "Weekly Exec",
                description: "Weekly operating review.",
                cadence: "weekly",
                audience: "TEAM",
                metricKeys: ["ceo.flow_reliability_score"],
                sections: [],
              },
            ],
            definitions: [],
          });
        }
        return Response.json({ reportPacks: [] });
      })
    );

    render(<CeoCommandCenter />);

    await waitFor(() => {
      expect(screen.getByText("CEO Command Center")).toBeTruthy();
    });

    expect(screen.getByText("Internal Execution Reliability")).toBeTruthy();
    expect(screen.getByText("Not board-final")).toBeTruthy();
    expect(screen.getByText("not board final")).toBeTruthy();
    expect(screen.getByText("Cash Balance")).toBeTruthy();
    expect(screen.getAllByText("fresh").length).toBeGreaterThan(0);
    expect(screen.getAllByText("stale").length).toBeGreaterThan(0);
    expect(screen.getByText("Weekly Exec")).toBeTruthy();
    expect(screen.getByText("Required source mercury is stale.")).toBeTruthy();
  });
});
