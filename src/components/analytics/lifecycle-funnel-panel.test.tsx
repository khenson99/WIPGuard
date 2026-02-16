import { fireEvent, render, screen } from "@testing-library/react";
import { LifecycleFunnelPanel } from "@/components/analytics/lifecycle-funnel-panel";
import type { AiInsight, LifecycleFunnelData } from "@/lib/analytics/types";

function makeLifecycle(): LifecycleFunnelData {
  return {
    generatedAt: "2026-01-30T00:00:00.000Z",
    stages: [
      {
        id: "awareness",
        label: "Awareness",
        volume: 1000,
        conversionFromPrevious: null,
        trendDeltaPct: 10,
        confidence: 0.91,
        section: "ads-traffic",
        evidence: [
          {
            source: "Google Analytics",
            domain: "googleAnalytics",
            contribution: 800,
            share: 80,
            confidence: 0.9,
            detail: "Unique users in range",
          },
        ],
      },
      {
        id: "acquisition",
        label: "Acquisition",
        volume: 500,
        conversionFromPrevious: 50,
        trendDeltaPct: 7,
        confidence: 0.85,
        section: "ads-traffic",
        evidence: [
          {
            source: "Google Ads",
            domain: "googleAds",
            contribution: 300,
            share: 60,
            confidence: 0.82,
            detail: "Paid clicks in range",
          },
        ],
      },
      {
        id: "activation",
        label: "Activation",
        volume: 220,
        conversionFromPrevious: 44,
        trendDeltaPct: -2,
        confidence: 0.79,
        section: "sales-pipeline",
        evidence: [
          {
            source: "HubSpot",
            domain: "hubspot",
            contribution: 200,
            share: 90.9,
            confidence: 0.87,
            detail: "Demo scheduled + follow-up",
          },
        ],
      },
      {
        id: "revenue",
        label: "Revenue",
        volume: 140,
        conversionFromPrevious: 63.6,
        trendDeltaPct: 3.5,
        confidence: 0.83,
        section: "finance",
        evidence: [],
      },
      {
        id: "retention",
        label: "Retention",
        volume: 110,
        conversionFromPrevious: 78.6,
        trendDeltaPct: 1.2,
        confidence: 0.8,
        section: "customer-success",
        evidence: [],
      },
      {
        id: "expansion",
        label: "Expansion",
        volume: 70,
        conversionFromPrevious: 63.6,
        trendDeltaPct: 4.4,
        confidence: 0.77,
        section: "customer-success",
        evidence: [],
      },
    ],
    transitions: [
      {
        id: "awareness->acquisition",
        fromStageId: "awareness",
        toStageId: "acquisition",
        fromVolume: 1000,
        toVolume: 500,
        dropoff: 500,
        conversionRate: 50,
        trendDeltaPct: -3,
      },
      {
        id: "acquisition->activation",
        fromStageId: "acquisition",
        toStageId: "activation",
        fromVolume: 500,
        toVolume: 220,
        dropoff: 280,
        conversionRate: 44,
        trendDeltaPct: -9,
      },
      {
        id: "activation->revenue",
        fromStageId: "activation",
        toStageId: "revenue",
        fromVolume: 220,
        toVolume: 140,
        dropoff: 80,
        conversionRate: 63.6,
        trendDeltaPct: 5.5,
      },
      {
        id: "revenue->retention",
        fromStageId: "revenue",
        toStageId: "retention",
        fromVolume: 140,
        toVolume: 110,
        dropoff: 30,
        conversionRate: 78.6,
        trendDeltaPct: -2.3,
      },
      {
        id: "retention->expansion",
        fromStageId: "retention",
        toStageId: "expansion",
        fromVolume: 110,
        toVolume: 70,
        dropoff: 40,
        conversionRate: 63.6,
        trendDeltaPct: 1.1,
      },
    ],
    narrative: [],
  };
}

function makeInsights(): AiInsight[] {
  return [
    {
      id: "ai-ads",
      section: "ads-traffic",
      severity: "warning",
      title: "Improve paid traffic quality",
      why: "Bounce rising.",
      confidence: 0.81,
      expectedImpact: "Higher landing conversion.",
      stale: false,
      evidence: [],
      actions: [],
    },
    {
      id: "ai-sales",
      section: "sales-pipeline",
      severity: "critical",
      title: "Demo no-show leak detected",
      why: "No-show elevated.",
      confidence: 0.9,
      expectedImpact: "Recover demo conversion.",
      stale: true,
      evidence: [],
      actions: [],
    },
  ];
}

describe("LifecycleFunnelPanel", () => {
  it("supports click, hover, and view toggles", () => {
    render(<LifecycleFunnelPanel lifecycle={makeLifecycle()} insights={makeInsights()} sectionFocus="all" />);

    expect(screen.getByText("Customer Lifecycle Funnel")).toBeTruthy();
    expect(screen.getByText("Evidence: Awareness")).toBeTruthy();
    expect(screen.getByText("1,000")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Conversion" }));
    expect(screen.getByText("50.0%")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Acquisition/ }));
    expect(screen.getByText("Evidence: Acquisition")).toBeTruthy();
    expect(screen.getByText("acquisition -> activation")).toBeTruthy();

    fireEvent.mouseEnter(screen.getByRole("button", { name: /Activation/ }));
    expect(screen.getByText("Evidence: Activation")).toBeTruthy();
    fireEvent.mouseLeave(screen.getByRole("button", { name: /Activation/ }));
    expect(screen.getByText("Evidence: Acquisition")).toBeTruthy();
  });
});
