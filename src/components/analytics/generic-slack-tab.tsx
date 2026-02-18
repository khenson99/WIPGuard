"use client";

import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { FinanceDataEmptyState } from "@/components/analytics/finance-empty-state";
import { TelemetryDashboard } from "./generic-workspace-tab";

interface GenericSlackTabProps {
  data: AnalyticsDashboardData | null;
}

export function GenericSlackTab({ data }: GenericSlackTabProps) {
  const slack = data?.slack;
  const reasons = [
    ...(data?.errors ?? [])
      .filter((entry) => entry.source === "slack")
      .map((entry) => entry.message),
    ...(data?.freshness?.slack?.lastError ? [data.freshness.slack.lastError] : []),
  ];

  if (!slack) {
    return <FinanceDataEmptyState provider="Slack" reasons={reasons} />;
  }

  return <TelemetryDashboard telemetry={slack} label="Slack" />;
}
