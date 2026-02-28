import type {
  CustomerJourneyData,
  CustomerJourneyRecord,
  TouchpointChannel,
} from "@/lib/analytics/types";

export interface StageConversionRow {
  fromStage: string;
  toStage: string;
  fromCount: number;
  toCount: number;
  conversionRate: number;
  avgDaysInStage: number;
  revenueAtRisk: number;
}

export interface SourceConversionRow {
  source: string;
  totalJourneys: number;
  converted: number;
  conversionRate: number;
  totalRevenue: number;
  avgDaysToClose: number;
}

export interface PathConversionRow {
  path: string;
  channels: TouchpointChannel[];
  journeyCount: number;
  convertedCount: number;
  conversionRate: number;
  avgValue: number;
  avgDays: number;
}

export const CLOSE_STAGES = new Set(["Closed Won", "Subscription", "Active"]);

const CANONICAL_STAGE_ORDER = [
  "Prospect",
  "Lead",
  "Demo Scheduled",
  "No-Show/Reschedule",
  "Demo Follow-Up",
  "Budgetary Quote Sent",
  "Payment Link Sent",
  "Free Trial",
  "Freemium",
  "Subscription",
  "Closed Won",
  "Active",
] as const;

const STAGE_RANK = new Map<string, number>(
  CANONICAL_STAGE_ORDER.map((stage, idx) => [stage, idx]),
);

export const CHANNEL_LABELS: Record<TouchpointChannel, string> = {
  hubspot: "HubSpot",
  stripe: "Stripe",
  "google-workspace": "Google Workspace",
  slack: "Slack",
  webflow: "Webflow",
  coda: "Coda",
  "google-analytics": "Google Analytics",
  "google-ads": "Google Ads",
  "meta-ads": "Meta Ads",
  "reddit-ads": "Reddit Ads",
  pylon: "Pylon",
  mercury: "Mercury",
};

export const CHANNEL_COLORS: Record<TouchpointChannel, string> = {
  hubspot: "#ff7a59",
  stripe: "#635bff",
  "google-workspace": "#4285f4",
  slack: "#e01e5a",
  webflow: "#4353ff",
  coda: "#f46a54",
  "google-analytics": "#e37400",
  "google-ads": "#4285f4",
  "meta-ads": "#0081fb",
  "reddit-ads": "#ff4500",
  pylon: "#6366f1",
  mercury: "#1c1c1e",
};

export function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function rankStage(stage: string, fallbackOrder: Map<string, number>): number {
  const known = STAGE_RANK.get(stage);
  if (known !== undefined) return known;
  return CANONICAL_STAGE_ORDER.length + (fallbackOrder.get(stage) ?? Number.MAX_SAFE_INTEGER);
}

export function buildStageConversions(journeys: CustomerJourneyRecord[]): StageConversionRow[] {
  const fallbackOrder = new Map<string, number>();
  const stageCounts = new Map<string, { count: number; totalDays: number; totalValue: number }>();

  for (const journey of journeys) {
    const stage = journey.currentStage;
    if (!fallbackOrder.has(stage)) fallbackOrder.set(stage, fallbackOrder.size);
    const entry = stageCounts.get(stage) ?? { count: 0, totalDays: 0, totalValue: 0 };
    entry.count += 1;
    entry.totalDays += journey.daysInPipeline;
    entry.totalValue += journey.value;
    stageCounts.set(stage, entry);
  }

  const orderedStages = Array.from(stageCounts.keys()).sort(
    (a, b) => rankStage(a, fallbackOrder) - rankStage(b, fallbackOrder),
  );

  const rows: StageConversionRow[] = [];
  for (let i = 0; i < orderedStages.length - 1; i++) {
    const from = stageCounts.get(orderedStages[i]);
    const to = stageCounts.get(orderedStages[i + 1]);
    if (!from || !to) continue;

    const converted = Math.min(to.count, from.count);
    rows.push({
      fromStage: orderedStages[i],
      toStage: orderedStages[i + 1],
      fromCount: from.count,
      toCount: to.count,
      conversionRate: pct(converted, from.count),
      avgDaysInStage: from.count > 0 ? Math.round(from.totalDays / from.count) : 0,
      revenueAtRisk: Math.max(0, from.totalValue - to.totalValue),
    });
  }

  return rows;
}

export function buildSourceConversions(
  journeys: CustomerJourneyRecord[],
): SourceConversionRow[] {
  const byFirstChannel = new Map<
    TouchpointChannel,
    { total: number; converted: number; revenue: number; totalDays: number }
  >();

  for (const journey of journeys) {
    const firstChannel = journey.touchpoints[0]?.channel;
    if (!firstChannel) continue;

    const entry = byFirstChannel.get(firstChannel) ?? {
      total: 0,
      converted: 0,
      revenue: 0,
      totalDays: 0,
    };

    entry.total += 1;
    entry.totalDays += journey.daysInPipeline;

    if (CLOSE_STAGES.has(journey.currentStage)) {
      entry.converted += 1;
      entry.revenue += journey.value;
    }

    byFirstChannel.set(firstChannel, entry);
  }

  return Array.from(byFirstChannel.entries())
    .map(([channel, stats]) => ({
      source: CHANNEL_LABELS[channel] ?? channel,
      totalJourneys: stats.total,
      converted: stats.converted,
      conversionRate: pct(stats.converted, stats.total),
      totalRevenue: stats.revenue,
      avgDaysToClose: stats.total > 0 ? Math.round(stats.totalDays / stats.total) : 0,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
}

export function buildPathConversions(journey: CustomerJourneyData): PathConversionRow[] {
  const pathMap = new Map<
    string,
    {
      channels: TouchpointChannel[];
      count: number;
      converted: number;
      totalValue: number;
      totalDays: number;
    }
  >();

  for (const record of journey.journeys) {
    const channels = [...new Set(record.touchpoints.map((tp) => tp.channel))];
    if (channels.length === 0) continue;

    const key = channels.join(" → ");
    const entry = pathMap.get(key) ?? {
      channels,
      count: 0,
      converted: 0,
      totalValue: 0,
      totalDays: 0,
    };

    entry.count += 1;
    entry.totalDays += record.daysInPipeline;

    if (CLOSE_STAGES.has(record.currentStage)) {
      entry.converted += 1;
      entry.totalValue += record.value;
    }

    pathMap.set(key, entry);
  }

  return Array.from(pathMap.entries())
    .map(([path, stats]) => ({
      path,
      channels: stats.channels,
      journeyCount: stats.count,
      convertedCount: stats.converted,
      conversionRate: pct(stats.converted, stats.count),
      avgValue: stats.converted > 0 ? Math.round(stats.totalValue / stats.converted) : 0,
      avgDays: stats.count > 0 ? Math.round(stats.totalDays / stats.count) : 0,
    }))
    .sort((a, b) => b.conversionRate - a.conversionRate || b.journeyCount - a.journeyCount)
    .slice(0, 10);
}
