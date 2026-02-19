"use client";

import { useMemo } from "react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import {
  fmt$,
  fmtPct,
  SectionCard,
  DataTable,
  type DataTableColumn,
  AlertBanner,
} from "@/components/analytics/dashboard-primitives";
import { StatCard } from "@/components/analytics/stat-card";
import { FinanceDataEmptyState } from "@/components/analytics/finance-empty-state";
import { BarDisplay } from "@/components/analytics/bar-display";
import {
  buildProfitAndLoss,
  type PnlLineItem,
  type ProfitAndLossData,
} from "@/lib/analytics/pnl-builder";

/* ── Helpers ─────────────────────────────────────────── */

const EXPENSE_COLORS = [
  "#ef4444", // red-500
  "#f97316", // orange-500
  "#eab308", // yellow-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
  "#14b8a6", // teal-500
  "#6366f1", // indigo-500
];

function changeColor(
  diff: number,
  category: PnlLineItem["category"],
): string {
  if (diff === 0) return "text-muted-foreground";
  // For expenses, a decrease (negative diff) is good
  if (category === "expense") {
    return diff < 0 ? "text-emerald-500" : "text-red-500";
  }
  // For revenue / subtotals / totals, an increase is good
  return diff > 0 ? "text-emerald-500" : "text-red-500";
}

function rowClasses(category: PnlLineItem["category"]): string {
  switch (category) {
    case "subtotal":
      return "font-semibold border-t border-border";
    case "total":
      return "font-bold border-t-2 border-border text-base";
    default:
      return "";
  }
}

/* ── Component ───────────────────────────────────────── */

export function FinancePnlTab({
  data,
}: {
  data: AnalyticsDashboardData | null;
}) {
  const pnl = useMemo(
    () => buildProfitAndLoss(data?.stripe ?? null, data?.mercury ?? null),
    [data],
  );

  // Empty state
  if (!data?.stripe && !data?.mercury) {
    return (
      <FinanceDataEmptyState
        title="Profit & Loss data is unavailable"
        message="Connect Stripe or Mercury to generate a P&L statement."
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  // Derive key values
  const totalRevenue =
    pnl.items.find((i) => i.label === "Total Revenue")?.current ?? 0;
  const prevNetIncome = pnl.previousNetIncome;
  const netIncomeChange =
    prevNetIncome !== 0
      ? `${(((pnl.netIncome - prevNetIncome) / Math.abs(prevNetIncome)) * 100).toFixed(1)}%`
      : undefined;

  // Alerts
  const alerts: {
    severity: "critical" | "warning" | "info";
    title: string;
    description: string;
  }[] = [];

  if (pnl.netIncome < 0) {
    alerts.push({
      severity: "warning",
      title: `Net loss of ${fmt$(Math.abs(pnl.netIncome))} this period`,
      description:
        "The business is operating at a loss. Review expense categories and identify opportunities to reduce costs or increase revenue.",
    });
  }

  if (pnl.grossMargin < 50) {
    alerts.push({
      severity: "info",
      title: `Gross margin at ${fmtPct(pnl.grossMargin)}`,
      description:
        "Gross margin below 50% may limit ability to scale. Consider pricing adjustments or reducing cost of goods sold.",
    });
  }

  // Expense items for bar chart
  const expenseItems = useMemo(
    () =>
      pnl.items
        .filter((i) => i.category === "expense" && i.current !== 0)
        .map((item, idx) => ({
          label: item.label,
          value: Math.abs(item.current),
          color: EXPENSE_COLORS[idx % EXPENSE_COLORS.length],
        })),
    [pnl],
  );

  // Table columns
  const pnlColumns: DataTableColumn<PnlLineItem>[] = [
    {
      key: "label",
      header: "Line Item",
      render: (row) => (
        <span
          className={
            row.category === "subtotal" || row.category === "total"
              ? "font-semibold text-foreground"
              : "text-foreground"
          }
        >
          {row.label}
        </span>
      ),
    },
    {
      key: "current",
      header: pnl.period,
      align: "right",
      render: (row) => {
        const displayValue =
          row.category === "expense" && row.current > 0
            ? -row.current
            : row.current;
        return (
          <span
            className={`tabular-nums ${
              row.category === "subtotal" || row.category === "total"
                ? "font-semibold"
                : ""
            } ${displayValue < 0 ? "text-red-500" : "text-foreground"}`}
          >
            {displayValue < 0 ? `-${fmt$(Math.abs(displayValue))}` : fmt$(displayValue)}
          </span>
        );
      },
    },
    {
      key: "previous",
      header: pnl.previousPeriod,
      align: "right",
      render: (row) => {
        const displayValue =
          row.category === "expense" && row.previous > 0
            ? -row.previous
            : row.previous;
        return (
          <span
            className={`tabular-nums text-muted-foreground ${
              row.category === "subtotal" || row.category === "total"
                ? "font-semibold"
                : ""
            }`}
          >
            {displayValue < 0 ? `-${fmt$(Math.abs(displayValue))}` : fmt$(displayValue)}
          </span>
        );
      },
    },
    {
      key: "change" as keyof PnlLineItem,
      header: "Change",
      align: "right",
      render: (row) => {
        const diff = row.current - row.previous;
        if (diff === 0) {
          return <span className="tabular-nums text-muted-foreground">--</span>;
        }
        const color = changeColor(diff, row.category);
        const arrow = diff > 0 ? "+" : "";
        return (
          <span className={`tabular-nums font-medium ${color}`}>
            {arrow}{fmt$(diff)}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <AlertBanner
              key={i}
              severity={a.severity}
              title={a.title}
              description={a.description}
            />
          ))}
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Net Income"
          value={fmt$(pnl.netIncome)}
          change={netIncomeChange}
          changeType={pnl.netIncome >= prevNetIncome ? "positive" : "negative"}
        />
        <StatCard
          label="Gross Margin"
          value={fmtPct(pnl.grossMargin)}
          changeType={pnl.grossMargin >= 50 ? "positive" : "negative"}
        />
        <StatCard
          label="Operating Margin"
          value={fmtPct(pnl.operatingMargin)}
          changeType={pnl.operatingMargin >= 0 ? "positive" : "negative"}
        />
        <StatCard
          label="Revenue"
          value={fmt$(totalRevenue)}
        />
      </div>

      {/* P&L Statement Table */}
      <SectionCard
        title="Profit & Loss Statement"
        subtitle={`${pnl.period} vs. ${pnl.previousPeriod}`}
      >
        <DataTable
          columns={pnlColumns}
          rows={pnl.items}
          emptyMessage="No P&L data available"
          rowClassName={(row) => rowClasses(row.category)}
        />
      </SectionCard>

      {/* Expense Breakdown */}
      {expenseItems.length > 0 && (
        <SectionCard
          title="Expense Breakdown"
          subtitle="Current period expenses by category"
        >
          <BarDisplay items={expenseItems} formatValue={fmt$} />
        </SectionCard>
      )}
    </div>
  );
}
