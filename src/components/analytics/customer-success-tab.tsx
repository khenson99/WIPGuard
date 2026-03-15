"use client";

import Link from "next/link";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import type { CustomerSuccessPortfolio } from "@/lib/customer-success/types";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-error-banner";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardStaleBanner } from "@/components/dashboard/dashboard-stale-banner";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)}%`;
}

function formatDate(value?: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function relationshipTone(status?: string): string {
  if (status === "Healthy") return "text-[var(--success)]";
  if (status === "Watch" || status === "Onboarding Risk") return "text-[var(--warning)]";
  if (status === "At Risk" || status === "Billing Risk") return "text-red-500";
  return "text-muted-foreground";
}

type IntegrationStatus = "Not provisioned" | "Connected but stale" | "Active";

function deriveIntegrationStatus(input: {
  connected: boolean;
  stale: boolean;
  enabledRules: number;
  totalRules: number;
}): IntegrationStatus {
  if (!input.connected || input.totalRules === 0 || input.enabledRules === 0) {
    return "Not provisioned";
  }
  if (input.stale) {
    return "Connected but stale";
  }
  return "Active";
}

function statusClasses(status: IntegrationStatus): string {
  if (status === "Active") {
    return "border-[var(--success)]/40 bg-[var(--success)]/10 text-[var(--success)]";
  }
  if (status === "Connected but stale") {
    return "border-[var(--warning)]/40 bg-[var(--warning)]/10 text-[var(--warning)]";
  }
  return "border-border bg-secondary/30 text-muted-foreground";
}

function healthTone(score: number): string {
  if (score >= 80) return "text-[var(--success)]";
  if (score >= 65) return "text-[var(--warning)]";
  return "text-red-500";
}

function buildCombinedTrend(data: AnalyticsDashboardData | null): Array<{ date: string; total: number }> {
  if (!data) return [];
  const buckets = new Map<string, number>();
  const trendSources = [data.slack?.trend ?? [], data.googleWorkspace?.trend ?? [], data.codaOps?.trend ?? []];

  trendSources.forEach((trend) => {
    trend.forEach((item) => {
      buckets.set(item.date, (buckets.get(item.date) ?? 0) + item.createdTasks + item.receipts);
    });
  });

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7)
    .map(([date, total]) => ({ date, total }));
}

interface CSAction {
  title: string;
  detail: string;
  impact: string;
  severity: "critical" | "warning" | "info";
}

function deriveCSActions(input: {
  pylon: AnalyticsDashboardData["pylon"];
  product: AnalyticsDashboardData["product"];
  coda: AnalyticsDashboardData["coda"];
}): CSAction[] {
  const actions: CSAction[] = [];

  const urgent = input.pylon?.urgentConversations ?? 0;
  if (urgent > 15) {
    actions.push({
      title: "Rebalance urgent queue ownership",
      detail: `${urgent} urgent conversations exceed the 15-threshold. Assign a daily triage owner and enforce 2-hour response SLA.`,
      impact: "Expected: lower urgent backlog within 1 week.",
      severity: urgent > 25 ? "critical" : "warning",
    });
  }

  const backlogGrowth = input.product?.backlogGrowth ?? 0;
  if (backlogGrowth > 5) {
    actions.push({
      title: "Throttle backlog inflow",
      detail: `Backlog grew by ${backlogGrowth} net items. Route non-critical requests into weekly batches and prioritize customer-blocking items.`,
      impact: "Expected: improved throughput and queue stability.",
      severity: backlogGrowth > 15 ? "critical" : "warning",
    });
  }

  const throughputRate = input.product?.throughputRate ?? 100;
  if (throughputRate < 70) {
    actions.push({
      title: "Automate follow-up execution",
      detail: `Throughput at ${throughputRate.toFixed(1)}% — below 70% target. Use Slack/Coda workflows to auto-create and assign post-resolution follow-up tasks.`,
      impact: "Expected: faster closure and improved customer confidence.",
      severity: throughputRate < 50 ? "critical" : "warning",
    });
  }

  const overdueOpen = input.product?.overdueOpenTasks ?? 0;
  if (overdueOpen > 5) {
    actions.push({
      title: "Review overdue task assignments",
      detail: `${overdueOpen} tasks are overdue. Reassign or rescope blockers to restore delivery cadence.`,
      impact: "Expected: reduced retention risk from stalled execution.",
      severity: overdueOpen > 15 ? "critical" : "warning",
    });
  }

  if (actions.length === 0) {
    actions.push({
      title: "System operating within thresholds",
      detail: "All customer-success indicators are within acceptable ranges. No immediate intervention required.",
      impact: "Use this window to invest in proactive retention workflows.",
      severity: "info",
    });
  }

  return actions;
}

function CustomerSuccessPortfolioPanels() {
  const resource = useDashboardResource<CustomerSuccessPortfolio>({
    cacheKey: "customer-success:portfolio",
    deps: [],
    async load({ signal }) {
      const response = await fetch("/api/customer-success/portfolio", {
        cache: "no-store",
        signal,
      });
      const body = (await response.json()) as CustomerSuccessPortfolio | { error?: string };
      if (!response.ok) {
        throw new Error(body && "error" in body && body.error ? body.error : "Failed to load customer success portfolio");
      }
      return body as CustomerSuccessPortfolio;
    },
    getLastUpdatedAt: (payload) => payload.generatedAt,
  });

  if (resource.loading && !resource.data) {
    return <DashboardLoadingState message="Loading customer-success portfolio..." className="h-64" />;
  }

  if (resource.error && !resource.data) {
    return <DashboardErrorBanner message={resource.error} />;
  }

  if (!resource.data) {
    return <DashboardErrorBanner message="Customer-success portfolio data is unavailable." />;
  }

  const portfolio = resource.data;
  const accountsWithCoda = portfolio.accounts.filter((account) => !(account.relationship?.missingSources ?? []).includes("coda")).length;
  const coverageGaps = portfolio.accounts.filter((account) => (account.relationship?.missingSources.length ?? 0) > 0).length;

  return (
    <div className="space-y-4">
      {resource.stale && resource.error ? (
        <DashboardStaleBanner
          label={resource.error}
          lastUpdatedAt={resource.lastUpdatedAt}
          onRefresh={resource.refresh}
          refreshing={resource.refreshing}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Customer Records</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{formatNumber(portfolio.summary.totalAccounts)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Average Health</p>
          <p className={`mt-1 text-2xl font-semibold ${healthTone(portfolio.summary.avgHealthScore)}`}>
            {formatNumber(portfolio.summary.avgHealthScore)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">At-Risk Accounts</p>
          <p className="mt-1 text-2xl font-semibold text-red-500">{formatNumber(portfolio.summary.atRiskAccounts)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Open Alerts</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{formatNumber(portfolio.summary.openAlerts)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Accounts With Coda</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{formatNumber(accountsWithCoda)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Coverage Gaps</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--warning)]">{formatNumber(coverageGaps)}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Health Distribution</h3>
          <div className="mt-4 space-y-3">
            {portfolio.healthDistribution.map((bucket) => (
              <div key={bucket.label} className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                <p className="text-sm text-foreground">Grade {bucket.label}</p>
                <p className="text-sm font-medium text-foreground">{formatNumber(bucket.count)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Attention Queue</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Accounts that need an owner action or escalation next.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {portfolio.attentionAccounts.map((account) => (
              <div key={account.accountId} className="rounded-xl border border-border bg-background p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <Link
                      href={`/analytics/customer-success/accounts/${account.accountId}`}
                      className="text-sm font-medium text-foreground hover:text-primary"
                    >
                      {account.name}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {account.lifecycleStage} • {account.ownerName || "Unassigned"} • {account.openAlertCount} open alerts
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {account.relationship?.connectedSystems ?? 0} systems
                      {account.relationship?.implementationStage ? ` • ${account.relationship.implementationStage}` : ""}
                      {account.relationship?.missingSources.length
                        ? ` • Missing ${account.relationship.missingSources.join(", ")}`
                        : ""}
                    </p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className={`text-sm font-semibold ${healthTone(account.health.score)}`}>
                      {account.health.grade} {formatNumber(account.health.score)}
                    </p>
                    {account.relationship?.retentionStatus ? (
                      <p className={`mt-1 text-xs ${relationshipTone(account.relationship.retentionStatus)}`}>
                        {account.relationship.retentionStatus}
                        {account.relationship.primaryLirPassed !== undefined
                          ? ` • LIR ${account.relationship.primaryLirPassed ? "pass" : "fail"}`
                          : ""}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">{account.nextAction || "Review account workspace"}</p>
                  </div>
                </div>
              </div>
            ))}
            {portfolio.attentionAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No accounts currently need intervention.</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Open Alerts</h3>
          <div className="mt-4 space-y-3">
            {portfolio.alerts.slice(0, 6).map((alert) => (
              <div key={alert.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">{alert.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {alert.severity} • {alert.slaStatus}
                  </p>
                </div>
                {alert.suggestedAction ? (
                  <p className="mt-1 text-xs text-muted-foreground">{alert.suggestedAction}</p>
                ) : null}
                <p className="mt-2 text-[11px] text-muted-foreground">{alert.accountId}</p>
              </div>
            ))}
            {portfolio.alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No customer-success alerts yet.</p>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
          <div className="mt-4 space-y-3">
            {portfolio.recentActivity.slice(0, 6).map((event) => (
              <div key={event.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">{event.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(event.occurredAt)}</p>
                </div>
                {event.description ? <p className="mt-1 text-xs text-muted-foreground">{event.description}</p> : null}
              </div>
            ))}
            {portfolio.recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity recorded.</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Portfolio Accounts</h3>
            <p className="mt-1 text-xs text-muted-foreground">Customer record summary with drill-through into the account workspace.</p>
          </div>
          <p className="text-xs text-muted-foreground">Updated {formatDate(portfolio.generatedAt)}</p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 font-medium">Account</th>
                <th className="pb-2 font-medium">Owner</th>
                <th className="pb-2 font-medium">Health</th>
                <th className="pb-2 font-medium">Retention</th>
                <th className="pb-2 font-medium">Systems</th>
                <th className="pb-2 font-medium">Alerts</th>
                <th className="pb-2 font-medium">Last Activity</th>
                <th className="pb-2 font-medium">Renewal</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.accounts.map((account) => (
                <tr key={account.accountId} className="border-b border-border/50 last:border-0">
                  <td className="py-3">
                    <Link
                      href={`/analytics/customer-success/accounts/${account.accountId}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {account.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {account.segment || "—"} {account.tier ? `• ${account.tier}` : ""}
                    </div>
                  </td>
                  <td className="py-3 text-muted-foreground">{account.ownerName || "Unassigned"}</td>
                  <td className={`py-3 font-medium ${healthTone(account.health.score)}`}>
                    {account.health.grade} {formatNumber(account.health.score)}
                  </td>
                  <td className={`py-3 text-sm ${relationshipTone(account.relationship?.retentionStatus)}`}>
                    {account.relationship?.retentionStatus || "—"}
                    {account.relationship?.primaryLirPassed !== undefined ? (
                      <div className="text-xs text-muted-foreground">
                        LIR {account.relationship.primaryLirPassed ? "pass" : "fail"}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-3 text-muted-foreground">
                    {formatNumber(account.relationship?.connectedSystems)}
                    {account.relationship?.missingSources.length ? (
                      <div className="text-xs text-[var(--warning)]">
                        Missing {account.relationship.missingSources.join(", ")}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-3 text-muted-foreground">{formatNumber(account.openAlertCount)}</td>
                  <td className="py-3 text-muted-foreground">{formatDate(account.lastActivityAt)}</td>
                  <td className="py-3 text-muted-foreground">{formatDate(account.renewalDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function CustomerSuccessTab({ data }: { data: AnalyticsDashboardData | null }) {
  const pylon = data?.pylon;
  const coda = data?.coda;
  const product = data?.product;
  const googleWorkspace = data?.googleWorkspace;
  const slackOps = data?.slack;
  const codaOps = data?.codaOps;
  const trend = buildCombinedTrend(data);
  const maxTrend = Math.max(1, ...trend.map((item) => item.total));

  const integrationStatuses = [
    {
      label: "Google Workspace",
      status: deriveIntegrationStatus({
        connected: data?.freshness.google_workspace?.status === "CONNECTED",
        stale: Boolean(data?.freshness.google_workspace?.stale),
        enabledRules: googleWorkspace?.enabledRules ?? 0,
        totalRules: googleWorkspace?.totalRules ?? 0,
      }),
      details: `${googleWorkspace?.enabledRules ?? 0}/${googleWorkspace?.totalRules ?? 0} rules enabled`,
    },
    {
      label: "Slack",
      status: deriveIntegrationStatus({
        connected: data?.freshness.slack?.status === "CONNECTED",
        stale: Boolean(data?.freshness.slack?.stale),
        enabledRules: slackOps?.enabledRules ?? 0,
        totalRules: slackOps?.totalRules ?? 0,
      }),
      details: `${slackOps?.enabledRules ?? 0}/${slackOps?.totalRules ?? 0} rules enabled`,
    },
    {
      label: "Coda",
      status: deriveIntegrationStatus({
        connected: data?.freshness.coda?.status === "CONNECTED",
        stale: Boolean(data?.freshness.coda?.stale),
        enabledRules: codaOps?.enabledRules ?? 0,
        totalRules: codaOps?.totalRules ?? 0,
      }),
      details: `${codaOps?.enabledRules ?? 0}/${codaOps?.totalRules ?? 0} rules enabled`,
    },
  ];

  const hasLegacyAnalytics = Boolean(pylon || coda || product);
  const riskItems = [
    {
      id: "urgent",
      label: "Urgent Support Load",
      value: pylon?.urgentConversations ?? 0,
      threshold: 10,
      description: "High urgent queue can increase churn risk.",
    },
    {
      id: "backlog",
      label: "Backlog Growth",
      value: product?.backlogGrowth ?? 0,
      threshold: 1,
      description: "Growing backlog can degrade response quality.",
    },
    {
      id: "overdue",
      label: "Overdue Open Tasks",
      value: product?.overdueOpenTasks ?? 0,
      threshold: 5,
      description: "Overdue execution creates retention delays.",
    },
  ];
  const actions = deriveCSActions({ pylon: pylon ?? null, product: product ?? null, coda: coda ?? null });

  return (
    <div className="space-y-4">
      <CustomerSuccessPortfolioPanels />

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

      {!hasLegacyAnalytics ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Portfolio data is available, but customer-success integration analytics are not configured for the selected range.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Open Pylon Conversations</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{pylon?.openConversations ?? "—"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Urgent Conversations</p>
              <p className="mt-1 text-2xl font-semibold text-red-500">{pylon?.urgentConversations ?? "—"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Product Throughput</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{formatPct(product?.throughputRate)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Coda Cards</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{coda?.totalCards ?? "—"}</p>
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
      )}
    </div>
  );
}
