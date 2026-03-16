import type { ExpenseCategory, MercuryData } from "@/lib/analytics/types";

function monthlyEquivalent(value: number, observedPeriodDays: number): number {
  const baselineDays = Number.isFinite(observedPeriodDays) && observedPeriodDays > 0
    ? observedPeriodDays
    : 30;
  return value * (30 / baselineDays);
}

function scaleBreakdown(
  breakdown: Record<ExpenseCategory, number> | undefined,
  observedPeriodDays: number,
): Record<ExpenseCategory, number> | undefined {
  if (!breakdown) return undefined;
  return {
    cogs: monthlyEquivalent(breakdown.cogs ?? 0, observedPeriodDays),
    payroll: monthlyEquivalent(breakdown.payroll ?? 0, observedPeriodDays),
    marketing: monthlyEquivalent(breakdown.marketing ?? 0, observedPeriodDays),
    infrastructure: monthlyEquivalent(breakdown.infrastructure ?? 0, observedPeriodDays),
    ops: monthlyEquivalent(breakdown.ops ?? 0, observedPeriodDays),
    other: monthlyEquivalent(breakdown.other ?? 0, observedPeriodDays),
  };
}

export function normalizeMercuryDataPayload(mercury: MercuryData | null): MercuryData | null {
  if (!mercury) return null;

  const observedPeriodDays = mercury.cashFlow.observedPeriodDays ?? 30;
  const hasObservedTotals =
    typeof mercury.cashFlow.observedInflowTotal === "number" ||
    typeof mercury.cashFlow.observedOutflowTotal === "number" ||
    typeof mercury.cashFlow.observedNetCashFlow === "number" ||
    Boolean(mercury.cashFlow.observedExpenseBreakdown);

  if (hasObservedTotals || observedPeriodDays === 30) {
    return mercury;
  }

  const observedInflowTotal = mercury.cashFlow.inflows30d ?? 0;
  const observedOutflowTotal = mercury.cashFlow.outflows30d ?? 0;
  const observedNetCashFlow = mercury.cashFlow.netCashFlow ?? (observedInflowTotal - observedOutflowTotal);
  const observedExpenseBreakdown = mercury.cashFlow.expenseBreakdown30d;

  const monthlyInflows = monthlyEquivalent(observedInflowTotal, observedPeriodDays);
  const monthlyOutflows = monthlyEquivalent(observedOutflowTotal, observedPeriodDays);
  const monthlyNetCashFlow = monthlyEquivalent(observedNetCashFlow, observedPeriodDays);
  const burnRate = Math.max(monthlyOutflows - monthlyInflows, 0);
  const runway = burnRate > 0 ? mercury.cashFlow.totalBalance / burnRate : 999;

  return {
    ...mercury,
    cashFlow: {
      ...mercury.cashFlow,
      inflows30d: Math.round(monthlyInflows * 100) / 100,
      outflows30d: Math.round(monthlyOutflows * 100) / 100,
      netCashFlow: Math.round(monthlyNetCashFlow * 100) / 100,
      burnRate: Math.round(burnRate * 100) / 100,
      runway: Math.round(runway * 10) / 10,
      observedPeriodDays,
      observedInflowTotal,
      observedOutflowTotal,
      observedNetCashFlow,
      observedExpenseBreakdown,
      expenseBreakdown30d: scaleBreakdown(observedExpenseBreakdown, observedPeriodDays),
    },
  };
}
