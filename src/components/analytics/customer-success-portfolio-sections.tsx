"use client";

import Link from "next/link";
import type { CustomerSuccessPortfolio } from "@/lib/customer-success/types";
import type {
  LeadingIndicatorKey,
  PortfolioSort,
} from "@/components/analytics/use-customer-success-portfolio-view";
import { weakestLeadingIndicator } from "@/components/analytics/customer-success-portfolio-utils";

type PortfolioAccount = CustomerSuccessPortfolio["accounts"][number];
type PortfolioAlert = CustomerSuccessPortfolio["alerts"][number];
type PortfolioActivity = CustomerSuccessPortfolio["recentActivity"][number];
type PortfolioAttentionAccount = CustomerSuccessPortfolio["attentionAccounts"][number];

function relationshipTone(status?: string): string {
  if (status === "Healthy") return "text-[var(--success)]";
  if (status === "Watch" || status === "Onboarding Risk") return "text-[var(--warning)]";
  if (status === "At Risk" || status === "Billing Risk") return "text-red-500";
  return "text-muted-foreground";
}

function formatDays(value: number | null | undefined, formatNumber: (value: number | null | undefined) => string): string {
  if (value === undefined || value === null) return "—";
  return `${formatNumber(value)}d`;
}

export function PortfolioSummaryCards(props: {
  accountsWithCoda: number;
  avgHealthScore: number;
  atRiskAccounts: number;
  coverageGaps: number;
  formatNumber: (value: number | null | undefined) => string;
  healthTone: (score: number) => string;
  openAlerts: number;
  totalAccounts: number;
}) {
  const {
    accountsWithCoda,
    avgHealthScore,
    atRiskAccounts,
    coverageGaps,
    formatNumber,
    healthTone,
    openAlerts,
    totalAccounts,
  } = props;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <p className="text-xs text-muted-foreground">Customer Records</p>
        <p className="mt-1 text-2xl font-semibold text-foreground">{formatNumber(totalAccounts)}</p>
      </div>
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <p className="text-xs text-muted-foreground">Average Health</p>
        <p className={`mt-1 text-2xl font-semibold ${healthTone(avgHealthScore)}`}>{formatNumber(avgHealthScore)}</p>
      </div>
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <p className="text-xs text-muted-foreground">At-Risk Accounts</p>
        <p className="mt-1 text-2xl font-semibold text-red-500">{formatNumber(atRiskAccounts)}</p>
      </div>
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <p className="text-xs text-muted-foreground">Open Alerts</p>
        <p className="mt-1 text-2xl font-semibold text-foreground">{formatNumber(openAlerts)}</p>
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
  );
}

export function PortfolioHealthDistributionPanel(props: {
  formatNumber: (value: number | null | undefined) => string;
  healthDistribution: CustomerSuccessPortfolio["healthDistribution"];
}) {
  const { formatNumber, healthDistribution } = props;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">Health Distribution</h3>
      <div className="mt-4 space-y-3">
        {healthDistribution.map((bucket) => (
          <div key={bucket.label} className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
            <p className="text-sm text-foreground">Grade {bucket.label}</p>
            <p className="text-sm font-medium text-foreground">{formatNumber(bucket.count)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PortfolioAttentionQueuePanel(props: {
  attentionAccounts: PortfolioAttentionAccount[];
  formatNumber: (value: number | null | undefined) => string;
  healthTone: (score: number) => string;
}) {
  const { attentionAccounts, formatNumber, healthTone } = props;

  return (
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
        {attentionAccounts.map((account) => {
          const primarySignal = weakestLeadingIndicator(account.health);

          return (
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
                  <p className="mt-2 text-xs text-muted-foreground">
                    Primary risk: {primarySignal.label} • {primarySignal.value}
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
          );
        })}
        {attentionAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accounts currently need intervention.</p>
        ) : null}
      </div>
    </div>
  );
}

export function PortfolioAlertsPanel({ alerts }: { alerts: PortfolioAlert[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">Open Alerts</h3>
      <div className="mt-4 space-y-3">
        {alerts.slice(0, 6).map((alert) => (
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
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No customer-success alerts yet.</p>
        ) : null}
      </div>
    </div>
  );
}

export function PortfolioRecentActivityPanel(props: {
  formatDate: (value?: string) => string;
  recentActivity: PortfolioActivity[];
}) {
  const { formatDate, recentActivity } = props;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
      <div className="mt-4 space-y-3">
        {recentActivity.slice(0, 6).map((event) => (
          <div key={event.id} className="rounded-xl border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">{event.title}</p>
              <p className="text-xs text-muted-foreground">{formatDate(event.occurredAt)}</p>
            </div>
            {event.description ? <p className="mt-1 text-xs text-muted-foreground">{event.description}</p> : null}
          </div>
        ))}
        {recentActivity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activity recorded.</p>
        ) : null}
      </div>
    </div>
  );
}

export function LeadingIndicatorPressurePanel(props: {
  indicatorFilter: LeadingIndicatorKey | null;
  leadingIndicatorPressure: Array<{ key: LeadingIndicatorKey; label: string; count: number }>;
  onToggleIndicator: (key: LeadingIndicatorKey) => void;
  threshold: number;
  formatNumber: (value: number | null | undefined) => string;
}) {
  const { indicatorFilter, leadingIndicatorPressure, onToggleIndicator, threshold, formatNumber } = props;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Leading Indicator Pressure</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Accounts with indicator scores below {threshold} across the portfolio.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {leadingIndicatorPressure.map((item) => {
          const active = indicatorFilter === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={`rounded-xl border px-4 py-3 text-left transition ${
                active
                  ? "border-primary bg-primary/10"
                  : "border-border bg-background hover:border-primary/40 hover:bg-primary/5"
              }`}
              onClick={() => onToggleIndicator(item.key)}
            >
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className={`mt-1 text-2xl font-semibold ${item.count > 0 ? "text-red-500" : "text-[var(--success)]"}`}>
                {formatNumber(item.count)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {item.count === 1 ? "account below threshold" : "accounts below threshold"}
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {active ? "Filtering table" : "Click to filter table"}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PortfolioAccountsTable(props: {
  accountSort: PortfolioSort;
  filteredAccounts: PortfolioAccount[];
  formatDate: (value?: string) => string;
  formatNumber: (value: number | null | undefined) => string;
  generatedAt: string;
  hasActiveFilters: boolean;
  healthTone: (score: number) => string;
  indicatorFilterLabel: string | null;
  onClearFilters: () => void;
  onSetSort: (sort: PortfolioSort) => void;
  onToggleWeakSignals: (checked: boolean) => void;
  showOnlyWeakSignals: boolean;
  threshold: number;
}) {
  const {
    accountSort,
    filteredAccounts,
    formatDate,
    formatNumber,
    generatedAt,
    hasActiveFilters,
    healthTone,
    indicatorFilterLabel,
    onClearFilters,
    onSetSort,
    onToggleWeakSignals,
    showOnlyWeakSignals,
    threshold,
  } = props;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Portfolio Accounts</h3>
          <p className="mt-1 text-xs text-muted-foreground">Customer record summary with drill-through into the account workspace.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted-foreground">
            Sort by
            <select
              aria-label="Sort portfolio accounts"
              className="ml-2 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
              value={accountSort}
              onChange={(event) => onSetSort(event.target.value as PortfolioSort)}
            >
              <option value="primary-signal">Primary signal risk</option>
              <option value="health">Health score</option>
              <option value="alerts">Open alerts</option>
              <option value="renewal">Nearest renewal</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              aria-label="Only risky signals"
              checked={showOnlyWeakSignals}
              onChange={(event) => onToggleWeakSignals(event.target.checked)}
            />
            Only risky signals
          </label>
          {hasActiveFilters ? (
            <button
              type="button"
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-secondary"
              onClick={onClearFilters}
            >
              Clear filters
            </button>
          ) : null}
          <p className="text-xs text-muted-foreground">Updated {formatDate(generatedAt)}</p>
        </div>
      </div>
      {showOnlyWeakSignals ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing {filteredAccounts.length} account{filteredAccounts.length === 1 ? "" : "s"} with weakest leading indicator below {threshold}.
        </p>
      ) : null}
      {indicatorFilterLabel ? (
        <p className="mt-2 text-xs text-muted-foreground">Indicator filter: {indicatorFilterLabel}.</p>
      ) : null}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 font-medium">Account</th>
              <th className="pb-2 font-medium">Owner</th>
              <th className="pb-2 font-medium">Health</th>
              <th className="pb-2 font-medium">Retention</th>
              <th className="pb-2 font-medium">Orders</th>
              <th className="pb-2 font-medium">Items</th>
              <th className="pb-2 font-medium">Thresholds</th>
              <th className="pb-2 font-medium">Systems</th>
              <th className="pb-2 font-medium">Primary Signal</th>
              <th className="pb-2 font-medium">Alerts</th>
              <th className="pb-2 font-medium">Last Activity</th>
              <th className="pb-2 font-medium">Renewal</th>
            </tr>
          </thead>
          <tbody>
            {filteredAccounts.map((account) => {
              const primarySignal = weakestLeadingIndicator(account.health);
              const productMetrics = account.relationship?.productMetrics;

              return (
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
                    {formatNumber(productMetrics?.totalOrders)}
                    <div className="text-xs text-muted-foreground">
                      10 in {formatDays(productMetrics?.daysTo10Orders, formatNumber)}
                    </div>
                  </td>
                  <td className="py-3 text-muted-foreground">
                    {formatNumber(productMetrics?.totalItems)}
                    <div className="text-xs text-muted-foreground">
                      {formatNumber(productMetrics?.uniqueItemsOrdered)} ordered
                    </div>
                  </td>
                  <td className="py-3 text-muted-foreground">
                    25 items
                    <div className="text-xs text-muted-foreground">
                      {formatDays(productMetrics?.daysTo25Items, formatNumber)}
                    </div>
                  </td>
                  <td className="py-3 text-muted-foreground">
                    {formatNumber(account.relationship?.connectedSystems)}
                    {account.relationship?.missingSources.length ? (
                      <div className="text-xs text-[var(--warning)]">
                        Missing {account.relationship.missingSources.join(", ")}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-3">
                    <div className="text-foreground">{primarySignal.label}</div>
                    <div className="text-xs text-muted-foreground">{primarySignal.value}</div>
                  </td>
                  <td className="py-3 text-muted-foreground">{formatNumber(account.openAlertCount)}</td>
                  <td className="py-3 text-muted-foreground">{formatDate(account.lastActivityAt)}</td>
                  <td className="py-3 text-muted-foreground">{formatDate(account.renewalDate)}</td>
                </tr>
              );
            })}
            {filteredAccounts.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-6 text-center text-sm text-muted-foreground">
                  No accounts match the current leading-indicator filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
