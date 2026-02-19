"use client";

import { useMemo } from "react";
import { Target, Wallet, AlertTriangle, TrendingDown } from "lucide-react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { FinanceDataEmptyState } from "@/components/analytics/finance-empty-state";
import { StatCard } from "@/components/analytics/stat-card";
import { BarDisplay } from "@/components/analytics/bar-display";
import {
  fmt$,
  fmtPct,
  SectionCard,
  InsightCard,
  DataTable,
  AlertBanner,
  type DataTableColumn,
} from "./dashboard-primitives";
import {
  computeBudgetActuals,
  computeBudgetSummary,
  type BudgetActualItem,
} from "@/lib/analytics/budget-variance";
import { computeVariance, fmtDelta, runwayColor } from "@/lib/analytics/finance-utils";
import { computeFinancialGoals, type FinancialGoal } from "@/lib/analytics/finance-modeling";

/* ── Status badge helper ───────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    under: { bg: "bg-emerald-500/10", text: "text-emerald-500", label: "Under" },
    on_track: { bg: "bg-blue-500/10", text: "text-blue-500", label: "On Track" },
    over: { bg: "bg-red-500/10", text: "text-red-500", label: "Over" },
  };

  const cfg = config[status] ?? config.on_track;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  );
}

/* ── Goal progress color ───────────────────────────────── */

function goalColor(progress: number, onTrack: boolean): string {
  if (onTrack) return "bg-emerald-500";
  if (progress >= 50) return "bg-yellow-500";
  return "bg-red-500";
}

/* ── Main component ────────────────────────────────────── */

interface FinancePlanningTabProps {
  data: AnalyticsDashboardData | null;
}

export function FinancePlanningTab({ data }: FinancePlanningTabProps) {
  /* ── Empty state ──────────────────────────────────── */

  if (!data?.stripe && !data?.mercury) {
    return (
      <FinanceDataEmptyState
        provider="Finance"
        reasons={["No Stripe or Mercury data"]}
      />
    );
  }

  /* ── Computed data ────────────────────────────────── */

  const budgetItems = useMemo(
    () => computeBudgetActuals(data?.mercury ?? null),
    [data?.mercury],
  );

  const budgetSummary = useMemo(
    () => computeBudgetSummary(budgetItems),
    [budgetItems],
  );

  const hasBudgetBaseline = false;

  const goals = useMemo<FinancialGoal[]>(
    () => (data ? computeFinancialGoals(data) : []),
    [data],
  );

  /* ── Alert banners ────────────────────────────────── */

  const alerts = useMemo(() => {
    const items: { severity: "critical" | "warning" | "info"; title: string; description: string }[] = [];

    if (!hasBudgetBaseline) {
      items.push({
        severity: "info",
        title: "Budget baseline not configured",
        description: "Variance alerts are disabled until a baseline budget is set.",
      });
    }

    if (hasBudgetBaseline && budgetSummary.overspendCategories.length > 0) {
      items.push({
        severity: "warning",
        title: `${budgetSummary.overspendCategories.length} categor${budgetSummary.overspendCategories.length === 1 ? "y" : "ies"} over budget`,
        description: `Overspending in: ${budgetSummary.overspendCategories.join(", ")}. Review allocations or adjust spending.`,
      });
    }

    return items;
  }, [budgetSummary.overspendCategories]);

  /* ── Insights ─────────────────────────────────────── */

  const insights = useMemo(() => {
    const items: { title: string; insight: string; action?: string; severity: "critical" | "warning" | "info" | "success" }[] = [];

    // Critical: any category overspending > 20%
    if (hasBudgetBaseline) {
      const heavyOverspend = budgetItems.filter(
        (b) => b.variancePct > 20 && b.status === "over",
      );
      if (heavyOverspend.length > 0) {
        items.push({
          title: "Significant Budget Overrun",
          insight: `${heavyOverspend.map((h) => h.category).join(", ")} ${heavyOverspend.length === 1 ? "is" : "are"} more than 20% over budget. Immediate review recommended.`,
          action: "Audit these categories and reallocate funds or renegotiate vendor contracts.",
          severity: "critical",
        });
      }
    }

    // Success: all goals on track
    if (goals.length > 0 && goals.every((g) => g.onTrack)) {
      items.push({
        title: "All Goals On Track",
        insight: "Every financial goal is progressing as expected. Maintain current trajectory.",
        severity: "success",
      });
    }

    // Warning: runway extension goal not on track
    const runwayGoal = goals.find((g) => g.id === "runway-extension");
    if (runwayGoal && !runwayGoal.onTrack) {
      items.push({
        title: "Runway Extension At Risk",
        insight: `Runway target of ${runwayGoal.target} months is not on track. Current: ${runwayGoal.current.toFixed(1)} months.`,
        action: runwayGoal.suggestion,
        severity: "warning",
      });
    }

    // Info: budget surplus
    if (hasBudgetBaseline && budgetSummary.totalVariance < 0) {
      items.push({
        title: "Under Budget Overall",
        insight: `Total spending is ${fmt$(Math.abs(budgetSummary.totalVariance))} under budget (${fmtPct(Math.abs(budgetSummary.totalVariancePct))}). Consider reallocating surplus to growth areas.`,
        severity: "info",
      });
    }

    return items;
  }, [budgetItems, budgetSummary, goals]);

  /* ── Budget variance table columns ────────────────── */

  const budgetColumns: DataTableColumn<BudgetActualItem>[] = useMemo(
    () => [
      {
        key: "category",
        header: "Category",
        render: (row) => (
          <span className="font-medium text-foreground">{row.category}</span>
        ),
      },
      {
        key: "budgeted",
        header: "Budgeted",
        align: "right" as const,
        render: (row) => (
          <span className="tabular-nums text-muted-foreground">{fmt$(row.budgeted)}</span>
        ),
      },
      {
        key: "actual",
        header: "Actual",
        align: "right" as const,
        render: (row) => (
          <span className="tabular-nums text-foreground">{fmt$(row.actual)}</span>
        ),
      },
      {
        key: "variance",
        header: "Variance",
        align: "right" as const,
        render: (row) => (
          <span
            className={`tabular-nums font-medium ${
              row.variance > 0 ? "text-red-500" : row.variance < 0 ? "text-emerald-500" : "text-muted-foreground"
            }`}
          >
            {fmtDelta(row.variance)}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        align: "center" as const,
        render: (row) => <StatusBadge status={row.status} />,
      },
    ],
    [],
  );

  /* ── Bar display items ────────────────────────────── */

  const barItems = useMemo(
    () =>
      budgetItems.map((item) => ({
        label: `${item.category} (actual)`,
        value: item.actual,
        color:
          item.status === "over"
            ? "#ef4444"
            : item.status === "under"
              ? "#22c55e"
              : "#3b82f6",
      })),
    [budgetItems],
  );

  const barBudgetItems = useMemo(
    () =>
      budgetItems.map((item) => ({
        label: `${item.category} (budget)`,
        value: item.budgeted,
        color: "#6b7280",
      })),
    [budgetItems],
  );

  /* ── Render ───────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Alert Banners */}
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

      {/* Top Row: Budget Summary StatCards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Budget"
          value={fmt$(budgetSummary.totalBudget)}
          subtitle="/month"
          icon={Wallet}
        />
        <StatCard
          label="Total Actual"
          value={fmt$(budgetSummary.totalActual)}
          change={
            hasBudgetBaseline
              ? `${budgetSummary.totalVariancePct >= 0 ? "+" : ""}${fmtPct(budgetSummary.totalVariancePct)} vs budget`
              : undefined
          }
          changeType={
            hasBudgetBaseline
              ? budgetSummary.totalVariancePct > 5
                ? "negative"
                : budgetSummary.totalVariancePct < -5
                  ? "positive"
                  : "neutral"
              : "neutral"
          }
          icon={TrendingDown}
        />
        <StatCard
          label="Variance"
          value={hasBudgetBaseline ? fmtDelta(budgetSummary.totalVariance) : "—"}
          changeType={
            hasBudgetBaseline ? (budgetSummary.totalVariance > 0 ? "negative" : "positive") : "neutral"
          }
          icon={AlertTriangle}
          iconColor={
            hasBudgetBaseline
              ? budgetSummary.totalVariance > 0
                ? "text-red-500"
                : "text-emerald-500"
              : "text-muted-foreground"
          }
        />
        <StatCard
          label="Overspend Areas"
          value={hasBudgetBaseline ? budgetSummary.overspendCategories.length.toString() : "—"}
          changeType={hasBudgetBaseline ? (budgetSummary.overspendCategories.length > 0 ? "negative" : "positive") : "neutral"}
          icon={Target}
          iconColor={
            hasBudgetBaseline
              ? budgetSummary.overspendCategories.length > 0
                ? "text-red-500"
                : "text-primary"
              : "text-muted-foreground"
          }
        />
      </div>

      {/* Budget Variance Table */}
      <SectionCard title="Budget vs Actual" subtitle="Monthly budget variance by category">
        <DataTable
          columns={budgetColumns}
          rows={budgetItems}
          emptyMessage="No budget data available"
        />
      </SectionCard>

      {/* Budget Category Breakdown */}
      {budgetItems.length > 0 && (
        <SectionCard title="Category Breakdown" subtitle="Actual spending by category">
          <BarDisplay items={barItems} formatValue={fmt$} />
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Budget Allocation
            </p>
            <BarDisplay items={barBudgetItems} formatValue={fmt$} />
          </div>
        </SectionCard>
      )}

      {/* Goals Tracker */}
      {goals.length > 0 && (
        <SectionCard title="Financial Goals" subtitle="Track progress toward key milestones">
          <div className="space-y-4">
            {goals.map((goal) => (
              <div
                key={goal.id}
                className="rounded-lg border border-border bg-secondary/20 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-foreground">
                        {goal.label}
                      </h4>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          goal.onTrack
                            ? "bg-emerald-500/10 text-emerald-500"
                            : "bg-red-500/10 text-red-500"
                        }`}
                      >
                        {goal.onTrack ? "On Track" : "At Risk"}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-2">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {goal.unit === "currency"
                            ? fmt$(goal.current)
                            : goal.unit === "percent"
                              ? fmtPct(goal.current)
                              : `${goal.current.toFixed(1)} ${goal.unit}`}
                        </span>
                        <span className="font-medium text-foreground">
                          {goal.unit === "currency"
                            ? fmt$(goal.target)
                            : goal.unit === "percent"
                              ? fmtPct(goal.target)
                              : `${goal.target} ${goal.unit}`}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${goalColor(goal.progress, goal.onTrack)}`}
                          style={{ width: `${Math.min(goal.progress, 100)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-right text-[11px] tabular-nums text-muted-foreground">
                        {goal.progress.toFixed(0)}% complete
                      </p>
                    </div>

                    {/* Projected date */}
                    {goal.projectedDate && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Projected:</span>{" "}
                        {new Date(goal.projectedDate).toLocaleDateString("en-US", {
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    )}

                    {/* Suggestion */}
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {goal.suggestion}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Insights & Recommendations */}
      {insights.length > 0 && (
        <SectionCard title="Insights & Recommendations">
          <div className="grid gap-2 sm:grid-cols-2">
            {insights.map((ins, i) => (
              <InsightCard
                key={i}
                title={ins.title}
                insight={ins.insight}
                action={ins.action}
                severity={ins.severity}
              />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
