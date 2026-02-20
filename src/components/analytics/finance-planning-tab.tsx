"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type BudgetPeriodApi = "MONTHLY" | "QUARTERLY" | "ANNUAL";
type BudgetCategoryApi = "COGS" | "PAYROLL" | "MARKETING" | "INFRASTRUCTURE" | "OPS" | "OTHER";

type BudgetLineItemApi = {
  id: string;
  category: BudgetCategoryApi;
  plannedAmount: number;
  notes?: string | null;
};

type BudgetApi = {
  id: string;
  name: string;
  period: BudgetPeriodApi;
  startDate: string;
  endDate: string;
  lineItems: BudgetLineItemApi[];
  createdAt?: string;
  updatedAt?: string;
};

const CATEGORY_CONFIG: Array<{ key: BudgetCategoryApi; label: string }> = [
  { key: "COGS", label: "Cost of Goods Sold" },
  { key: "PAYROLL", label: "Payroll & Benefits" },
  { key: "MARKETING", label: "Sales & Marketing" },
  { key: "INFRASTRUCTURE", label: "Infrastructure & Hosting" },
  { key: "OPS", label: "General & Administrative" },
  { key: "OTHER", label: "Other" },
];

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateInput(value: string): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function endDateForPeriod(startDate: string, period: BudgetPeriodApi): string {
  const parsed = parseDateInput(startDate);
  if (!parsed) return "";
  const months = period === "MONTHLY" ? 1 : period === "QUARTERLY" ? 3 : 12;
  const end = addMonths(parsed, months);
  end.setDate(end.getDate() - 1);
  return formatDateInput(end);
}

function defaultDateRange(period: BudgetPeriodApi): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start: formatDateInput(start), end: endDateForPeriod(formatDateInput(start), period) };
}

function emptyAmounts(): Record<BudgetCategoryApi, string> {
  return {
    COGS: "",
    PAYROLL: "",
    MARKETING: "",
    INFRASTRUCTURE: "",
    OPS: "",
    OTHER: "",
  };
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

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
  const [budgets, setBudgets] = useState<BudgetApi[]>([]);
  const [budgetsLoading, setBudgetsLoading] = useState(true);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formInitialized, setFormInitialized] = useState(false);
  const [formName, setFormName] = useState("Baseline Budget");
  const [formPeriod, setFormPeriod] = useState<BudgetPeriodApi>("MONTHLY");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formAmounts, setFormAmounts] = useState<Record<BudgetCategoryApi, string>>(emptyAmounts());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /* ── Empty state ──────────────────────────────────── */

  if (!data?.stripe && !data?.mercury) {
    return (
      <FinanceDataEmptyState
        provider="Finance"
        reasons={["No Stripe or Mercury data"]}
      />
    );
  }

  const loadBudgets = useCallback(async () => {
    setBudgetsLoading(true);
    setBudgetError(null);
    try {
      const response = await fetch("/api/financial-planning/budgets", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to load budgets (${response.status})`);
      }
      const payload = (await response.json()) as BudgetApi[];
      setBudgets(Array.isArray(payload) ? payload : []);
    } catch (error) {
      setBudgetError(error instanceof Error ? error.message : "Failed to load budgets");
      setBudgets([]);
    } finally {
      setBudgetsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBudgets();
  }, [loadBudgets]);

  const activeBudget = budgets[0] ?? null;

  const seedFormDefaults = useCallback((period: BudgetPeriodApi = "MONTHLY") => {
    const range = defaultDateRange(period);
    setFormName("Baseline Budget");
    setFormPeriod(period);
    setFormStartDate(range.start);
    setFormEndDate(range.end);
    setFormAmounts(emptyAmounts());
  }, []);

  const seedFormFromBudget = useCallback((budget: BudgetApi) => {
    setFormName(budget.name ?? "Baseline Budget");
    setFormPeriod(budget.period ?? "MONTHLY");
    setFormStartDate(budget.startDate ? budget.startDate.slice(0, 10) : "");
    setFormEndDate(budget.endDate ? budget.endDate.slice(0, 10) : "");
    const nextAmounts = emptyAmounts();
    for (const item of budget.lineItems ?? []) {
      nextAmounts[item.category] = String(item.plannedAmount ?? "");
    }
    setFormAmounts(nextAmounts);
  }, []);

  useEffect(() => {
    if (formInitialized || budgetsLoading) return;
    if (activeBudget) {
      seedFormFromBudget(activeBudget);
      setFormOpen(false);
    } else {
      seedFormDefaults("MONTHLY");
      setFormOpen(true);
    }
    setFormInitialized(true);
  }, [activeBudget, budgetsLoading, formInitialized, seedFormDefaults, seedFormFromBudget]);

  const budgetAmounts = useMemo(() => {
    if (!activeBudget || !activeBudget.lineItems?.length) return undefined;
    const amounts: Record<string, number> = {};
    for (const config of CATEGORY_CONFIG) {
      amounts[config.label] = 0;
    }
    for (const item of activeBudget.lineItems) {
      const config = CATEGORY_CONFIG.find((entry) => entry.key === item.category);
      if (!config) continue;
      amounts[config.label] = item.plannedAmount ?? 0;
    }
    return amounts;
  }, [activeBudget]);

  /* ── Computed data ────────────────────────────────── */

  const budgetItems = useMemo(
    () => computeBudgetActuals(data?.mercury ?? null, budgetAmounts),
    [data?.mercury, budgetAmounts],
  );

  const budgetSummary = useMemo(
    () => computeBudgetSummary(budgetItems),
    [budgetItems],
  );

  const hasBudgetBaseline = Boolean(activeBudget && activeBudget.lineItems?.length);

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
  }, [budgetSummary.overspendCategories, hasBudgetBaseline]);

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
  }, [budgetItems, budgetSummary, goals, hasBudgetBaseline]);

  const plannedTotal = useMemo(() => {
    return CATEGORY_CONFIG.reduce((sum, category) => sum + toNumber(formAmounts[category.key]), 0);
  }, [formAmounts]);

  const handleSaveBaseline = useCallback(async () => {
    setSaveError(null);
    if (!formStartDate || !formEndDate) {
      setSaveError("Start and end dates are required.");
      return;
    }
    const payload = {
      name: formName.trim() || "Baseline Budget",
      period: formPeriod,
      startDate: formStartDate,
      endDate: formEndDate,
      lineItems: CATEGORY_CONFIG.map((category) => ({
        category: category.key,
        plannedAmount: toNumber(formAmounts[category.key]),
      })),
    };

    setSaving(true);
    try {
      const url = activeBudget
        ? `/api/financial-planning/budgets/${activeBudget.id}`
        : "/api/financial-planning/budgets";
      const response = await fetch(url, {
        method: activeBudget ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(message || `Failed to save budget (${response.status})`);
      }
      await loadBudgets();
      setFormOpen(false);
      setFormInitialized(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save budget");
    } finally {
      setSaving(false);
    }
  }, [
    activeBudget,
    formEndDate,
    formName,
    formPeriod,
    formStartDate,
    formAmounts,
    loadBudgets,
  ]);

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

      <SectionCard
        title="Budget Baseline"
        subtitle="Define monthly targets to unlock variance alerts and overspend tracking."
      >
        {budgetsLoading ? (
          <p className="text-sm text-muted-foreground">Loading budgets...</p>
        ) : budgetError ? (
          <p className="text-sm text-red-500">{budgetError}</p>
        ) : null}

        {activeBudget && !formOpen ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{activeBudget.name}</p>
                <p className="text-xs text-muted-foreground">
                  {activeBudget.period} · {activeBudget.startDate.slice(0, 10)} → {activeBudget.endDate.slice(0, 10)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  seedFormFromBudget(activeBudget);
                  setFormOpen(true);
                }}
                className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Edit baseline
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {CATEGORY_CONFIG.map((category) => (
                <div key={category.key} className="rounded-md border border-border bg-secondary/20 px-3 py-2">
                  <p className="text-xs text-muted-foreground">{category.label}</p>
                  <p className="text-sm font-semibold text-foreground">
                    {fmt$(
                      activeBudget.lineItems?.find((item) => item.category === category.key)?.plannedAmount ?? 0
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-muted-foreground">
                Budget name
                <input
                  type="text"
                  value={formName}
                  onChange={(event) => setFormName(event.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Period
                <select
                  value={formPeriod}
                  onChange={(event) => {
                    const nextPeriod = event.target.value as BudgetPeriodApi;
                    setFormPeriod(nextPeriod);
                    if (formStartDate) {
                      setFormEndDate(endDateForPeriod(formStartDate, nextPeriod));
                    }
                  }}
                  className="mt-1 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground"
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="ANNUAL">Annual</option>
                </select>
              </label>
              <label className="text-xs text-muted-foreground">
                Start date
                <input
                  type="date"
                  value={formStartDate}
                  onChange={(event) => {
                    const nextStart = event.target.value;
                    setFormStartDate(nextStart);
                    if (nextStart) {
                      setFormEndDate(endDateForPeriod(nextStart, formPeriod));
                    }
                  }}
                  className="mt-1 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                End date
                <input
                  type="date"
                  value={formEndDate}
                  onChange={(event) => setFormEndDate(event.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CATEGORY_CONFIG.map((category) => (
                <label key={category.key} className="text-xs text-muted-foreground">
                  {category.label}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formAmounts[category.key]}
                    onChange={(event) =>
                      setFormAmounts((prev) => ({ ...prev, [category.key]: event.target.value }))
                    }
                    className="mt-1 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground"
                  />
                </label>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Planned total: <span className="font-semibold text-foreground">{fmt$(plannedTotal)}</span>
              </p>
              <div className="flex items-center gap-2">
                {activeBudget && (
                  <button
                    type="button"
                    onClick={() => setFormOpen(false)}
                    className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSaveBaseline}
                  disabled={saving}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-70"
                >
                  {saving ? "Saving..." : activeBudget ? "Update baseline" : "Create baseline"}
                </button>
              </div>
            </div>

            {saveError && <p className="text-xs text-red-500">{saveError}</p>}
          </div>
        )}
      </SectionCard>

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
