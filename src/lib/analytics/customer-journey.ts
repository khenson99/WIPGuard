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

function stripeTouchpoints(data: AnalyticsDashboardData): Touchpoint[] {
  const touchpoints: Touchpoint[] = [];
  const churnEvents = data.stripe?.subscriptions?.recentChurnEvents ?? [];
  for (const evt of churnEvents) {
    touchpoints.push({
      timestamp: evt.canceledAt,
      channel: "stripe",
      type: "expansion",
      detail: `Subscription canceled: ${evt.customer}`,
      value: -evt.amount,
    });
  }
  if (data.stripe?.subscriptions?.active) {
    touchpoints.push({
      timestamp: new Date().toISOString(),
      channel: "stripe",
      type: "conversion",
      detail: `${data.stripe.subscriptions.active} active subscriptions`,
      value: data.stripe.revenue?.mrr ?? null,
    });
  }
  return touchpoints;
}

function adTouchpoints(data: AnalyticsDashboardData): Touchpoint[] {
  const touchpoints: Touchpoint[] = [];
  const now = new Date().toISOString();

  if (data.googleAds?.totalClicks) {
    touchpoints.push({
      timestamp: now,
      channel: "google-ads",
      type: "first-touch",
      detail: `${data.googleAds.totalClicks} clicks from ${data.googleAds.campaigns.length} campaigns`,
      value: data.googleAds.totalSpend30d,
    });
  }
  if (data.metaAds?.totalClicks) {
    touchpoints.push({
      timestamp: now,
      channel: "meta-ads",
      type: "first-touch",
      detail: `${data.metaAds.totalClicks} clicks from ${data.metaAds.campaigns.length} campaigns`,
      value: data.metaAds.totalSpend30d,
    });
  }
  if (data.redditAds?.totalClicks) {
    touchpoints.push({
      timestamp: now,
      channel: "reddit-ads",
      type: "first-touch",
      detail: `${data.redditAds.totalClicks} clicks from ${data.redditAds.campaigns.length} campaigns`,
      value: data.redditAds.totalSpend30d,
    });
  }
  return touchpoints;
}

function webflowTouchpoints(data: AnalyticsDashboardData): Touchpoint[] {
  if (!data.webflow) return [];
  const formCount = data.webflow.formSubmissions.reduce((sum, f) => sum + f.count, 0);
  if (formCount === 0) return [];
  return [{
    timestamp: new Date().toISOString(),
    channel: "webflow",
    type: "engagement",
    detail: `${formCount} form submissions across ${data.webflow.formSubmissions.length} forms`,
    value: null,
  }];
}

function gaTouchpoints(data: AnalyticsDashboardData): Touchpoint[] {
  if (!data.googleAnalytics) return [];
  return [{
    timestamp: new Date().toISOString(),
    channel: "google-analytics",
    type: "first-touch",
    detail: `${data.googleAnalytics.sessions30d} sessions, ${data.googleAnalytics.users30d} users`,
    value: null,
  }];
}

function pylonTouchpoints(data: AnalyticsDashboardData): Touchpoint[] {
  if (!data.pylon) return [];
  const touchpoints: Touchpoint[] = [];
  if (data.pylon.urgentConversations > 0) {
    touchpoints.push({
      timestamp: new Date().toISOString(),
      channel: "pylon",
      type: "support",
      detail: `${data.pylon.urgentConversations} urgent conversations`,
      value: null,
    });
  }
  if (data.pylon.resolvedInRange > 0) {
    touchpoints.push({
      timestamp: new Date().toISOString(),
      channel: "pylon",
      type: "support",
      detail: `${data.pylon.resolvedInRange} resolved conversations`,
      value: null,
    });
  }
  return touchpoints;
}

function telemetryTouchpoints(
  data: AnalyticsDashboardData,
  key: "googleWorkspace" | "slack",
  channel: TouchpointChannel,
): Touchpoint[] {
  const telemetry = data[key];
  if (!telemetry || telemetry.receiptsInRange === 0) return [];
  return [{
    timestamp: new Date().toISOString(),
    channel,
    type: "engagement",
    detail: `${telemetry.receiptsInRange} integration events, ${telemetry.tasksCreatedInRange} tasks`,
    value: null,
  }];
}

// ── Journey assembly ──

function buildJourneys(data: AnalyticsDashboardData): CustomerJourneyRecord[] {
  const deals = data.hubspot?.deals ?? [];
  if (deals.length === 0) return [];

  // Build deal-specific HubSpot touchpoints keyed by dealId
  const hubspotByDeal = new Map<string, Touchpoint[]>();
  for (const deal of deals) {
    hubspotByDeal.set(deal.dealId, [{
      timestamp: deal.updatedAt ?? new Date().toISOString(),
      channel: "hubspot" as TouchpointChannel,
      type: deal.stageLabel === "Closed Won" ? "conversion" as const : "engagement" as const,
      detail: `${deal.stageLabel}: ${deal.dealName}`,
      value: deal.amount,
    }]);
  }

  // Shared touchpoints are distributed across all deals (ads, webflow, etc.)
  const sharedTouchpoints = [
    ...stripeTouchpoints(data),
    ...adTouchpoints(data),
    ...webflowTouchpoints(data),
    ...gaTouchpoints(data),
    ...pylonTouchpoints(data),
    ...telemetryTouchpoints(data, "googleWorkspace", "google-workspace"),
    ...telemetryTouchpoints(data, "slack", "slack"),
  ];

  // Distribute shared touchpoints round-robin so each deal gets a subset
  const sharedByDeal = new Map<string, Touchpoint[]>();
  for (const deal of deals) sharedByDeal.set(deal.dealId, []);
  if (sharedTouchpoints.length > 0 && deals.length > 0) {
    for (let i = 0; i < sharedTouchpoints.length; i++) {
      const tp = sharedTouchpoints[i];
      // If the touchpoint detail mentions a specific deal, assign it there
      const matchingDeal = deals.find((d) => tp.detail.includes(d.dealName));
      if (matchingDeal) {
        sharedByDeal.get(matchingDeal.dealId)!.push(tp);
      } else {
        // Round-robin assignment so deals get different touchpoints
        const targetDeal = deals[i % deals.length];
        sharedByDeal.get(targetDeal.dealId)!.push(tp);
      }
    }
  }

  return deals.map((deal) => {
    const dealTouchpoints = [
      ...(hubspotByDeal.get(deal.dealId) ?? []),
      ...(sharedByDeal.get(deal.dealId) ?? []),
    ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

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
  const pathCounts = new Map<string, { count: number; totalDays: number; totalValue: number }>();

  for (const journey of journeys) {
    const channels = Array.from(new Set(journey.touchpoints.map((tp) => tp.channel)));
    if (channels.length === 0) continue;
    const key = channels.join(" → ");
    const entry = pathCounts.get(key) ?? { count: 0, totalDays: 0, totalValue: 0 };
    entry.count += 1;
    entry.totalDays += journey.daysInPipeline;
    entry.totalValue += journey.value;
    pathCounts.set(key, entry);
  }

  return Array.from(pathCounts.entries())
    .map(([key, stats]) => ({
      sequence: key.split(" → ") as TouchpointChannel[],
      count: stats.count,
      avgDaysToClose: stats.count > 0 ? Math.round(stats.totalDays / stats.count) : 0,
      avgValue: stats.count > 0 ? Math.round(stats.totalValue / stats.count) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function buildAttribution(journeys: CustomerJourneyRecord[]): ChannelAttribution[] {
  const byChannel = new Map<TouchpointChannel, { firstTouch: number; assisted: number; lastTouch: number; revenue: number; dealValues: number[] }>();

  for (const journey of journeys) {
    const tps = journey.touchpoints;
    if (tps.length === 0) continue;
    const first = tps[0].channel;
    const last = tps[tps.length - 1].channel;

    for (const tp of tps) {
      const entry = byChannel.get(tp.channel) ?? { firstTouch: 0, assisted: 0, lastTouch: 0, revenue: 0, dealValues: [] };
      entry.assisted += 1;
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
    .map(([channel, stats]) => ({
      channel,
      firstTouchDeals: stats.firstTouch,
      assistedDeals: stats.assisted,
      lastTouchDeals: stats.lastTouch,
      totalRevenue: stats.revenue,
      avgDealValue: stats.dealValues.length > 0
        ? Math.round(stats.dealValues.reduce((a, b) => a + b, 0) / stats.dealValues.length)
        : 0,
    }))
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
    attribution: buildAttribution(journeys),
  };
}
