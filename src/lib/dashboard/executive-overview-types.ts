// ─── Executive Overview Dashboard Types ──────────────────
// Payload served by /api/dashboard/overview and consumed by
// the ExecutiveOverviewDashboard component.

import type { SectionStatus } from "@/lib/analytics/summary-health";
import type { RevenueTrend, DealStage } from "@/lib/analytics/types";

/* ── Per-domain section payloads ─────────────────────────── */

export interface OverviewFinance {
  connected: boolean;
  mrr: number;
  mrrChange: number;
  totalRevenue30d: number;
  totalRevenuePrev30d: number;
  revenueGrowth: number;
  activeSubscriptions: number;
  churnRate: number;
  revenueTrend: RevenueTrend[];
  totalBalance: number;
  burnRate: number;
  runway: number;
}

export interface OverviewTraffic {
  connected: boolean;
  sessions30d: number;
  sessionsPrev30d: number;
  users30d: number;
  bounceRate: number;
  topChannels: { channel: string; sessions: number }[];
  dailyTrend: { date: string; sessions: number }[];
}

export interface OverviewSales {
  connected: boolean;
  totalDeals: number;
  pipelineValue: number;
  closedWon: number;
  closedWonValue: number;
  winRate: number;
  avgDealSize: number;
  stages: DealStage[];
}

export interface OverviewCustomerSuccess {
  connected: boolean;
  openConversations: number;
  urgentConversations: number;
  waitingOnTeam?: number | null;
  avgFirstResponseMinutes: number | null;
  csat: number | null;
  resolvedInRange: number;
}

export interface OverviewAdSpend {
  connected: boolean;
  totalSpend30d: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  blendedCtr: number;
  blendedCpa: number;
}

export interface OverviewSectionHealth {
  id: string;
  label: string;
  href: string;
  status: SectionStatus;
}

/* ── Top-level payload ───────────────────────────────────── */

export interface ExecutiveOverviewPayload {
  generatedAt: string;
  meta: {
    servedAt: string;
    isPartial: boolean;
  };
  finance: OverviewFinance;
  traffic: OverviewTraffic;
  sales: OverviewSales;
  customerSuccess: OverviewCustomerSuccess;
  adSpend: OverviewAdSpend;
  sections: OverviewSectionHealth[];
}

/* ── Type guard ──────────────────────────────────────────── */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isExecutiveOverviewPayload(value: unknown): value is ExecutiveOverviewPayload {
  if (!isRecord(value)) return false;
  if (typeof value.generatedAt !== "string") return false;
  if (!isRecord(value.meta)) return false;
  if (!isRecord(value.finance)) return false;
  if (!isRecord(value.traffic)) return false;
  if (!isRecord(value.sales)) return false;
  if (!isRecord(value.customerSuccess)) return false;
  if (!isRecord(value.adSpend)) return false;
  if (!Array.isArray(value.sections)) return false;
  return true;
}
