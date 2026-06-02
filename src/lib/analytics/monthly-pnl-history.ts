// Monthly P&L History — builds month-by-month P&L statements from historical
// AnalyticsSnapshot records for Stripe and Mercury providers.

import { prisma } from "@/lib/prisma";
import { AnalyticsSnapshotStatus } from "@/generated/prisma/client";
import { buildProfitAndLossCore } from "./pnl-builder";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import { normalizePercentValue } from "@/lib/analytics/percentage-utils";
import type { StripeData, MercuryData, PnLRow } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MonthlyPnLEntry {
  /** ISO month string, e.g. "2026-03" */
  month: string;
  /** Whether source snapshots were present for this month */
  sourceCoverage: {
    stripe: boolean;
    mercury: boolean;
  };
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

export const MONTHLY_HISTORY_START_DATE = new Date(Date.UTC(2025, 0, 1));
export const MONTHLY_HISTORY_CONTEXT_KEY = "financial-planning";
export const MONTHLY_HISTORY_RANGE_PRESET = "monthly";

function monthKeyUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function addMonthsUtc(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function buildMonthKeys(startDate: Date, endDate: Date): string[] {
  const keys: string[] = [];
  for (
    let cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
    cursor <= endDate;
    cursor = addMonthsUtc(cursor, 1)
  ) {
    keys.push(monthKeyUtc(cursor));
  }
  return keys;
}

function defaultHistoryEndDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function loadMonthlySnapshots(
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<MonthlySnapshot[]> {
  // Fetch all successful monthly source snapshots inside the reporting window.
  const snapshots = await prisma.analyticsSnapshot.findMany({
    where: {
      userId,
      providerKey: { in: ["stripe", "mercury"] },
      contextKey: MONTHLY_HISTORY_CONTEXT_KEY,
      rangePreset: MONTHLY_HISTORY_RANGE_PRESET,
      status: AnalyticsSnapshotStatus.SUCCESS,
      fromDate: { gte: startDate },
    },
    orderBy: [{ fromDate: "desc" }, { capturedAt: "desc" }],
    select: {
      providerKey: true,
      payload: true,
      fromDate: true,
      capturedAt: true,
    },
  });

  // Group by month, taking the latest snapshot per provider per month
  const monthMap = new Map<string, { stripe: StripeData | null; mercury: MercuryData | null }>();
  let latestSnapshotMonth: Date | null = null;

  for (const snap of snapshots) {
    if (snap.fromDate.getTime() > endDate.getTime()) continue;

    if (
      latestSnapshotMonth == null ||
      snap.fromDate.getTime() > latestSnapshotMonth.getTime()
    ) {
      latestSnapshotMonth = snap.fromDate;
    }
    const month = monthKeyUtc(snap.fromDate);
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

  if (!latestSnapshotMonth) return [];

  const rangeEnd = latestSnapshotMonth.getTime() < endDate.getTime() ? latestSnapshotMonth : endDate;

  return buildMonthKeys(startDate, rangeEnd).map((month) => ({
    month,
    stripe: monthMap.get(month)?.stripe ?? null,
    mercury: monthMap.get(month)?.mercury ?? null,
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
    sourceCoverage: {
      stripe: stripe !== null,
      mercury: mercury !== null,
    },
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
    churnRate: stripe ? normalizePercentValue(stripe.subscriptions.churnRate) : null,
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
  options: {
    startDate?: Date;
    endDate?: Date;
  } = {},
): Promise<MonthlyPnLHistory> {
  const userId = resolveIntegrationOwnerUserId(sessionUserId);
  const startDate = options.startDate ?? MONTHLY_HISTORY_START_DATE;
  const endDate = options.endDate ?? defaultHistoryEndDate();
  const snapshots = await loadMonthlySnapshots(userId, startDate, endDate);

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
