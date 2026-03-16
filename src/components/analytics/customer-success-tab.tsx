"use client";

import Link from "next/link";
import { useState } from "react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import type { CustomerSuccessPortfolio } from "@/lib/customer-success/types";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-error-banner";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardStaleBanner } from "@/components/dashboard/dashboard-stale-banner";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";

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

function syncRunTone(status: "SUCCESS" | "PARTIAL" | "ERROR"): string {
  if (status === "SUCCESS") return "border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]";
  if (status === "PARTIAL") return "border-[var(--warning)]/30 bg-[var(--warning)]/10 text-[var(--warning)]";
  return "border-red-500/30 bg-red-500/10 text-red-500";
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

function describeRelationshipArdaMode(
  relationship?: CustomerSuccessPortfolio["accounts"][number]["relationship"]
): string | null {
  if (!relationship) return null;
  if (relationship.ardaAdoptionCountsSource === "ARDA_USER_DETAILS") {
    return "Arda fallback";
  }
  if (relationship.ardaAdoptionCountsSource === "ARDA_ACTIVITY") {
    return "Arda activity";
  }
  return null;
}

function buildCombinedActivityTrend(data: AnalyticsDashboardData | null): Array<{ date: string; total: number }> {
  if (!data) return [];
  const buckets = new Map<string, number>();
  const trendSources = [data.slack?.trend ?? [], data.googleWorkspace?.trend ?? [], data.codaOps?.trend ?? []];

  trendSources.forEach((trend) => {
    trend.forEach((item) => {
      buckets.set(
        item.date,
        (buckets.get(item.date) ?? 0) + item.automationsTriggered + item.receipts,
      );
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

  const waitingOnTeam = input.pylon?.waitingOnTeam ?? 0;
  if (waitingOnTeam > 8) {
    actions.push({
      title: "Clear the waiting-on-team queue",
      detail: `${waitingOnTeam} conversations are waiting on the internal team. Assign owners and publish a twice-daily update cadence until that queue is back under control.`,
      impact: "Expected: faster customer updates and fewer support escalations.",
      severity: waitingOnTeam > 15 ? "critical" : "warning",
    });
  }

  const avgFirstResponse = input.pylon?.avgFirstResponseMinutes ?? null;
  if (avgFirstResponse !== null && avgFirstResponse > 120) {
    actions.push({
      title: "Tighten first-response coverage",
      detail: `Average first response is ${avgFirstResponse.toFixed(0)} minutes. Expand triage coverage windows or add routing for high-priority accounts.`,
      impact: "Expected: lower time-to-first-response and better queue health.",
      severity: avgFirstResponse > 240 ? "critical" : "warning",
    });
  }

  if ((input.coda?.totalCards ?? 0) === 0) {
    actions.push({
      title: "Restore customer ops coverage",
      detail: "No Coda-backed customer-ops records were found in the selected range. Verify the shared success workspace and onboarding trackers are still syncing.",
      impact: "Expected: better account visibility and clearer follow-up coverage.",
      severity: "info",
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
  const [syncingRelationships, setSyncingRelationships] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
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
  const missingCodaAccounts = portfolio.accounts.filter((account) => (account.relationship?.missingSources ?? []).includes("coda"));
  const lirFailAccounts = portfolio.accounts.filter((account) => account.relationship?.primaryLirPassed === false);
  const implementationBlockedAccounts = portfolio.accounts.filter((account) =>
    (account.relationship?.implementationStage ?? "").toLowerCase().includes("blocked")
  );
  const ardaFallbackAccounts = portfolio.accounts.filter(
    (account) => account.relationship?.ardaAdoptionCountsSource === "ARDA_USER_DETAILS"
  );

  async function syncRelationshipData() {
    setSyncError(null);
    setSyncMessage(null);
    setSyncingRelationships(true);
    try {
      const response = await fetch("/api/retention/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "full" }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; completed?: string[] };
      if (!response.ok) {
        throw new Error(body.error || `Retention sync failed (${response.status})`);
      }
      await resource.refresh();
      setSyncMessage(
        body.completed && body.completed.length > 0
          ? `Relationship data synced: ${body.completed.join(", ")}`
          : "Relationship data synced."
      );
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Retention sync failed");
    } finally {
      setSyncingRelationships(false);
    }
  }

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

      {syncError ? <DashboardErrorBanner message={syncError} onRetry={syncRelationshipData} /> : null}
      {syncMessage ? (
        <div className="rounded-xl border border-[var(--success)]/30 bg-[var(--success)]/10 px-4 py-3 text-sm text-[var(--success)]">
          {syncMessage}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Customer Relationship Portfolio</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Unified Coda, retention, and customer-success state across the portfolio.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void syncRelationshipData()}
          disabled={syncingRelationships}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          {syncingRelationships ? "Syncing relationship data..." : "Sync relationship data"}
        </button>
      </div>

      {portfolio.relationshipOps?.sources.length ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Relationship Freshness</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Last completed rebuild {formatDate(portfolio.relationshipOps.lastCompletedAt)}.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {portfolio.relationshipOps.sources.map((run) => (
              <span
                key={run.source}
                title={run.lastError || `${run.recordCount} records · ${run.mappedCount} mapped`}
                className={`rounded-full border px-2 py-1 text-[11px] ${syncRunTone(run.status)}`}
              >
                {run.source.toLowerCase()} {run.status.toLowerCase()}
              </span>
            ))}
          </div>
        </div>
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
                      {describeRelationshipArdaMode(account.relationship)
                        ? ` • ${describeRelationshipArdaMode(account.relationship)}`
                        : ""}
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

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Relationship Coverage</h3>
          <div className="mt-4 space-y-3">
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <p className="text-xs text-muted-foreground">Missing Coda Coverage</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{formatNumber(missingCodaAccounts.length)}</p>
            </div>
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <p className="text-xs text-muted-foreground">Failing Primary LIR</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{formatNumber(lirFailAccounts.length)}</p>
            </div>
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <p className="text-xs text-muted-foreground">Implementation Blocked</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{formatNumber(implementationBlockedAccounts.length)}</p>
            </div>
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <p className="text-xs text-muted-foreground">Arda Fallback Mode</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{formatNumber(ardaFallbackAccounts.length)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Missing Coda Accounts</h3>
          <div className="mt-4 space-y-3">
            {missingCodaAccounts.slice(0, 6).map((account) => (
              <div key={account.accountId} className="rounded-md border border-border bg-background px-3 py-2">
                <Link
                  href={`/analytics/customer-success/accounts/${account.accountId}`}
                  className="text-sm font-medium text-foreground hover:text-primary"
                >
                  {account.name}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {account.ownerName || "Unassigned"}
                  {account.relationship?.missingSources.length ? ` • Missing ${account.relationship.missingSources.join(", ")}` : ""}
                </p>
              </div>
            ))}
            {missingCodaAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">All visible accounts have Coda coverage.</p>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">LIR Fail Queue</h3>
          <div className="mt-4 space-y-3">
            {lirFailAccounts.slice(0, 6).map((account) => (
              <div key={account.accountId} className="rounded-md border border-border bg-background px-3 py-2">
                <Link
                  href={`/analytics/customer-success/accounts/${account.accountId}`}
                  className="text-sm font-medium text-foreground hover:text-primary"
                >
                  {account.name}
                </Link>
                <p className={`mt-1 text-xs ${relationshipTone(account.relationship?.retentionStatus)}`}>
                  {account.relationship?.retentionStatus || "No retention status"}
                  {account.relationship?.implementationStage ? ` • ${account.relationship.implementationStage}` : ""}
                  {describeRelationshipArdaMode(account.relationship)
                    ? ` • ${describeRelationshipArdaMode(account.relationship)}`
                    : ""}
                </p>
              </div>
            ))}
            {lirFailAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No accounts are currently failing the primary LIR.</p>
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
                    {describeRelationshipArdaMode(account.relationship) ? (
                      <div className="text-xs text-muted-foreground">
                        {describeRelationshipArdaMode(account.relationship)}
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
  const googleWorkspace = data?.googleWorkspace;
  const slackOps = data?.slack;
  const codaOps = data?.codaOps;
  const trend = buildCombinedActivityTrend(data);
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

  const hasLegacyAnalytics = Boolean(pylon || coda);
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
      label: "Waiting on Team",
      value: pylon?.waitingOnTeam ?? 0,
      threshold: 8,
      description: "Internal follow-up delays can increase churn risk.",
    },
    {
      id: "overdue",
      label: "First Response Minutes",
      value: pylon?.avgFirstResponseMinutes ?? 0,
      threshold: 120,
      description: "Slow first responses weaken customer confidence.",
    },
  ];
  const actions = deriveCSActions({ pylon: pylon ?? null, coda: coda ?? null });

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
              <p className="text-xs text-muted-foreground">Avg First Response</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {pylon?.avgFirstResponseMinutes != null ? `${formatNumber(pylon.avgFirstResponseMinutes)} min` : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Coda Cards</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{coda?.totalCards ?? "—"}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">Customer Ops Activity (7 buckets)</h3>
            {trend.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No automation activity available in this range.</p>
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
