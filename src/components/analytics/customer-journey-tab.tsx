"use client";

import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { CustomerJourneyDashboard } from "./customer-journey-page";

export function CustomerJourneyTab({ data }: { data: AnalyticsDashboardData | null }) {
  if (!data) {
    return (
      <DashboardEmptyState
        title="Customer journey unavailable"
        message="No journey data is available for this section."
      />
    );
  }

  const hasJourneySignal = Boolean(
    (data.customerJourney?.journeys.length ?? 0) > 0 ||
      (data.hubspot?.funnel.totalDeals ?? 0) > 0 ||
      (data.googleAnalytics?.sessions30d ?? 0) > 0 ||
      (data.stripe?.subscriptions.active ?? 0) > 0,
  );

  if (!hasJourneySignal) {
    return (
      <DashboardEmptyState
        title="No customer journey data yet"
        message="Connect acquisition, CRM, billing, and support sources to map the journey from traffic through retention."
      />
    );
  }

  return <CustomerJourneyDashboard data={data} />;
}
