"use client";

import type {
  CSAction,
  CustomerOpsTrendPoint,
  IntegrationStatus,
  IntegrationStatusItem,
  RiskItem,
} from "@/components/analytics/customer-success-operational-view-model";

function statusClasses(status: IntegrationStatus): string {
  if (status === "Active") {
    return "border-[var(--success)]/40 bg-[var(--success)]/10 text-[var(--success)]";
  }
  if (status === "Connected but stale") {
    return "border-[var(--warning)]/40 bg-[var(--warning)]/10 text-[var(--warning)]";
  }
  return "border-border bg-secondary/30 text-muted-foreground";
}

export function IntegrationDeliveryStatusPanel({
  integrationStatuses,
}: {
  integrationStatuses: IntegrationStatusItem[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">Integration Delivery Status</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Operational state for customer-success integrations.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
        {integrationStatuses.map((item) => (
          <div key={item.label} className="rounded-md border border-border bg-secondary/20 px-3 py-2">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs ${statusClasses(item.status)}`}>
              {item.status}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">{item.details}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LegacyCustomerSuccessAnalytics({
  actions,
  codaCards,
  hasLegacyAnalytics,
  maxTrend,
  openConversations,
  riskItems,
  deliveryRateLabel,
  trend,
  urgentConversations,
}: {
  actions: CSAction[];
  codaCards: number | string;
  hasLegacyAnalytics: boolean;
  maxTrend: number;
  openConversations: number | string;
  riskItems: RiskItem[];
  deliveryRateLabel: string;
  trend: CustomerOpsTrendPoint[];
  urgentConversations: number | string;
}) {
  if (!hasLegacyAnalytics) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Portfolio data is available, but customer-success integration analytics are not configured for the selected range.
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Open Pylon Conversations</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{openConversations}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Urgent Conversations</p>
          <p className="mt-1 text-2xl font-semibold text-red-500">{urgentConversations}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Product Throughput</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{deliveryRateLabel}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Coda Cards</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{codaCards}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">Customer Ops Trend (7 buckets)</h3>
        {trend.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No workflow trend available in this range.</p>
        ) : (
          <div className="mt-3 grid grid-cols-7 gap-2">
            {trend.map((item) => {
              const height = Math.max(10, Math.round((item.total / maxTrend) * 100));
              return (
                <div key={item.date} className="flex flex-col items-center gap-1">
                  <div className="flex h-24 w-full items-end">
                    <div className="w-full rounded-sm bg-primary/75" style={{ height: `${height}%` }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground">{item.date.slice(5)}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Top Risks</h3>
          <div className="mt-3 space-y-2">
            {riskItems.map((risk) => {
              const isHigh = risk.value >= risk.threshold;
              return (
                <div
                  key={risk.id}
                  className={`rounded-md border px-3 py-2 ${
                    isHigh ? "border-red-500/30 bg-red-500/10" : "border-border/60 bg-background"
                  }`}
                >
                  <p className="text-xs font-medium text-foreground">
                    {risk.label}: <span className={isHigh ? "text-red-500" : "text-foreground"}>{risk.value}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">{risk.description}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Recommended Actions</h3>
          <div className="mt-3 space-y-2">
            {actions.map((action) => {
              const borderColor =
                action.severity === "critical"
                  ? "border-red-500/30 bg-red-500/5"
                  : action.severity === "warning"
                    ? "border-yellow-500/30 bg-yellow-500/5"
                    : "border-border/60 bg-background";
              const titleColor =
                action.severity === "critical"
                  ? "text-red-500"
                  : action.severity === "warning"
                    ? "text-yellow-500"
                    : "text-foreground";
              return (
                <div key={action.title} className={`rounded-md border ${borderColor} px-3 py-2`}>
                  <p className={`text-xs font-medium ${titleColor}`}>{action.title}</p>
                  <p className="text-[11px] text-muted-foreground">{action.detail}</p>
                  <p className="mt-0.5 text-[11px] text-foreground">{action.impact}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
