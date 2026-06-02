import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AiInsightsPanel } from "@/components/analytics/ai-insights-panel";
import type { AiInsightsBundle } from "@/lib/analytics/types";

function makeBundle(): AiInsightsBundle {
  return {
    generatedAt: "2026-01-30T00:00:00.000Z",
    global: [
      {
        id: "warn-ads",
        section: "website-traffic",
        severity: "warning",
        title: "Ads efficiency trending down",
        why: "Cost per conversion rising.",
        confidence: 0.71,
        expectedImpact: "Improve paid ROI.",
        stale: false,
        evidence: [
          {
            source: "Google Ads",
            domain: "googleAds",
            metric: "CPA",
            value: "$58",
            delta: "+12%",
          },
        ],
        actions: [{ type: "create_recommendation", label: "Review campaign targeting", payload: {} }],
      },
      {
        id: "critical-sales",
        section: "sales-pipeline",
        severity: "critical",
        title: "Pipeline conversion risk",
        why: "No-shows increased.",
        confidence: 0.89,
        expectedImpact: "Recover demos.",
        stale: true,
        evidence: [
          {
            source: "HubSpot",
            domain: "hubspot",
            metric: "No-show rate",
            value: "22%",
            delta: "+7%",
          },
        ],
        actions: [{ type: "assign_owner", label: "Assign sales ops owner", payload: {} }],
      },
      {
        id: "info-finance",
        section: "finance",
        severity: "info",
        title: "Runway stable",
        why: "Runway above threshold.",
        confidence: 0.76,
        expectedImpact: "Maintain pace.",
        stale: false,
        evidence: [],
        actions: [],
      },
    ],
    bySection: {
      "website-traffic": [],
      "social-media": [],
      finance: [],
      "sales-pipeline": [],
      retention: [],
      "customer-success": [],
      "customer-journey": [],
      "demo-analytics": [],
      "process-analytics": [],
      revenue: [],
    },
  };
}

describe("AiInsightsPanel", () => {
  it("sorts by severity/confidence, supports filters, and shows stale badge", () => {
    const bundle = makeBundle();
    bundle.bySection["website-traffic"] = [bundle.global[0]];
    bundle.bySection.finance = [bundle.global[2]];
    bundle.bySection["sales-pipeline"] = [bundle.global[1]];
    bundle.bySection.retention = [];
    bundle.bySection["customer-success"] = [];
    bundle.bySection["customer-journey"] = [];
    bundle.bySection["demo-analytics"] = [];
    bundle.bySection["process-analytics"] = [];

    const { container } = render(<AiInsightsPanel bundle={bundle} defaultFilter="all" />);

    const cards = Array.from(container.querySelectorAll("article"));
    expect(cards.length).toBe(3);
    expect(cards[0].textContent).toContain("Pipeline conversion risk");
    expect(screen.getByText("stale data")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Revenue" }));
    expect(screen.getByText("Runway stable")).toBeTruthy();
    expect(screen.queryByText("Pipeline conversion risk")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Website" }));
    expect(screen.getByText("Ads efficiency trending down")).toBeTruthy();
    expect(screen.queryByText("Refactor campaign targeting")).toBeNull();
  });

  it("resets filter when defaultFilter prop changes", () => {
    const bundle = makeBundle();
    bundle.bySection["website-traffic"] = [bundle.global[0]];
    bundle.bySection.finance = [bundle.global[2]];
    bundle.bySection["sales-pipeline"] = [bundle.global[1]];
    bundle.bySection.retention = [];
    bundle.bySection["customer-success"] = [];
    bundle.bySection["customer-journey"] = [];
    bundle.bySection["demo-analytics"] = [];
    bundle.bySection["process-analytics"] = [];

    const { rerender } = render(
      <AiInsightsPanel bundle={bundle} defaultFilter="sales-pipeline" />
    );

    expect(screen.getByText("Pipeline conversion risk")).toBeTruthy();
    expect(screen.queryByText("Runway stable")).toBeNull();

    rerender(<AiInsightsPanel bundle={bundle} defaultFilter="finance" />);

    expect(screen.getByText("Runway stable")).toBeTruthy();
    expect(screen.queryByText("Pipeline conversion risk")).toBeNull();
  });
});
