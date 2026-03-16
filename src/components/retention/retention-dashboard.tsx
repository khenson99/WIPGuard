"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AlertTriangle, BadgeCheck, CircleDashed, CreditCard, TrendingDown } from "lucide-react";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-error-banner";
import { DashboardStaleBanner } from "@/components/dashboard/dashboard-stale-banner";
import type { RetentionSummary, RetentionTenantRow } from "@/lib/retention/types";

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)}%`;
}

function fmtNum(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function statusClass(status: RetentionTenantRow["status"]): string {
  switch (status) {
    case "Healthy":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "Watch":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "At Risk":
    case "Billing Risk":
      return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
    case "Onboarding Risk":
      return "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300";
  }
}

function useRetentionQuery() {
  const searchParams = useSearchParams();
  return useMemo(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    return params.toString();
  }, [searchParams]);
}

type SummaryResponse = RetentionSummary;

interface TenantsResponse {
  generatedAt: string;
  tenants: RetentionTenantRow[];
}

interface RetentionDashboardPayload {
  summary: SummaryResponse;
  tenants: TenantsResponse;
  tenantsError: string | null;
}

export function RetentionDashboard() {
  const query = useRetentionQuery();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const resource = useDashboardResource<RetentionDashboardPayload>({
    cacheKey: `retention-dashboard:${query || "default"}`,
    deps: [query],
    async load({ signal }) {
      const suffix = query ? `?${query}` : "";
      const [summaryResponse, tenantsResponse] = await Promise.all([
        fetch(`/api/retention/summary${suffix}`, { signal, cache: "no-store" }),
        fetch(`/api/retention/tenants${suffix}`, { signal, cache: "no-store" }),
      ]);
      if (!summaryResponse.ok) {
        throw new Error(`Retention summary request failed (${summaryResponse.status})`);
      }
      const summary = (await summaryResponse.json()) as SummaryResponse;
      if (tenantsResponse.ok) {
        return {
          summary,
          tenants: (await tenantsResponse.json()) as TenantsResponse,
          tenantsError: null,
        };
      }
      return {
        summary,
        tenants: {
          generatedAt: summary.generatedAt,
          tenants: [],
        },
        tenantsError: `Retention tenant list request failed (${tenantsResponse.status})`,
      };
    },
    getLastUpdatedAt: (payload) => payload.summary.generatedAt,
  });

  const summary = resource.data?.summary ?? null;
  const tenants = resource.data?.tenants.tenants;
  const tenantsError = resource.data?.tenantsError ?? null;
  const ownerOptions = useMemo(
    () =>
      [...new Set((tenants ?? []).map((tenant) => tenant.ownerName).filter((value): value is string => Boolean(value)))]
        .sort((a, b) => a.localeCompare(b)),
    [tenants]
  );
  const segmentOptions = useMemo(
    () =>
      [...new Set((tenants ?? []).map((tenant) => tenant.segment).filter((value): value is string => Boolean(value)))]
        .sort((a, b) => a.localeCompare(b)),
    [tenants]
  );
  const planOptions = useMemo(
    () =>
      [...new Set(summary?.byPlan.map((bucket) => bucket.label).filter((label) => label !== "Unknown") ?? [])]
        .sort((a, b) => a.localeCompare(b)),
    [summary]
  );
  const ageBucketOptions = useMemo(
    () =>
      [...new Set(summary?.byAgeBucket.map((bucket) => bucket.label).filter((label) => label !== "Unknown") ?? [])],
    [summary]
  );

  if (resource.loading && !resource.data) {
    return <DashboardLoadingState message="Loading retention dashboard..." />;
  }

  if (resource.error && !resource.data) {
    return <DashboardErrorBanner message={resource.error} />;
  }

  if (!summary) {
    return <DashboardErrorBanner message="Retention data is unavailable." />;
  }

  const filters = {
    status: searchParams?.get("status") ?? "",
    plan: searchParams?.get("plan") ?? "",
    owner: searchParams?.get("owner") ?? "",
    segment: searchParams?.get("segment") ?? "",
    icp: searchParams?.get("icp") ?? "",
    lifecyclePhase: searchParams?.get("lifecyclePhase") ?? "",
    ageBucket: searchParams?.get("ageBucket") ?? "",
    search: searchParams?.get("search") ?? "",
  };
  const hasActiveFilters = Object.values(filters).some((value) => value.length > 0);

  if ((tenants?.length ?? 0) === 0 && summary.totals.tenants === 0 && !hasActiveFilters && !tenantsError) {
    return (
      <div className="space-y-4 p-4">
        {resource.stale ? (
          <DashboardStaleBanner
            lastUpdatedAt={resource.lastUpdatedAt}
            refreshing={resource.refreshing}
            onRefresh={resource.refresh}
            label="Showing cached retention analytics while the latest snapshot refreshes."
          />
        ) : null}
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <h1 className="text-xl font-semibold text-foreground">Retention</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No retention dataset has been materialized for this organization yet.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Run the retention sync, then refresh this view once tenant snapshots are available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {resource.stale ? (
        <DashboardStaleBanner
          lastUpdatedAt={resource.lastUpdatedAt}
          refreshing={resource.refreshing}
          onRefresh={resource.refresh}
          label="Showing cached retention analytics while the latest snapshot refreshes."
        />
      ) : null}
      {tenantsError ? (
        <DashboardErrorBanner
          message={`${tenantsError}. Summary metrics are still shown below.`}
          onRetry={resource.refresh}
          retryLabel={resource.refreshing ? "Refreshing..." : "Retry tenant view"}
        />
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Retention</h1>
          <p className="text-xs text-muted-foreground">
            Current-month leading indicators of retention by tenant, with onboarding, support, and billing overlays.
          </p>
        </div>
        <button
          type="button"
          onClick={resource.refresh}
          disabled={resource.refreshing}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          {resource.refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <form action={pathname ?? undefined} className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-4">
        <input
          name="search"
          defaultValue={filters.search}
          placeholder="Search tenant, owner, segment"
          title="Filter by tenant name, owner, or segment."
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground xl:col-span-2"
        />
        <select
          name="status"
          defaultValue={filters.status}
          title="Filter tenants by the retention status used in the dashboard."
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="">All statuses</option>
          <option value="Healthy">Healthy</option>
          <option value="Watch">Watch</option>
          <option value="At Risk">At Risk</option>
          <option value="Onboarding Risk">Onboarding Risk</option>
          <option value="Billing Risk">Billing Risk</option>
        </select>
        <select
          name="lifecyclePhase"
          defaultValue={filters.lifecyclePhase}
          title="Separate onboarding-stage tenants from mature tenants."
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="">All lifecycle phases</option>
          <option value="ONBOARDING">Onboarding</option>
          <option value="MATURE">Mature</option>
        </select>
        <select
          name="icp"
          defaultValue={filters.icp}
          title="Filter by ideal customer profile classification."
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="">All ICP flags</option>
          <option value="true">ICP only</option>
          <option value="false">Non-ICP only</option>
        </select>
        <select
          name="plan"
          defaultValue={filters.plan}
          title="Filter by commercial plan or package."
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="">All plans</option>
          {planOptions.map((plan) => (
            <option key={plan} value={plan}>
              {plan}
            </option>
          ))}
        </select>
        <select
          name="owner"
          defaultValue={filters.owner}
          title="Filter by owner or CSM."
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="">All owners</option>
          {ownerOptions.map((owner) => (
            <option key={owner} value={owner}>
              {owner}
            </option>
          ))}
        </select>
        <select
          name="segment"
          defaultValue={filters.segment}
          title="Filter by customer segment."
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="">All segments</option>
          {segmentOptions.map((segment) => (
            <option key={segment} value={segment}>
              {segment}
            </option>
          ))}
        </select>
        <select
          name="ageBucket"
          defaultValue={filters.ageBucket}
          title="Filter by tenant age since go-live."
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="">All age buckets</option>
          {ageBucketOptions.map((ageBucket) => (
            <option key={ageBucket} value={ageBucket}>
              {ageBucket}
            </option>
          ))}
        </select>
        <div className="md:col-span-2 xl:col-span-4 flex items-center justify-end gap-2">
          <Link
            href="/analytics/retention"
            className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Clear
          </Link>
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            Apply filters
          </button>
        </div>
      </form>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4" title="Percent of current tenants meeting the current primary leading indicator of retention.">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <BadgeCheck className="h-4 w-4" />
            LIR Pass Rate
          </div>
          <p className="mt-2 text-3xl font-semibold text-foreground">
            {fmtPct(summary.kpis.find((kpi) => kpi.label === "LIR attainment")?.value)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4" title="Tenants classified as At Risk because LIR failure is paired with usage collapse, support distress, or strong negative signals.">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            At-Risk Tenants
          </div>
          <p className="mt-2 text-3xl font-semibold text-foreground">{fmtNum(summary.totals.atRiskTenants)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4" title="Onboarding-stage tenants that have not reached early value or habit milestones in time.">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CircleDashed className="h-4 w-4" />
            Onboarding Risks
          </div>
          <p className="mt-2 text-3xl font-semibold text-foreground">{fmtNum(summary.totals.onboardingRiskTenants)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4" title="Tenants with delinquency, failed payment, or similar billing instability.">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CreditCard className="h-4 w-4" />
            Billing Risks
          </div>
          <p className="mt-2 text-3xl font-semibold text-foreground">{fmtNum(summary.totals.billingRiskTenants)}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Tenant View</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Each tenant shows the primary LIR, current-month activity, overlays, and explicit reason codes.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">{(tenants ?? []).length} tenants</p>
          </div>
          {tenantsError ? (
            <div className="mt-4 rounded-lg border border-border bg-background px-4 py-6 text-sm text-muted-foreground">
              Tenant-level retention rows are temporarily unavailable. Refresh to retry this panel.
            </div>
          ) : (tenants?.length ?? 0) === 0 ? (
            <div className="mt-4 rounded-lg border border-border bg-background px-4 py-6 text-sm text-muted-foreground">
              {hasActiveFilters
                ? "No tenants match the current retention filters. Adjust filters to expand this view."
                : "Retention summary metrics are available, but no tenant-level rows were returned for this range yet."}
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    <th className="pb-2 pr-4">Tenant</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">LIR</th>
                    <th className="pb-2 pr-4">Activity</th>
                    <th className="pb-2 pr-4">Trend</th>
                    <th className="pb-2 pr-4">Overlay</th>
                    <th className="pb-2">Reason codes</th>
                  </tr>
                </thead>
                <tbody>
                  {(tenants ?? []).map((tenant) => (
                    <tr key={tenant.customerRecordId} className="border-b border-border/60 align-top">
                      <td className="py-3 pr-4">
                        <Link
                          href={`/analytics/retention/${tenant.customerRecordId}`}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {tenant.tenantName}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {tenant.ownerName ?? "Unassigned"} · {tenant.segment ?? "Unknown segment"} · {tenant.plan ?? "Unknown plan"}
                        </p>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusClass(tenant.status)}`}>
                          {tenant.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-foreground">
                          {tenant.primaryLirPassed ? "Pass" : "Fail"} · {tenant.primaryLirLabel}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {fmtNum(tenant.primaryLirValue)} / {fmtNum(tenant.primaryLirThreshold)}
                        </p>
                      </td>
                      <td className="py-3 pr-4 text-foreground">{fmtNum(tenant.currentMonthActivity)}</td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-1 text-foreground">
                          <TrendingDown className={`h-4 w-4 ${(tenant.trendVsPriorPct ?? 0) < 0 ? "text-red-500" : "text-emerald-500 rotate-180"}`} />
                          {fmtPct(tenant.trendVsPriorPct)}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="text-xs text-muted-foreground">
                          {tenant.supportRisk ? "Support risk" : "Support ok"} · {tenant.billingRisk ? "Billing risk" : "Billing ok"} · {tenant.icp ? "ICP" : "Non-ICP"}
                        </p>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          {tenant.reasonCodes.slice(0, 3).map((reason) => (
                            <span
                              key={reason.code}
                              title={reason.detail}
                              className="rounded-full border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground"
                            >
                              {reason.label}
                            </span>
                          ))}
                          {tenant.reasonCodes.length === 0 ? (
                            <span className="text-xs text-muted-foreground">No active warnings</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">Primary LIR in Production</h2>
            <p className="mt-2 text-sm text-foreground">{summary.lirDefinition.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.lirDefinition.description} Threshold: {summary.lirDefinition.comparator === "gte" ? "at least" : "at most"}{" "}
              {summary.lirDefinition.threshold} in {summary.lirDefinition.windowLabel.toLowerCase()}.
            </p>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">Rollups</h2>
            <div className="mt-4 space-y-3">
              {summary.byIcp.map((bucket) => (
                <div key={bucket.segmentKey} className="rounded-lg border border-border bg-background px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{bucket.label}</p>
                    <p className="text-xs text-muted-foreground">{bucket.tenants} tenants</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    LIR pass {fmtPct(bucket.lirPassRate)} · At risk {fmtPct(bucket.atRiskRate)}
                  </p>
                </div>
              ))}
              {summary.byIcp.length === 0 ? (
                <p className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                  No ICP or segment rollups are available yet.
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">Priority Queues</h2>
            <div className="mt-4 space-y-4">
              <QueueCard title="Sharp declines" rows={summary.sharpDeclines} />
              <QueueCard title="Onboarding misses" rows={summary.onboardingMisses} />
              <QueueCard title="Support-heavy high-usage" rows={summary.supportHeavyHighUsage} />
              <QueueCard title="Billing risks" rows={summary.billingRiskAccounts} />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">Cohorts</h2>
            <div className="mt-4 space-y-2">
              {summary.cohorts.slice(-6).reverse().map((cohort) => (
                <div key={cohort.cohortMonth} className="rounded-lg border border-border bg-background px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{cohort.cohortMonth}</p>
                    <p className="text-xs text-muted-foreground">{cohort.tenants} tenants</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    LIR pass {fmtPct(cohort.lirPassRate)} · active after 180d {fmtPct(cohort.activeAfter180dRate)}
                  </p>
                </div>
              ))}
              {summary.cohorts.length === 0 ? (
                <p className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                  No cohort history is available yet.
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">Source Coverage</h2>
            <div className="mt-4 space-y-2">
              {summary.dataCoverage.map((coverage) => (
                <div key={coverage.source} className="rounded-lg border border-border bg-background px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{coverage.source}</p>
                    <p className="text-xs text-muted-foreground">
                      {coverage.tenantsCovered}/{coverage.totalTenants} tenants
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Coverage {fmtPct(coverage.coveragePct)}</p>
                </div>
              ))}
              {summary.dataCoverage.length === 0 ? (
                <p className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                  No source coverage diagnostics are available yet.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function QueueCard({ title, rows }: { title: string; rows: RetentionTenantRow[] }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{rows.length}</p>
      </div>
      <div className="mt-2 space-y-2">
        {rows.length === 0 ? (
          <p className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
            No tenants in this queue.
          </p>
        ) : null}
        {rows.slice(0, 5).map((row) => (
          <Link
            key={row.customerRecordId}
            href={`/analytics/retention/${row.customerRecordId}`}
            className="block rounded-lg border border-border bg-background px-3 py-3 hover:border-primary/40"
          >
            <p className="text-sm font-medium text-foreground">{row.tenantName}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {row.status} · trend {fmtPct(row.trendVsPriorPct)} · activity {fmtNum(row.currentMonthActivity)}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
