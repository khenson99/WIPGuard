import type {
  AnalyticsDashboardData,
  ChannelAttribution,
  CustomerJourneyData,
  CustomerJourneyRecord,
  JourneyPath,
  Touchpoint,
  TouchpointChannel,
  TouchpointSummary,
} from "@/lib/analytics/types";

// ── Touchpoint extraction from each domain ──

  const allTouchpoints = [
    ...hubspotTouchpoints(data),
    ...stripeTouchpoints(data),
    ...adTouchpoints(data),
    ...webflowTouchpoints(data),
    ...gaTouchpoints(data),
    ...pylonTouchpoints(data),
    ...telemetryTouchpoints(data, "googleWorkspace", "google-workspace"),
    ...telemetryTouchpoints(data, "slack", "slack"),
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return deals.map((deal) => {
    const dealTouchpoints = allTouchpoints.filter(
      (tp) =>
        tp.detail.includes(deal.dealName) ||
        tp.channel === "hubspot" ||
        tp.type === "first-touch"
    );

    const timestamps = dealTouchpoints.map((tp) => new Date(tp.timestamp).getTime());
    const firstTouch = timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : new Date().toISOString();
    const lastTouch = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : new Date().toISOString();
    const daysInPipeline = Math.max(1, Math.round((new Date(lastTouch).getTime() - new Date(firstTouch).getTime()) / 86_400_000));

    return {
      dealId: deal.dealId,
      dealName: deal.dealName,
      contactEmail: null,
      currentStage: deal.stageLabel,
      value: deal.amount,
      touchpoints: dealTouchpoints,
      firstTouch,
      lastTouch,
      daysInPipeline,
    };
  });
}

function buildTouchpointSummary(journeys: CustomerJourneyRecord[]): TouchpointSummary[] {
  const byChannel = new Map<TouchpointChannel, { total: number; firstTouch: number; conversion: number }>();

  for (const journey of journeys) {
    for (const tp of journey.touchpoints) {
      const entry = byChannel.get(tp.channel) ?? { total: 0, firstTouch: 0, conversion: 0 };
      entry.total += 1;
      if (tp.type === "first-touch") entry.firstTouch += 1;
      if (tp.type === "conversion") entry.conversion += 1;
      byChannel.set(tp.channel, entry);
    }
  }

  return Array.from(byChannel.entries())
    .map(([channel, stats]) => ({
      channel,
      totalTouchpoints: stats.total,
      avgPerJourney: journeys.length > 0 ? Math.round((stats.total / journeys.length) * 10) / 10 : 0,
      firstTouchCount: stats.firstTouch,
      conversionCount: stats.conversion,
    }))
    .sort((a, b) => b.totalTouchpoints - a.totalTouchpoints);
}

function buildTopPaths(journeys: CustomerJourneyRecord[]): JourneyPath[] {
  const pathCounts = new Map<string, { count: number; kanbanCards: number; freeTrials: number; demos: number; totalDays: number; totalValue: number }>();

  for (const journey of journeys) {
    const channels = [...new Set(journey.touchpoints.map((tp) => tp.channel))];
    if (channels.length === 0) continue;
    const key = channels.join(" → ");
    const entry = pathCounts.get(key) ?? { count: 0, kanbanCards: 0, freeTrials: 0, demos: 0, totalDays: 0, totalValue: 0 };
    entry.count += 1;
    
    // Simplistic heuristic: if there's a coda touchpoint, it's a kanban card; if there's a stripe touchpoint without revenue, it could be a trial.
    if (journey.touchpoints.some((tp) => tp.channel === "coda")) {
      entry.kanbanCards += 1;
    }
    if (journey.touchpoints.some((tp) => tp.channel === "stripe" && tp.value === null)) {
      entry.freeTrials += 1;
    }
    if (journey.currentStage !== "Prospect" && journey.currentStage !== "Lead") {
      entry.demos += 1;
    }
    if (journey.touchpoints.some((tp) => tp.channel === "hubspot" && tp.detail.toLowerCase().includes("demo"))) {
      entry.demos += 1;
    }

    entry.totalDays += journey.daysInPipeline;
    entry.totalValue += journey.value;
    pathCounts.set(key, entry);
  }

  return Array.from(pathCounts.entries())
    .map(([key, stats]) => ({
      sequence: key.split(" → ") as TouchpointChannel[],
      count: stats.count,
function buildAttribution(journeys: CustomerJourneyRecord[], data?: AnalyticsDashboardData): ChannelAttribution[] {
  const byChannel = new Map<TouchpointChannel, { firstTouch: number; assisted: number; lastTouch: number; kanbanCards: number; freeTrials: number; demos: number; revenue: number; dealValues: number[] }>();

  for (const journey of journeys) {
    const tps = journey.touchpoints;
    if (tps.length === 0) continue;
    const first = tps[0].channel;
    const last = tps[tps.length - 1].channel;

    for (const tp of tps) {
      const entry = byChannel.get(tp.channel) ?? { firstTouch: 0, assisted: 0, lastTouch: 0, kanbanCards: 0, freeTrials: 0, demos: 0, revenue: 0, dealValues: [] };
      entry.assisted += 1;
      
      if (tp.channel === "coda") entry.kanbanCards += 1;
      if (tp.channel === "stripe" && tp.value === null) entry.freeTrials += 1;
      if (tp.channel === "hubspot" && tp.detail.toLowerCase().includes("demo")) entry.demos += 1;

      byChannel.set(tp.channel, entry);
    }

    const firstEntry = byChannel.get(first)!;
    firstEntry.firstTouch += 1;
    firstEntry.revenue += journey.value;
    firstEntry.dealValues.push(journey.value);

    const lastEntry = byChannel.get(last)!;
    lastEntry.lastTouch += 1;
  }

  return Array.from(byChannel.entries())
    .map(([channel, stats]) => {
      // Lookup costs from ad networks
      let cost: number | null = null;
      let traffic: number | null = null;
      
      if (channel === "google-ads" && data?.googleAds) {
        cost = data.googleAds.totalSpend30d;
        traffic = data.googleAds.totalClicks;
      } else if (channel === "meta-ads" && data?.metaAds) {
        cost = data.metaAds.totalSpend30d;
        traffic = data.metaAds.totalClicks;
      } else if (channel === "reddit-ads" && data?.redditAds) {
        cost = data.redditAds.totalSpend30d;
        traffic = data.redditAds.totalClicks;
      } else if (channel === "google-analytics" && data?.googleAnalytics) {
        traffic = data.googleAnalytics.sessions30d;
      }

      const roi = cost && cost > 0 ? ((stats.revenue - cost) / cost) * 100 : null;

      return {
        channel,
        traffic,
        cost,
        firstTouchDeals: stats.firstTouch,
        assistedDeals: stats.assisted,
        lastTouchDeals: stats.lastTouch,
        kanbanCards: stats.kanbanCards,
        freeTrials: stats.freeTrials,
        demos: stats.demos,
        totalRevenue: stats.revenue,
        roi,
        avgDealValue: stats.dealValues.length > 0
          ? Math.round(stats.dealValues.reduce((a, b) => a + b, 0) / stats.dealValues.length)
          : 0,
      };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function buildCustomerJourneyData(data: AnalyticsDashboardData): CustomerJourneyData {
  const journeys = buildJourneys(data);
  const touchpointSummary = buildTouchpointSummary(journeys);
  const totalTouchpoints = journeys.reduce((sum, j) => sum + j.touchpoints.length, 0);
  const avgTouchpoints = journeys.length > 0 ? Math.round((totalTouchpoints / journeys.length) * 10) / 10 : 0;
  const medianDaysToClose = median(journeys.map((j) => j.daysInPipeline));

  return {
    journeys,
    touchpointSummary,
    avgTouchpoints,
    medianDaysToClose,
    topPaths: buildTopPaths(journeys),
    attribution: buildAttribution(journeys, data),
  };
}
