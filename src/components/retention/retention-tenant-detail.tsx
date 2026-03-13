"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-error-banner";
import { DashboardStaleBanner } from "@/components/dashboard/dashboard-stale-banner";
import type { RetentionTenantDetail } from "@/lib/retention/types";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)}%`;
}

function fmtNum(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

export function RetentionTenantDetailView({ customerRecordId }: { customerRecordId: string }) {
  const resource = useDashboardResource<RetentionTenantDetail>({
    cacheKey: `retention-tenant:${customerRecordId}`,
    deps: [customerRecordId],
    async load({ signal }) {
      const response = await fetch(`/api/retention/tenants/${customerRecordId}`, {
        signal,
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Retention tenant request failed (${response.status})`);
      }
      return (await response.json()) as RetentionTenantDetail;
    },
    getLastUpdatedAt: (payload) => payload.generatedAt,
  });

  const detail = resource.data;
  const chartData = useMemo(
    () =>
      (detail?.timeline ?? []).map((point) => ({
        month: point.monthStart.slice(0, 7),
        activity: point.currentMonthActivity ?? 0,
        orders: point.orderCount ?? 0,
        lir: point.primaryLirValue ?? 0,
      })),
    [detail?.timeline]
  );

  if (resource.loading && !detail) {
    return <DashboardLoadingState message="Loading tenant retention detail..." />;
  }

  if (resource.error && !detail) {
    return <DashboardErrorBanner message={resource.error} />;
  }

  if (!detail) {
    return <DashboardErrorBanner message="Retention tenant detail is unavailable." />;
  }

  return (
    <div className="space-y-4 p-4">
      {resource.stale ? (
        <DashboardStaleBanner
          lastUpdatedAt={resource.lastUpdatedAt}
          refreshing={resource.refreshing}
          onRefresh={resource.refresh}
          label="Showing cached tenant retention detail while the latest snapshot refreshes."
        />
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/analytics/retention" className="text-xs text-muted-foreground hover:text-foreground">
            Back to Retention
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-foreground">{detail.tenant.tenantName}</h1>
          <p className="text-xs text-muted-foreground">
            {detail.tenant.status} · {detail.tenant.lifecyclePhase.toLowerCase()} · {detail.tenant.ownerName ?? "Unassigned"}
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

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Primary LIR" value={`${detail.tenant.primaryLirPassed ? "Pass" : "Fail"} · ${detail.lirDefinition.label}`} />
        <MetricCard label="Current activity" value={fmtNum(detail.tenant.currentMonthActivity)} />
        <MetricCard label="Trend vs prior" value={fmtPct(detail.tenant.trendVsPriorPct)} />
        <MetricCard label="Coverage" value={(detail.tenant.coverage.missingSources as string[]).length > 0 ? `Missing ${(detail.tenant.coverage.missingSources as string[]).join(", ")}` : "All sources present"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">LIR and activity over time</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Monthly activity, order cadence, and primary LIR attainment history.
              </p>
            </div>
          </div>
          <div className="mt-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="activity" stroke="#0f766e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="orders" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="lir" stroke="#f97316" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Why this tenant is classified this way</h2>
          <p className="mt-3 text-sm text-muted-foreground">{detail.tenant.explanation}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {detail.tenant.reasonCodes.map((reason) => (
              <span
                key={reason.code}
                title={reason.detail}
                className="rounded-full border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
              >
                {reason.label}
              </span>
            ))}
          </div>
          <dl className="mt-6 space-y-3 text-sm">
            <DetailRow label="Go-live date" value={detail.tenant.goLiveDate ?? "—"} />
            <DetailRow label="Subscription start" value={detail.tenant.subscriptionStartDate ?? "—"} />
            <DetailRow label="First order date" value={detail.tenant.firstOrderDate ?? "—"} />
            <DetailRow label="Implementation stage" value={detail.tenant.implementationStage ?? "—"} />
          </dl>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <JsonCard title="Usage summary" payload={detail.tenant.usageSummary} />
        <JsonCard title="Support summary" payload={detail.tenant.supportSummary} />
        <JsonCard title="Billing summary" payload={detail.tenant.billingSummary} />
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground">{value}</dd>
    </div>
  );
}

function JsonCard({ title, payload }: { title: string; payload: Record<string, unknown> }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-4 space-y-2 text-sm">
        {Object.entries(payload).map(([key, value]) => (
          <div key={key} className="flex items-start justify-between gap-4 border-b border-border/60 pb-2">
            <p className="text-muted-foreground">{key}</p>
            <p className="text-right text-foreground">{typeof value === "object" ? JSON.stringify(value) : String(value)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
