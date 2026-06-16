"use client";

import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  DatabaseZap,
  Gauge,
  HeartPulse,
  Package,
  ShieldCheck,
} from "lucide-react";
import type {
  CustomerHealthAccountRow,
  CustomerHealthDashboardData,
  CustomerHealthSourceCoverage,
} from "@/lib/retention/customer-health-dashboard";
import { parseImladrisNumber } from "@/lib/imladris/number-parsing";

type HealthStatusFilter = "all" | CustomerHealthAccountRow["status"];
type MissingSourceFilter = "all" | "coda" | "stripe" | "pylon";

function scalarValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.length === 1 ? scalarValue(value[0], seen) : null;
  }

  const record = value as Record<string, unknown>;
  const data =
    record.data && typeof record.data === "object" && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : {};
  const attributes =
    data.attributes && typeof data.attributes === "object" && !Array.isArray(data.attributes)
      ? (data.attributes as Record<string, unknown>)
      : {};
  const candidates = [
    record.value,
    record.metricValue,
    record.metric_value,
    record.amount,
    record.number,
    record.count,
    record.percent,
    record.percentage,
    attributes.value,
    data.value,
    data.attributes,
    record.attributes,
    record.values,
    record.fields,
  ];

  for (const candidate of candidates) {
    const normalized = scalarValue(candidate, seen);
    if (normalized !== null && normalized !== undefined && typeof normalized !== "object") return normalized;
    if (normalized instanceof Date) return normalized;
  }

  return value;
}

function numericValue(value: unknown): number | null {
  const normalized = scalarValue(value);
  if (typeof normalized === "string") {
    const trimmed = normalized.trim();
    const withoutPercent = trimmed.endsWith("%") ? trimmed.slice(0, -1).trim() : trimmed;
    return parseImladrisNumber(withoutPercent);
  }
  return parseImladrisNumber(normalized);
}

function formatPercent(value: unknown): string {
  const parsed = numericValue(value);
  if (parsed === null) return "Missing";
  return `${parsed.toFixed(1)}%`;
}

function formatNumber(value: unknown): string {
  const parsed = numericValue(value);
  if (parsed === null) return "Missing";
  return parsed.toLocaleString();
}

function statusClasses(status: string): string {
  switch (status) {
    case "Healthy":
    case "SUCCESS":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300";
    case "Watch":
    case "PARTIAL":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300";
    case "At Risk":
    case "Onboarding Risk":
    case "Billing Risk":
    case "ERROR":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300";
    default:
      return "border-border bg-secondary text-muted-foreground";
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusClasses(
        status,
      )}`}
    >
      {status}
    </span>
  );
}

function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof HeartPulse;
}) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
        </div>
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </article>
  );
}

function SourceCoverageRow({ source }: { source: CustomerHealthSourceCoverage }) {
  return (
    <article className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-foreground">{source.source}</p>
        <p className="text-sm font-semibold text-foreground">{formatPercent(source.coveragePct)}</p>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {source.tenantsCovered}/{source.totalTenants} accounts covered
      </p>
    </article>
  );
}

function AttentionCard({ account }: { account: CustomerHealthAccountRow }) {
  const reason = account.reasonCodes[0];

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{account.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {account.ownerName ?? "Unassigned"} · {account.lifecyclePhase}
          </p>
        </div>
        <StatusBadge status={account.status} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
        <div>
          <dt>Activity</dt>
          <dd className="font-medium text-foreground">{formatNumber(account.currentMonthActivity)}</dd>
        </div>
        <div>
          <dt>Trend</dt>
          <dd className="font-medium text-foreground">{formatPercent(account.trendVsPriorPct)}</dd>
        </div>
        <div>
          <dt>LIR</dt>
          <dd className="font-medium text-foreground">
            {account.primaryLirPassed ? "Pass" : "Miss"}
          </dd>
        </div>
      </dl>
      {reason ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{reason.label}</p>
      ) : null}
    </article>
  );
}

function AccountRow({ account }: { account: CustomerHealthAccountRow }) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-3 py-3 align-top">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{account.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {account.segment ?? "Unknown segment"} · {account.plan ?? "Unknown plan"}
          </p>
        </div>
      </td>
      <td className="px-3 py-3 align-top">
        <StatusBadge status={account.status} />
      </td>
      <td className="px-3 py-3 align-top text-sm text-foreground">
        {formatNumber(account.currentMonthActivity)}
      </td>
      <td className="px-3 py-3 align-top text-sm text-foreground">
        {formatPercent(account.trendVsPriorPct)}
      </td>
      <td className="px-3 py-3 align-top text-sm text-foreground">
        {account.primaryLirValue === null || account.primaryLirValue === undefined
          ? "Missing"
          : `${formatNumber(account.primaryLirValue)} / ${formatNumber(account.primaryLirThreshold)}`}
      </td>
      <td className="px-3 py-3 align-top text-xs text-muted-foreground">
        {account.coverage.missingSources.length > 0
          ? account.coverage.missingSources.join(", ")
          : "Complete"}
      </td>
    </tr>
  );
}

function FilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground"
          : "rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      }
    >
      {label}
    </button>
  );
}

export function CustomerHealthDashboard({ data }: { data: CustomerHealthDashboardData }) {
  const [statusFilter, setStatusFilter] = useState<HealthStatusFilter>("all");
  const [missingSourceFilter, setMissingSourceFilter] = useState<MissingSourceFilter>("all");
  const lirPct =
    data.totals.totalAccounts > 0
      ? (data.totals.lirPassingAccounts / data.totals.totalAccounts) * 100
      : 0;
  const needsAttention = [
    ...data.riskQueues.atRisk,
    ...data.riskQueues.onboardingRisk,
    ...data.riskQueues.billingRisk,
  ].slice(0, 6);
  const filteredAccounts = data.accounts.filter((account) => {
    const statusMatches = statusFilter === "all" || account.status === statusFilter;
    const sourceMatches =
      missingSourceFilter === "all" ||
      account.coverage.missingSources.includes(missingSourceFilter);
    return statusMatches && sourceMatches;
  });

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="border-b border-border pb-5">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">
            Customer Health
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-3xl">
              <h1 className="text-2xl font-semibold text-foreground">Customer Health</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Materialized customer health from Coda order history and Arda item, card, and order activity.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                {data.totals.healthyAccounts} healthy
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
                {data.totals.atRiskAccounts +
                  data.totals.onboardingRiskAccounts +
                  data.totals.billingRiskAccounts}{" "}
                risk
              </span>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Portfolio"
            value={`${formatNumber(data.totals.totalAccounts)} accounts`}
            detail={`${data.totals.healthyAccounts} healthy, ${data.totals.atRiskAccounts} at risk`}
            icon={HeartPulse}
          />
          <KpiCard
            label="LIR attainment"
            value={formatPercent(lirPct)}
            detail={`${data.totals.lirPassingAccounts}/${data.totals.totalAccounts} accounts passing`}
            icon={CheckCircle2}
          />
          <KpiCard
            label="Average activity"
            value={formatNumber(data.totals.avgCurrentMonthActivity)}
            detail="Average current-month item, card, and order activity."
            icon={Activity}
          />
          <KpiCard
            label="Arda activity"
            value={formatNumber(data.ardaDataQuality.activityRecords)}
            detail={`${data.ardaDataQuality.orderRecords} orders, ${data.ardaDataQuality.cardRecords} cards, ${data.ardaDataQuality.itemRecords} items`}
            icon={DatabaseZap}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-foreground">Arda Data Quality</h2>
            </div>
            <article className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Latest ARDA sync</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {data.ardaDataQuality.latestSync?.status ?? "No sync"}
                  </p>
                </div>
                {data.ardaDataQuality.latestSync ? (
                  <StatusBadge status={data.ardaDataQuality.latestSync.status} />
                ) : null}
              </div>
              <dl className="mt-4 grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                <div>
                  <dt>Orders</dt>
                  <dd className="mt-1 text-base font-semibold text-foreground">
                    {data.ardaDataQuality.orderRecords}
                  </dd>
                </div>
                <div>
                  <dt>Cards</dt>
                  <dd className="mt-1 text-base font-semibold text-foreground">
                    {data.ardaDataQuality.cardRecords}
                  </dd>
                </div>
                <div>
                  <dt>Items</dt>
                  <dd className="mt-1 text-base font-semibold text-foreground">
                    {data.ardaDataQuality.itemRecords}
                  </dd>
                </div>
                <div>
                  <dt>Tenants</dt>
                  <dd className="mt-1 text-base font-semibold text-foreground">
                    {data.ardaDataQuality.tenantRecords}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                {data.ardaDataQuality.note}
              </p>
            </article>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-foreground">Source Coverage</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.sourceCoverage.map((source) => (
                <SourceCoverageRow key={source.source} source={source} />
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Needs Attention</h2>
          {needsAttention.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {needsAttention.map((account) => (
                <AttentionCard key={account.accountId} account={account} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
              No customer health snapshots are currently in a risk queue.
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Board Customer Risk</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Filter the account table to isolate investor-visible risk by status or missing evidence.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterButton
                active={statusFilter === "all"}
                label="All Statuses"
                onClick={() => setStatusFilter("all")}
              />
              {(["At Risk", "Watch", "Healthy"] as HealthStatusFilter[]).map((status) => (
                <FilterButton
                  key={status}
                  active={statusFilter === status}
                  label={status}
                  onClick={() => setStatusFilter(status)}
                />
              ))}
              <FilterButton
                active={missingSourceFilter === "all"}
                label="All Sources"
                onClick={() => setMissingSourceFilter("all")}
              />
              <FilterButton
                active={missingSourceFilter === "coda"}
                label="Missing Coda"
                onClick={() => setMissingSourceFilter("coda")}
              />
              <FilterButton
                active={missingSourceFilter === "stripe"}
                label="Missing Stripe"
                onClick={() => setMissingSourceFilter("stripe")}
              />
              <FilterButton
                active={missingSourceFilter === "pylon"}
                label="Missing Pylon"
                onClick={() => setMissingSourceFilter("pylon")}
              />
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {data.healthStatusBreakdown.map((entry) => (
                <span
                  key={entry.status}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-muted-foreground"
                >
                  {entry.status} {entry.count}
                </span>
              ))}
            </div>
          </div>
          {data.accounts.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="min-w-full border-collapse text-left">
                <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Account</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Activity</th>
                    <th className="px-3 py-2 font-medium">Trend</th>
                    <th className="px-3 py-2 font-medium">LIR</th>
                    <th className="px-3 py-2 font-medium">Missing Sources</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.map((account) => (
                    <AccountRow key={account.accountId} account={account} />
                  ))}
                </tbody>
              </table>
              {filteredAccounts.length === 0 ? (
                <div className="border-t border-border p-4 text-sm text-muted-foreground">
                  No accounts match the selected board risk filters.
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
              No customer health snapshots are materialized yet.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
