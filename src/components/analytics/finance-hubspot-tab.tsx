"use client";

import type { AnalyticsDashboardData, DealStage } from "@/lib/analytics/types";
import { FinanceDataEmptyState } from "@/components/analytics/finance-empty-state";

interface FinanceHubSpotTabProps {
  data: AnalyticsDashboardData | null;
}

const FINANCE_STAGE_ORDER = [
  "Budgetary Quote Sent",
  "Payment Link Sent",
  "Free Trial",
  "Freemium",
  "Subscription",
  "Closed Won",
  "Churn",
] as const;

function fmt$(n: number): string {
  if (n === 0) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function orderedFinanceStages(stages: DealStage[]): DealStage[] {
  return FINANCE_STAGE_ORDER
    .map((label) => stages.find((stage) => stage.label === label))
    .filter((stage): stage is DealStage => Boolean(stage));
}

export function FinanceHubSpotTab({ data }: FinanceHubSpotTabProps) {
  const hubspot = data?.hubspot;
  const reasons = [
    ...(data?.errors ?? [])
      .filter((entry) => entry.source === "hubspot" || entry.source === "hubspotOps")
      .map((entry) => entry.message),
    ...(data?.freshness?.hubspot?.lastError ? [data.freshness.hubspot.lastError] : []),
  ];

  if (!hubspot) {
    return (
      <FinanceDataEmptyState
        title="HubSpot finance lifecycle data is unavailable"
        message="We could not load HubSpot revenue-stage analytics for this range."
        reasons={reasons}
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  const stages = orderedFinanceStages(hubspot.funnel.stages);
  const totalValue = stages.reduce((sum, stage) => sum + stage.value, 0);

  if (stages.length === 0) {
    return (
      <FinanceDataEmptyState
        title="No finance-stage HubSpot deals found"
        message="HubSpot is connected, but no deals are currently in quote, payment, trial, subscription, closed-won, or churn stages."
        reasons={reasons}
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Revenue Lifecycle Deals</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {stages.reduce((sum, stage) => sum + stage.count, 0)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Lifecycle Pipeline Value</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{fmt$(totalValue)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Churned Deals</p>
          <p className="mt-1 text-2xl font-semibold text-red-500">{hubspot.funnel.churn}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Finance Lifecycle Stages</h3>
        <div className="mt-3 space-y-2">
          {stages.map((stage) => (
            <div
              key={stage.stageId}
              className="flex items-center justify-between rounded-md border border-border/70 bg-background px-3 py-2"
            >
              <p className="text-sm text-foreground">{stage.label}</p>
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">{stage.count}</p>
                <p className="text-xs text-muted-foreground">{fmt$(stage.value)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
