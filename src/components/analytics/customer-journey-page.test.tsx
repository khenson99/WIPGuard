import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CustomerJourneyDashboard } from "@/components/analytics/customer-journey-page";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";

function makeData() {
  const data = createEmptyAnalyticsDashboardData({
    freshness: {},
    timeRange: {
      preset: "30d",
      from: "2026-01-01",
      to: "2026-01-30",
      days: 30,
      label: "Last 30 days",
    },
  });

  data.googleAnalytics = {
    sessions30d: 1000,
    sessionsPrev30d: 900,
    users30d: 700,
    usersPrev30d: 650,
    pageviews30d: 3000,
    avgSessionDuration: 120,
    bounceRate: 42,
    topPages: [],
    trafficByChannel: [],
    conversions: [],
    events: [],
    _meta: {
      fetchedAt: "2026-01-30T00:00:00.000Z",
      nextRefresh: "2026-01-30T01:00:00.000Z",
      source: "live",
    },
  };

  data.hubspot = {
    funnel: {
      totalDeals: 40,
      closedWon: 10,
      closedLost: 3,
      unlikely: 2,
      churn: 1,
      activeSubscriptions: 8,
      noShows: 4,
      demoScheduled: 18,
      demoFollowUp: 2,
      avgDealSize: 12000,
      winRate: 25,
      effectiveWinRate: 25,
      noShowRate: 22,
      stages: [],
      dealsBySource: [],
    },
    contacts: {
      totalContacts: 100,
      recentContacts: 90,
      bySource: [],
    },
    _meta: {
      fetchedAt: "2026-01-30T00:00:00.000Z",
      nextRefresh: "2026-01-30T01:00:00.000Z",
      source: "live",
    },
  };

  data.stripe = {
    revenue: {
      mrr: 25000,
      mrrChange: 0.1,
      totalRevenue30d: 30000,
      totalRevenuePrev30d: 27000,
      revenueGrowth: 0.11,
      avgRevenuePerCustomer: 3200,
    },
    subscriptions: {
      active: 8,
      pastDue: 1,
      canceled: 1,
      trialing: 2,
      churnRate: 0.03,
      recentChurnEvents: [{ customerId: "c1", customerName: "Acme", date: "2026-01-20", revenueImpact: 1000 }],
    },
    payments: { succeeded: 30, failed: 1, successRate: 0.97 },
    revenueTrend: [],
    _meta: {
      fetchedAt: "2026-01-30T00:00:00.000Z",
      nextRefresh: "2026-01-30T01:00:00.000Z",
      source: "live",
    },
  };

  data.pylon = {
    openConversations: 14,
    urgentConversations: 6,
    closedConversations: 40,
    resolvedInRange: 32,
    avgFirstResponseMinutes: 18,
    avgResolutionHours: 6,
    csat: 92,
    topIssueCategories: [],
    recentAccounts: [],
    _meta: {
      fetchedAt: "2026-01-30T00:00:00.000Z",
      nextRefresh: "2026-01-30T01:00:00.000Z",
      source: "live",
    },
  };

  data.lifecycleFunnel = {
    stages: [
      { id: "awareness", label: "Awareness", volume: 1000, conversionRate: 100 },
      { id: "acquisition", label: "Acquisition", volume: 90, conversionRate: 9 },
      { id: "retention", label: "Retention", volume: 7, conversionRate: 70 },
    ],
    transitions: [],
    topLeaks: [],
  };

  data.financialPlanning = {
    budgets: [],
    activeBudget: null,
    forecasts: [],
    goals: [],
    pnl: null,
    unitEconomics: null,
    subscriptionOverview: {
      mergedActiveSubscriptions: 8,
      stripeActiveSubscriptions: 8,
      hubspotActiveSubscriptions: 7,
    },
  };

  data.customerJourney = {
    journeys: [
      {
        dealId: "deal-1",
        dealName: "Acme Expansion",
        contactEmail: "team@acme.com",
        currentStage: "Demo",
        value: 12000,
        touchpoints: [
          { timestamp: "2026-01-01T00:00:00.000Z", channel: "google-ads", type: "first-touch", detail: "Ad click", value: null },
          { timestamp: "2026-01-10T00:00:00.000Z", channel: "hubspot", type: "conversion", detail: "Demo booked", value: 12000 },
        ],
        firstTouch: "2026-01-01T00:00:00.000Z",
        lastTouch: "2026-01-10T00:00:00.000Z",
        daysInPipeline: 48,
      },
    ],
    touchpointSummary: [
      { channel: "google-ads", totalTouchpoints: 10, avgPerJourney: 1.5, firstTouchCount: 4, conversionCount: 2 },
    ],
    avgTouchpoints: 2.1,
    medianDaysToClose: 32,
    topPaths: [
      {
        sequence: ["google-ads", "hubspot", "stripe"],
        count: 4,
        kanbanCards: 1,
        freeTrials: 2,
        demos: 3,
        avgDaysToClose: 28,
        avgValue: 9000,
      },
    ],
    attribution: [
      {
        channel: "google-ads",
        traffic: 1000,
        cost: 1500,
        firstTouchDeals: 4,
        assistedDeals: 2,
        lastTouchDeals: 1,
        kanbanCards: 1,
        freeTrials: 2,
        demos: 3,
        totalRevenue: 24000,
        avgDealValue: 6000,
        roi: 16,
      },
    ],
    stageOrder: ["awareness", "acquisition", "retention"],
    stageOrderSource: "pipeline",
  };

  return data;
}

describe("CustomerJourneyDashboard", () => {
  it("renders actionable journey sections instead of only summary cards", () => {
    render(<CustomerJourneyDashboard data={makeData()} />);

    expect(screen.getByText("Weakest Handoff")).toBeTruthy();
    expect(screen.getByText("Stage Drop-Offs")).toBeTruthy();
    expect(screen.getByText("Revenue Leader")).toBeTruthy();
    expect(screen.getByText("Channel Attribution")).toBeTruthy();
    expect(screen.getByText("Pipeline Friction")).toBeTruthy();
    expect(screen.getByText("Best ROI channel")).toBeTruthy();
    expect(screen.getByText("Acme Expansion")).toBeTruthy();
    expect(screen.getAllByText("Google Ads").length).toBeGreaterThan(0);
    expect(screen.getAllByText("16.0%").length).toBeGreaterThan(0);
    expect(screen.getByText("Long cycle")).toBeTruthy();
    expect(screen.getByText("High value")).toBeTruthy();
  });
});
