"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Loader2,
} from "lucide-react";
import {
  fmt$,
  fmtPct,
  SectionCard,
  AlertBanner,
} from "@/components/analytics/dashboard-primitives";
import { AreaTrend } from "@/components/charts/area-trend";
import { SparkLine } from "@/components/charts/spark-line";
import type { MonthlyPnLEntry, MonthlyPnLHistory } from "@/lib/analytics/monthly-pnl-history";

/* ── Helpers ─────────────────────────────────────────── */

function formatMonth(month: string): string {
  const [y, m] = month.split("-");
  const date = new Date(parseInt(y), parseInt(m) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function cellColor(diff: number, invertForExpense = false): string {
  if (diff === 0) return "text-muted-foreground";
  if (invertForExpense) {
    return diff < 0 ? "text-emerald-500" : "text-red-500";
  }
  return diff > 0 ? "text-emerald-500" : "text-red-500";
}

function momChange(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "—" : "+∞";
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

/* ── Line Item Row ───────────────────────────────────── */

type LineItemKey =
  | "revenue"
  | "cogs"
  | "grossProfit"
  | "payroll"
  | "marketing"
  | "infrastructure"
  | "ops"
  | "totalOpex"
  | "operatingIncome"
  | "netIncome";

interface LineItemDef {
  key: LineItemKey;
  label: string;
  isBold: boolean;
  isExpense: boolean;
  extract: (entry: MonthlyPnLEntry) => number;
}

const LINE_ITEMS: LineItemDef[] = [
  { key: "revenue", label: "Revenue", isBold: false, isExpense: false, extract: (e) => e.revenue },
  { key: "cogs", label: "Cost of Goods Sold", isBold: false, isExpense: true, extract: (e) => e.cogs },
  { key: "grossProfit", label: "Gross Profit", isBold: true, isExpense: false, extract: (e) => e.grossProfit },
  { key: "payroll", label: "  Payroll & Compensation", isBold: false, isExpense: true, extract: (e) => e.operatingExpenses.payroll },
  { key: "marketing", label: "  Marketing & Sales", isBold: false, isExpense: true, extract: (e) => e.operatingExpenses.marketing },
  { key: "infrastructure", label: "  Infrastructure & Tools", isBold: false, isExpense: true, extract: (e) => e.operatingExpenses.infrastructure },
  { key: "ops", label: "  General & Administrative", isBold: false, isExpense: true, extract: (e) => e.operatingExpenses.ops },
  { key: "totalOpex", label: "Total Operating Expenses", isBold: true, isExpense: true, extract: (e) => e.totalOpex },
  { key: "operatingIncome", label: "Operating Income", isBold: true, isExpense: false, extract: (e) => e.operatingIncome },
  { key: "netIncome", label: "Net Income", isBold: true, isExpense: false, extract: (e) => e.netIncome },
];

/* ── KPI Summary Row ─────────────────────────────────── */

interface KpiDef {
  label: string;
  extract: (entry: MonthlyPnLEntry) => number | null;
  format: (v: number) => string;
}

const KPI_ROWS: KpiDef[] = [
  { label: "MRR", extract: (e) => e.mrr, format: (v) => fmt$(v) },
  { label: "Gross Margin", extract: (e) => e.grossMarginPct, format: (v) => fmtPct(v) },
  { label: "Operating Margin", extract: (e) => e.operatingMarginPct, format: (v) => fmtPct(v) },
  { label: "Cash Balance", extract: (e) => e.cashBalance, format: (v) => fmt$(v) },
  { label: "Monthly Burn", extract: (e) => e.burnRate, format: (v) => fmt$(v) },
  { label: "Active Subs", extract: (e) => e.activeSubscriptions, format: (v) => v.toLocaleString() },
  { label: "Churn Rate", extract: (e) => e.churnRate, format: (v) => fmtPct(v) },
];

/* ── Component ───────────────────────────────────────── */

export function FinanceMonthlyHistoryTab() {
  const [data, setData] = useState<MonthlyPnLHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/financial-planning/monthly-history?months=12");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const months = useMemo(() => data?.months ?? [], [data]);

  // Revenue trend data for chart
  const revenueTrendData = useMemo(
    () => months.map((m) => ({ month: formatMonth(m.month), revenue: m.revenue, netIncome: m.netIncome })),
    [months],
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading monthly history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <AlertBanner
        severity="warning"
        title="Failed to load monthly history"
        description={error}
      />
    );
  }

  if (months.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-secondary/20 text-center">
        <Calendar className="mb-3 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-medium text-muted-foreground">No monthly data available</p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Monthly snapshots will appear after Stripe and Mercury integrations have been connected for at least one billing cycle.
        </p>
      </div>
    );
  }

  const mom = data?.latestMoM;

  return (
    <div className="space-y-6">
      {/* MoM Summary Alerts */}
      {mom && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MomKpiCard
            label="Revenue MoM"
            value={mom.revenueChangePct}
            delta={fmt$(mom.revenueChange)}
            positive={mom.revenueChange >= 0}
          />
          <MomKpiCard
            label="Net Income MoM"
            value={mom.netIncomeChangePct}
            delta={fmt$(mom.netIncomeChange)}
            positive={mom.netIncomeChange >= 0}
          />
          <MomKpiCard
            label="Gross Margin MoM"
            value={mom.grossMarginChange}
            delta={`${mom.grossMarginChange >= 0 ? "+" : ""}${mom.grossMarginChange.toFixed(1)}pp`}
            positive={mom.grossMarginChange >= 0}
            suffix="pp"
          />
          {mom.burnRateChange != null && (
            <MomKpiCard
              label="Burn Rate MoM"
              value={0}
              delta={fmt$(mom.burnRateChange)}
              positive={mom.burnRateChange <= 0}
              invertColors
            />
          )}
        </div>
      )}

      {/* Revenue & Net Income Trend Chart */}
      {revenueTrendData.length >= 2 && (
        <SectionCard title="Revenue & Net Income Trend" subtitle="Monthly trajectory">
          <AreaTrend
            data={revenueTrendData}
            xKey="month"
            yKeys={["revenue", "netIncome"]}
            height={220}
            yFormatter={(v) => fmt$(v)}
          />
        </SectionCard>
      )}

      {/* Monthly P&L Table */}
      <SectionCard
        title="Monthly P&L Statement"
        subtitle={`${formatMonth(months[0].month)} — ${formatMonth(months[months.length - 1].month)}`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th className="sticky left-0 bg-card pb-2 pr-4 text-left font-medium">Line Item</th>
                {months.map((m) => (
                  <th key={m.month} className="pb-2 pr-4 text-right font-medium last:pr-0">
                    {formatMonth(m.month)}
                  </th>
                ))}
                <th className="pb-2 text-right font-medium">Trend</th>
              </tr>
            </thead>
            <tbody>
              {LINE_ITEMS.map((item) => {
                const values = months.map(item.extract);
                const borderClass = item.isBold ? "border-t border-border" : "";
                return (
                  <tr key={item.key} className={`${borderClass} hover:bg-secondary/20`}>
                    <td className={`sticky left-0 bg-card py-2 pr-4 ${item.isBold ? "font-semibold text-foreground" : "text-foreground"}`}>
                      {item.label}
                    </td>
                    {values.map((v, i) => {
                      const prev = i > 0 ? values[i - 1] : v;
                      const diff = v - prev;
                      const color = i > 0 ? cellColor(diff, item.isExpense) : "text-foreground";
                      const display = item.isExpense && v > 0 ? `-${fmt$(v)}` : fmt$(v);
                      return (
                        <td key={months[i].month} className={`py-2 pr-4 text-right tabular-nums last:pr-0 ${item.isBold ? "font-semibold" : ""}`}>
                          <span className={i > 0 && diff !== 0 ? color : "text-foreground"}>{display}</span>
                          {i > 0 && (
                            <span className={`block text-[10px] ${color}`}>
                              {momChange(v, prev)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2 text-right">
                      {values.length >= 2 && (
                        <SparkLine data={values} width={64} height={20} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Key Metrics History */}
      <SectionCard title="Key Metrics History" subtitle="Monthly operating metrics">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th className="sticky left-0 bg-card pb-2 pr-4 text-left font-medium">Metric</th>
                {months.map((m) => (
                  <th key={m.month} className="pb-2 pr-4 text-right font-medium last:pr-0">
                    {formatMonth(m.month)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {KPI_ROWS.map((kpi) => {
                const values = months.map(kpi.extract);
                const hasData = values.some((v) => v != null);
                if (!hasData) return null;
                return (
                  <tr key={kpi.label} className="hover:bg-secondary/20">
                    <td className="sticky left-0 bg-card py-2 pr-4 text-foreground">{kpi.label}</td>
                    {values.map((v, i) => (
                      <td key={months[i].month} className="py-2 pr-4 text-right tabular-nums last:pr-0 text-foreground">
                        {v != null ? kpi.format(v) : "—"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Refresh */}
      <div className="flex justify-end">
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs text-foreground hover:bg-secondary/60"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>
    </div>
  );
}

/* ── MoM KPI Card ────────────────────────────────────── */

function MomKpiCard({
  label,
  value,
  delta,
  positive,
  invertColors = false,
  suffix = "%",
}: {
  label: string;
  value: number;
  delta: string;
  positive: boolean;
  invertColors?: boolean;
  suffix?: string;
}) {
  const isGood = invertColors ? !positive : positive;
  const color = isGood ? "text-emerald-500" : "text-red-500";
  const Icon = positive ? TrendingUp : TrendingDown;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-end gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className={`text-lg font-bold tabular-nums ${color}`}>
          {value >= 0 ? "+" : ""}{value.toFixed(1)}{suffix}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{delta}</p>
    </div>
  );
}
