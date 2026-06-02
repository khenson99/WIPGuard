import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  IntegrationDeliveryStatusPanel,
  LegacyCustomerSuccessAnalytics,
} from "@/components/analytics/customer-success-operational-sections";

describe("customer-success-operational-sections", () => {
  it("renders integration delivery statuses", () => {
    render(
      <IntegrationDeliveryStatusPanel
        integrationStatuses={[
          {
            label: "Google Workspace",
            status: "Active",
            details: "1/1 rules enabled",
          },
          {
            label: "Slack",
            status: "Connected but stale",
            details: "2/3 rules enabled",
          },
          {
            label: "Coda",
            status: "Not provisioned",
            details: "0/0 rules enabled",
          },
        ]}
      />
    );

    expect(screen.getByText("Integration Delivery Status")).toBeTruthy();
    expect(screen.getByText("Google Workspace")).toBeTruthy();
    expect(screen.getByText("Connected but stale")).toBeTruthy();
    expect(screen.getByText("0/0 rules enabled")).toBeTruthy();
  });

  it("renders the portfolio-only fallback when legacy analytics are unavailable", () => {
    render(
      <LegacyCustomerSuccessAnalytics
        actions={[]}
        codaCards="—"
        hasLegacyAnalytics={false}
        maxTrend={1}
        openConversations="—"
        riskItems={[]}
        deliveryRateLabel="—"
        trend={[]}
        urgentConversations="—"
      />
    );

    expect(
      screen.getByText(
        "Portfolio data is available, but customer-success integration analytics are not configured for the selected range."
      )
    ).toBeTruthy();
  });

  it("renders trend, risks, and recommended actions when legacy analytics are available", () => {
    render(
      <LegacyCustomerSuccessAnalytics
        actions={[
          {
            title: "Rebalance urgent queue ownership",
            detail: "18 urgent conversations exceed the 15-threshold.",
            impact: "Expected: lower urgent backlog within 1 week.",
            severity: "warning",
          },
        ]}
        codaCards={42}
        hasLegacyAnalytics
        maxTrend={10}
        openConversations={28}
        riskItems={[
          {
            id: "urgent",
            label: "Urgent Support Load",
            value: 18,
            threshold: 10,
            description: "High urgent queue can increase churn risk.",
          },
        ]}
        deliveryRateLabel="62.4%"
        trend={[{ date: "2026-03-08", total: 10 }]}
        urgentConversations={18}
      />
    );

    expect(screen.getByText("Open Pylon Conversations")).toBeTruthy();
    expect(screen.getByText("Customer Ops Trend (7 buckets)")).toBeTruthy();
    expect(screen.getByText("Top Risks")).toBeTruthy();
    expect(screen.getByText("Urgent Support Load:")).toBeTruthy();
    expect(screen.getByText("Recommended Actions")).toBeTruthy();
    expect(screen.getByText("Rebalance urgent queue ownership")).toBeTruthy();
  });
});
