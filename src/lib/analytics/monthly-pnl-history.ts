// Monthly P&L History — builds month-by-month P&L statements from historical
// AnalyticsSnapshot records for Stripe and Mercury providers.

import { prisma } from "@/lib/prisma";
import { AnalyticsSnapshotStatus } from "@/generated/prisma/client";
import { buildProfitAndLossCore } from "./pnl-builder";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import type { StripeData, MercuryData, PnLRow } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MonthlyPnLEntry {
  /** ISO month string, e.g. "2026-03" */
  month: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  operatingExpenses: {
    payroll: number;
    marketing: number;
    infrastructure: number;
    ops: number;
  };
  totalOpex: number;
  operatingIncome: number;
  operatingMarginPct: number;
  netIncome: number;
  /** Mercury cash balance at snapshot time */
  cashBalance: number | null;
  /** Mercury burn rate at snapshot time */
  burnRate: number | null;
  /** Stripe MRR at snapshot time */
  mrr: number | null;
  /** Stripe active subscriptions at snapshot time */
  activeSubscriptions: number | null;
  /** Stripe churn rate at snapshot time */
  churnRate: number | null;
}

export interface MonthlyPnLHistory {
  months: MonthlyPnLEntry[];
  /** Summary MoM changes for the most recent two months */
  latestMoM: {
    revenueChange: number;
    revenueChangePct: number;
    netIncomeChange: number;
    netIncomeChangePct: number;
    grossMarginChange: number;
    burnRateChange: number | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Snapshot loading
// ---------------------------------------------------------------------------

interface MonthlySnapshot {
  month: string;
  stripe: StripeData | null;
  mercury: MercuryData | null;
}

async function loadMonthlySnapshots(
  userId: string,
  monthsBack: number,
): Promise<MonthlySnapshot[]> {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);

  // Fetch all successful snapshots for stripe and mercury since cutoff
  const snapshots = await prisma.analyticsSnapshot.findMany({
    where: {
      userId,
      providerKey: { in: ["stripe", "mercury"] },
      status: AnalyticsSnapshotStatus.SUCCESS,
      capturedAt: { gte: cutoff },
    },
    orderBy: { capturedAt: "desc" },
    select: {
      providerKey: true,
      payload: true,
      capturedAt: true,
    },
  });

  // Group by month, taking the latest snapshot per provider per month
  const monthMap = new Map<string, { stripe: StripeData | null; mercury: MercuryData | null }>();

  for (const snap of snapshots) {
    const month = `${snap.capturedAt.getFullYear()}-${String(snap.capturedAt.getMonth() + 1).padStart(2, "0")}`;
    if (!monthMap.has(month)) {
      monthMap.set(month, { stripe: null, mercury: null });
    }
    const entry = monthMap.get(month)!;
    // Only take the first (latest due to desc ordering) per provider per month
    if (snap.providerKey === "stripe" && !entry.stripe) {
      entry.stripe = snap.payload as StripeData | null;
    }
    if (snap.providerKey === "mercury" && !entry.mercury) {
      entry.mercury = snap.payload as MercuryData | null;
    }
  }

  // Sort months chronologically
  const sortedMonths = [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b));

  return sortedMonths.map(([month, data]) => ({
    month,
    stripe: data.stripe,
    mercury: data.mercury,
  }));
}

// ---------------------------------------------------------------------------
// P&L builder per month
// ---------------------------------------------------------------------------

function pnlRowValue(row: PnLRow): number {
  return row.currentPeriod;
}

function buildMonthEntry(
  month: string,
  stripe: StripeData | null,
  mercury: MercuryData | null,
): MonthlyPnLEntry {
  const pnl = buildProfitAndLossCore(stripe, mercury);

  const revenue = pnlRowValue(pnl.revenue);
  const grossProfit = pnlRowValue(pnl.grossProfit);
  const operatingIncome = pnlRowValue(pnl.operatingIncome);

  const opexMap: Record<string, number> = {};
  for (const row of pnl.operatingExpenses) {
    if (row.label.includes("Payroll")) opexMap.payroll = pnlRowValue(row);
    else if (row.label.includes("Marketing")) opexMap.marketing = pnlRowValue(row);
    else if (row.label.includes("Infrastructure")) opexMap.infrastructure = pnlRowValue(row);
    else if (row.label.includes("General")) opexMap.ops = pnlRowValue(row);
  }

  return {
    month,
    revenue,
    cogs: pnlRowValue(pnl.cogs),
    grossProfit,
    grossMarginPct: revenue === 0 ? 0 : Math.round((grossProfit / revenue) * 1000) / 10,
    operatingExpenses: {
      payroll: opexMap.payroll ?? 0,
      marketing: opexMap.marketing ?? 0,
      infrastructure: opexMap.infrastructure ?? 0,
      ops: opexMap.ops ?? 0,
    },
    totalOpex: pnlRowValue(pnl.totalOpex),
    operatingIncome,
    operatingMarginPct: revenue === 0 ? 0 : Math.round((operatingIncome / revenue) * 1000) / 10,
    netIncome: pnlRowValue(pnl.netIncome),
    cashBalance: mercury?.cashFlow?.totalBalance ?? null,
    burnRate: mercury?.cashFlow?.burnRate ?? null,
    mrr: stripe?.revenue?.mrr ?? null,
    activeSubscriptions: stripe?.subscriptions?.active ?? null,
    churnRate: stripe?.subscriptions?.churnRate ?? null,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export async function buildMonthlyPnLHistory(
  sessionUserId: string,
  monthsBack = 12,
): Promise<MonthlyPnLHistory> {
  const userId = resolveIntegrationOwnerUserId(sessionUserId);
  const snapshots = await loadMonthlySnapshots(userId, monthsBack);

  const months = snapshots.map((s) =>
    buildMonthEntry(s.month, s.stripe, s.mercury),
  );

  let latestMoM: MonthlyPnLHistory["latestMoM"] = null;
  if (months.length >= 2) {
    const curr = months[months.length - 1];
    const prev = months[months.length - 2];
    latestMoM = {
      revenueChange: Math.round((curr.revenue - prev.revenue) * 100) / 100,
      revenueChangePct: pctChange(curr.revenue, prev.revenue),
      netIncomeChange: Math.round((curr.netIncome - prev.netIncome) * 100) / 100,
      netIncomeChangePct: pctChange(curr.netIncome, prev.netIncome),
      grossMarginChange: Math.round((curr.grossMarginPct - prev.grossMarginPct) * 10) / 10,
      burnRateChange:
        curr.burnRate != null && prev.burnRate != null
          ? Math.round((curr.burnRate - prev.burnRate) * 100) / 100
          : null,
    };
  }

  return { months, latestMoM };
}
