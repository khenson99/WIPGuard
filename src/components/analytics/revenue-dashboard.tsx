"use client";

import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CreditCard,
  DollarSign,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatCard } from "@/components/analytics/stat-card";
import type { AnalyticsDashboardData, RevenueDashboardData } from "@/lib/analytics/types";

interface RevenueDashboardProps {
  data: AnalyticsDashboardData | null;
}

function fmtCurrency(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatWeek(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function sourceStatusLabel(source: RevenueDashboardData["trust"]["sources"][number]): string {
  if (source.stale || source.truncated) return "review";
  if (source.status) return source.status.toLowerCase();
  if (source.source === "env") return "env";
  if (source.source === "snapshot") return "snapshot";
  return "missing";
}

function RevenueEmptyState({ dashboard }: { dashboard: RevenueDashboardData | null }) {
  const warnings = dashboard?.trust.warnings ?? [];
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">Revenue dashboard data is unavailable</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            HubSpot, Stripe, or Mercury source data is missing for the selected range.
          </p>
          {warnings.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SourceFreshnessStrip({ dashboard }: { dashboard: RevenueDashboardData }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {dashboard.trust.sources.map((source) => (
        <div key={source.key} className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-foreground">{source.label}</p>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                source.stale || source.lastError || source.truncated
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
              }`}
            >
              {sourceStatusLabel(source)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {source.lastSnapshotAt
              ? `Snapshot ${new Date(source.lastSnapshotAt).toLocaleString()}`
              : source.fetchedAt
                ? `Fetched ${new Date(source.fetchedAt).toLocaleString()}`
                : "No fresh snapshot"}
          </p>
        </div>
      ))}
    </div>
  );
}

function WeeklyRevenueChart({ dashboard }: { dashboard: RevenueDashboardData }) {
  const chartData = dashboard.weekly.slice(-12).map((point) => ({
    week: formatWeek(point.week),
    collected: point.revenueCollected,
    booked: point.hubspotBookedRevenue,
    customers: point.customersWon,
    demos: point.demosScheduled,
  }));

  if (chartData.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Weekly revenue motion</h2>
        <p className="mt-2 text-sm text-muted-foreground">No weekly revenue activity in the selected range.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Weekly revenue motion</h2>
        <p className="text-xs text-muted-foreground">Collected · HubSpot booked · customers won</p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <BarChart width={760} height={280} data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="week" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(value) => fmtCurrency(Number(value))} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value, name) => {
              if (name === "customers" || name === "demos") return [fmtNumber(Number(value)), name];
              return [fmtCurrency(Number(value)), name];
            }}
          />
          <Legend />
          <Bar dataKey="collected" name="Stripe collected" fill="#FC5A29" radius={[3, 3, 0, 0]} />
          <Bar dataKey="booked" name="HubSpot booked" fill="#3b82f6" radius={[3, 3, 0, 0]} />
        </BarChart>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 text-left font-medium">Week</th>
              <th className="py-2 text-right font-medium">Demos</th>
              <th className="py-2 text-right font-medium">Customers</th>
              <th className="py-2 text-right font-medium">Collected</th>
              <th className="py-2 text-right font-medium">Booked</th>
              <th className="py-2 text-right font-medium">Mercury net</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.weekly.slice(-8).map((point) => (
              <tr key={point.week} className="border-b border-border/60 last:border-0">
                <td className="py-2 text-muted-foreground">{point.week}</td>
                <td className="py-2 text-right tabular-nums">{point.demosScheduled}</td>
                <td className="py-2 text-right tabular-nums">{point.customersWon}</td>
                <td className="py-2 text-right tabular-nums">{fmtCurrency(point.revenueCollected)}</td>
                <td className="py-2 text-right tabular-nums">{fmtCurrency(point.hubspotBookedRevenue)}</td>
                <td className="py-2 text-right tabular-nums">{fmtCurrency(point.mercuryNetCashFlow)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PipelineMetrics({ dashboard }: { dashboard: RevenueDashboardData }) {
  const pipeline = dashboard.pipeline;
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Pipeline metrics</h2>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>Win rate {fmtPct(pipeline.winRate)}</span>
          <span>Effective {fmtPct(pipeline.effectiveWinRate)}</span>
          <span>No-show {fmtPct(pipeline.noShowRate)}</span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Open pipeline</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                {fmtCurrency(pipeline.openPipelineValue)}
              </p>
              <p className="text-xs text-muted-foreground">{pipeline.openPipelineCount} deals</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Qualified pipeline</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                {fmtCurrency(pipeline.qualifiedPipelineValue)}
              </p>
              <p className="text-xs text-muted-foreground">{pipeline.qualifiedPipelineCount} deals</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 text-left font-medium">Stage</th>
                  <th className="py-2 text-right font-medium">Deals</th>
                  <th className="py-2 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {pipeline.stageBreakdown.slice(0, 8).map((stage) => (
                  <tr key={stage.stageId} className="border-b border-border/60 last:border-0">
                    <td className="py-2 text-muted-foreground">{stage.label}</td>
                    <td className="py-2 text-right tabular-nums">{stage.count}</td>
                    <td className="py-2 text-right tabular-nums">{fmtCurrency(stage.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Booked value</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                {fmtCurrency(pipeline.bookedValue)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Realized 30d</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                {fmtCurrency(pipeline.realizedValue30d)}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 text-left font-medium">Source</th>
                  <th className="py-2 text-right font-medium">Deals</th>
                  <th className="py-2 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {pipeline.sourceBreakdown.slice(0, 8).map((source) => (
                  <tr key={source.source} className="border-b border-border/60 last:border-0">
                    <td className="py-2 text-muted-foreground">{source.source}</td>
                    <td className="py-2 text-right tabular-nums">{source.count}</td>
                    <td className="py-2 text-right tabular-nums">{fmtCurrency(source.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

export function RevenueDashboard({ data }: RevenueDashboardProps) {
  const dashboard = data?.revenueDashboard ?? null;
  if (!dashboard) return <RevenueEmptyState dashboard={dashboard} />;

  const summary = dashboard.summary;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Investor Revenue</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            HubSpot pipeline, Stripe subscriptions, and Mercury cash context.
          </p>
        </div>
        {dashboard.trust.warnings.length > 0 ? (
          <div className="max-w-xl rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            {dashboard.trust.warnings[0]}
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Sources current
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="ARR" value={fmtCurrency(summary.arr)} subtitle={`${fmtCurrency(summary.mrr)} MRR`} icon={DollarSign} />
        <StatCard
          label="Active subscriptions"
          value={summary.activeSubscriptions}
          subtitle={`${summary.stripeActiveSubscriptions} Stripe · ${summary.hubspotOnlyActiveSubscriptions} HubSpot-only`}
          icon={CreditCard}
        />
        <StatCard
          label="Cash balance"
          value={fmtCurrency(summary.cashBalance)}
          subtitle={`${fmtNumber(summary.runwayMonths)} months runway`}
          icon={Banknote}
        />
        <StatCard
          label="Weekly customers"
          value={dashboard.weekly.slice(-4).reduce((sum, point) => sum + point.customersWon, 0)}
          subtitle="Trailing 4 weeks"
          icon={Users}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard label="Stripe collected" value={fmtCurrency(data?.stripe?.revenue.totalRevenue30d ?? 0)} icon={TrendingUp} />
        <StatCard label="Net cash flow 30d" value={fmtCurrency(summary.netCashFlow30d)} icon={CalendarDays} />
        <StatCard label="Payment success" value={fmtPct(summary.paymentSuccessPct)} icon={ShieldCheck} />
      </div>

      <SourceFreshnessStrip dashboard={dashboard} />
      <WeeklyRevenueChart dashboard={dashboard} />
      <PipelineMetrics dashboard={dashboard} />
    </div>
  );
}
