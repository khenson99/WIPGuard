export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAuthenticatedUser } from "@/lib/session-user";
import { getCredentials } from "@/lib/analytics/credentials";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import { readLatestSuccessfulSnapshot, type SnapshotResult } from "@/lib/analytics/snapshots";
import {
  ANALYTICS_PRIMARY_SECTIONS,
  ANALYTICS_SUB_SECTIONS,
  type AnalyticsSubSection,
} from "@/lib/analytics/section-registry";
import { deriveDomainSectionStatus } from "@/lib/analytics/summary-health";
import type {
  StripeData,
  MercuryData,
  GAData,
  HubSpotData,
  GoogleAdsData,
  MetaAdsData,
  RedditAdsData,
  PylonData,
  ProductSuccessData,
} from "@/lib/analytics/types";
import type {
  ExecutiveOverviewPayload,
  OverviewFinance,
  OverviewTraffic,
  OverviewSales,
  OverviewCustomerSuccess,
  OverviewAdSpend,
  OverviewSectionHealth,
} from "@/lib/dashboard/executive-overview-types";

/* ── Helper: build 30-day snapshot query input ───────────── */

function snapshotInput(userId: string, providerKey: string) {
  const now = new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 30);
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setUTCHours(23, 59, 59, 999);
  return {
    userId,
    providerKey,
    rangePreset: "30d" as const,
    fromDate: from,
    toDate: to,
  };
}

/* ── Domain extractors ───────────────────────────────────── */

function extractFinance(
  creds: Awaited<ReturnType<typeof getCredentials>>,
  stripeSnap: StripeData | null,
  mercurySnap: MercuryData | null
): OverviewFinance {
  const stripeConnected = Boolean(creds.stripeKey);
  const mercuryConnected = Boolean(creds.mercuryKey);
  return {
    connected: stripeConnected || mercuryConnected,
    mrr: stripeSnap?.revenue?.mrr ?? 0,
    mrrChange: stripeSnap?.revenue?.mrrChange ?? 0,
    totalRevenue30d: stripeSnap?.revenue?.totalRevenue30d ?? 0,
    totalRevenuePrev30d: stripeSnap?.revenue?.totalRevenuePrev30d ?? 0,
    revenueGrowth: stripeSnap?.revenue?.revenueGrowth ?? 0,
    activeSubscriptions: stripeSnap?.subscriptions?.active ?? 0,
    churnRate: stripeSnap?.subscriptions?.churnRate ?? 0,
    revenueTrend: stripeSnap?.revenueTrend ?? [],
    totalBalance: mercurySnap?.cashFlow?.totalBalance ?? 0,
    burnRate: mercurySnap?.cashFlow?.burnRate ?? 0,
    runway: mercurySnap?.cashFlow?.runway ?? 0,
  };
}

function extractTraffic(
  creds: Awaited<ReturnType<typeof getCredentials>>,
  gaSnap: GAData | null
): OverviewTraffic {
  const connected = Boolean(
    creds.gaPropertyId &&
      ((creds.gaClientEmail && creds.gaPrivateKey) ||
        (process.env.GA_REFRESH_TOKEN &&
          process.env.GOOGLE_CLIENT_ID &&
          process.env.GOOGLE_CLIENT_SECRET))
  );
  return {
    connected,
    sessions30d: gaSnap?.sessions30d ?? 0,
    sessionsPrev30d: gaSnap?.sessionsPrev30d ?? 0,
    users30d: gaSnap?.users30d ?? 0,
    bounceRate: gaSnap?.bounceRate ?? 0,
    topChannels: (gaSnap?.trafficByChannel ?? []).slice(0, 5).map((ch) => ({
      channel: ch.channel,
      sessions: ch.sessions,
    })),
    dailyTrend: gaSnap?.dailyTrend ?? [],
  };
}

function extractSales(
  creds: Awaited<ReturnType<typeof getCredentials>>,
  hubspotSnap: HubSpotData | null
): OverviewSales {
  const connected = Boolean(creds.hubspotToken);
  const funnel = hubspotSnap?.funnel;
  const stages = funnel?.stages ?? [];
  const pipelineValue = stages.reduce((sum, s) => sum + s.value, 0);
  return {
    connected,
    totalDeals: funnel?.totalDeals ?? 0,
    pipelineValue,
    closedWon: funnel?.closedWon ?? 0,
    closedWonValue: stages.find((s) => s.label.toLowerCase().includes("closed won"))?.value ?? 0,
    winRate: funnel?.winRate ?? 0,
    avgDealSize: funnel?.avgDealSize ?? 0,
    stages,
  };
}

function extractCustomerSuccess(
  creds: Awaited<ReturnType<typeof getCredentials>>,
  pylonSnap: PylonData | null,
  productSnap: ProductSuccessData | null
): OverviewCustomerSuccess {
  const pylonConnected = Boolean(creds.pylonApiKey);
  return {
    connected: pylonConnected || productSnap !== null,
    openConversations: pylonSnap?.openConversations ?? 0,
    urgentConversations: pylonSnap?.urgentConversations ?? 0,
    avgFirstResponseMinutes: pylonSnap?.avgFirstResponseMinutes ?? null,
    csat: pylonSnap?.csat ?? null,
    resolvedInRange: pylonSnap?.resolvedInRange ?? 0,
    completedTasks: productSnap?.completedTasksInRange ?? 0,
    throughputRate: productSnap?.throughputRate ?? null,
  };
}

function extractAdSpend(
  creds: Awaited<ReturnType<typeof getCredentials>>,
  googleAdsSnap: GoogleAdsData | null,
  metaAdsSnap: MetaAdsData | null,
  redditAdsSnap: RedditAdsData | null
): OverviewAdSpend {
  const googleConnected = Boolean(
    creds.googleAdsDevToken && creds.googleAdsCustomerId && creds.googleAdsRefreshToken
  );
  const metaConnected = Boolean(creds.metaAccessToken && creds.metaAdAccountId);
  const redditConnected = Boolean(
    creds.redditClientId && creds.redditClientSecret && creds.redditRefreshToken && creds.redditAdAccountId
  );

  const totalSpend =
    (googleAdsSnap?.totalSpend30d ?? 0) +
    (metaAdsSnap?.totalSpend30d ?? 0) +
    (redditAdsSnap?.totalSpend30d ?? 0);
  const totalImpressions =
    (googleAdsSnap?.totalImpressions ?? 0) +
    (metaAdsSnap?.totalImpressions ?? 0) +
    (redditAdsSnap?.totalImpressions ?? 0);
  const totalClicks =
    (googleAdsSnap?.totalClicks ?? 0) +
    (metaAdsSnap?.totalClicks ?? 0) +
    (redditAdsSnap?.totalClicks ?? 0);
  const totalConversions =
    (googleAdsSnap?.totalConversions ?? 0) +
    (metaAdsSnap?.totalConversions ?? 0) +
    (redditAdsSnap?.totalConversions ?? 0);

  return {
    connected: googleConnected || metaConnected || redditConnected,
    totalSpend30d: totalSpend,
    totalImpressions,
    totalClicks,
    totalConversions,
    blendedCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    blendedCpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
  };
}

/* ── Section health builder ──────────────────────────────── */

function buildSectionHealth(
  creds: Awaited<ReturnType<typeof getCredentials>>,
  snapshotStatuses: Map<string, { success: boolean; stale: boolean }>
): OverviewSectionHealth[] {
  const domainConnected: Record<AnalyticsSubSection["dataDomain"], boolean> = {
    hubspot: Boolean(creds.hubspotToken),
    salesPerformance: Boolean(creds.hubspotToken),
    stripe: Boolean(creds.stripeKey),
    mercury: Boolean(creds.mercuryKey),
    googleWorkspace: Boolean(creds.googleWorkspaceAccessToken),
    slack: Boolean(creds.slackAccessToken),
    googleAnalytics: Boolean(
      creds.gaPropertyId &&
        ((creds.gaClientEmail && creds.gaPrivateKey) ||
          (process.env.GA_REFRESH_TOKEN &&
            process.env.GOOGLE_CLIENT_ID &&
            process.env.GOOGLE_CLIENT_SECRET))
    ),
    googleAds: Boolean(
      creds.googleAdsDevToken &&
        creds.googleAdsCustomerId &&
        creds.googleAdsRefreshToken &&
        creds.googleAdsClientId &&
        creds.googleAdsClientSecret
    ),
    metaAds: Boolean(creds.metaAccessToken && creds.metaAdAccountId),
    metaPage: Boolean(creds.metaAccessToken),
    redditAds: Boolean(
      creds.redditClientId &&
        creds.redditClientSecret &&
        creds.redditRefreshToken &&
        creds.redditAdAccountId
    ),
    webflow: Boolean(creds.webflowApiToken && creds.webflowSiteId),
    coda: Boolean(creds.codaApiToken && creds.codaDocId),
    semrush: Boolean(creds.semrushApiToken && creds.semrushDomain),
    pylon: Boolean(creds.pylonApiKey),
    financePlanning: Boolean(creds.stripeKey || creds.mercuryKey),
    financeForecast: Boolean(creds.stripeKey || creds.mercuryKey),
    financePnl: Boolean(creds.stripeKey || creds.mercuryKey),
    financeUnitEconomics: Boolean(creds.stripeKey),
    product: true,
    customerJourney: true,
    visitorFunnel: true,
    demoAnalytics: true,
    processAnalytics: true,
  };

  const domainSnapshotKey: Partial<Record<AnalyticsSubSection["dataDomain"], string>> = {
    hubspot: "hubspot",
    salesPerformance: "salesPerformance",
    stripe: "stripe",
    mercury: "mercury",
    googleWorkspace: "googleWorkspace",
    slack: "slack",
    googleAnalytics: "googleAnalytics",
    googleAds: "googleAds",
    metaAds: "metaAds",
    metaPage: "metaPage",
    redditAds: "redditAds",
    webflow: "webflow",
    coda: "coda",
    semrush: "semrush",
    pylon: "pylon",
  };

  return ANALYTICS_PRIMARY_SECTIONS.map((primary) => {
    const children = ANALYTICS_SUB_SECTIONS.filter((c) => c.parentId === primary.id);
    const childStatuses = children.map((child) => {
      const configured = domainConnected[child.dataDomain];
      const snapshotKey = domainSnapshotKey[child.dataDomain];
      const snap = snapshotKey ? snapshotStatuses.get(snapshotKey) : null;
      return deriveDomainSectionStatus({
        configured,
        requiresSnapshot: Boolean(snapshotKey),
        snapshotStatus: snap ? (snap.success ? "SUCCESS" : "ERROR") : null,
        snapshotStale: snap?.stale ?? false,
      });
    });

    let status: OverviewSectionHealth["status"] = "missing";
    if (childStatuses.every((s) => s === "connected")) status = "connected";
    else if (childStatuses.some((s) => s === "degraded")) status = "degraded";
    else if (childStatuses.some((s) => s === "connected")) status = "partial";

    return {
      id: primary.id,
      label: primary.label,
      href: primary.path,
      status,
    };
  });
}

/* ── Route handler ───────────────────────────────────────── */

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ownerUserId = resolveIntegrationOwnerUserId(user.id);
    const creds = await getCredentials(ownerUserId);

    // Read all 30d snapshots in parallel
    const [
      stripeResult,
      mercuryResult,
      gaResult,
      hubspotResult,
      googleAdsResult,
      metaAdsResult,
      redditAdsResult,
      pylonResult,
      productResult,
    ] = await Promise.all([
      readLatestSuccessfulSnapshot<StripeData>(snapshotInput(ownerUserId, "stripe")),
      readLatestSuccessfulSnapshot<MercuryData>(snapshotInput(ownerUserId, "mercury")),
      readLatestSuccessfulSnapshot<GAData>(snapshotInput(ownerUserId, "googleAnalytics")),
      readLatestSuccessfulSnapshot<HubSpotData>(snapshotInput(ownerUserId, "hubspot")),
      readLatestSuccessfulSnapshot<GoogleAdsData>(snapshotInput(ownerUserId, "googleAds")),
      readLatestSuccessfulSnapshot<MetaAdsData>(snapshotInput(ownerUserId, "metaAds")),
      readLatestSuccessfulSnapshot<RedditAdsData>(snapshotInput(ownerUserId, "redditAds")),
      readLatestSuccessfulSnapshot<PylonData>(snapshotInput(ownerUserId, "pylon")),
      readLatestSuccessfulSnapshot<ProductSuccessData>(snapshotInput(ownerUserId, "product")),
    ]);

    // Build snapshot-status map for section health
    const snapshotStatuses = new Map<string, { success: boolean; stale: boolean }>();
    const snapResults: [string, SnapshotResult<unknown>][] = [
      ["stripe", stripeResult],
      ["mercury", mercuryResult],
      ["googleAnalytics", gaResult],
      ["hubspot", hubspotResult],
      ["googleAds", googleAdsResult],
      ["metaAds", metaAdsResult],
      ["redditAds", redditAdsResult],
      ["pylon", pylonResult],
      ["product", productResult],
    ];
    for (const [key, result] of snapResults) {
      if (result.fromSnapshot) {
        snapshotStatuses.set(key, {
          success: result.status === "SUCCESS",
          stale: result.stale,
        });
      }
    }

    const isPartial = snapResults.some(
      ([, result]) => result.fromSnapshot && (result.stale || result.status !== "SUCCESS")
    );

    const payload: ExecutiveOverviewPayload = {
      generatedAt: new Date().toISOString(),
      meta: {
        servedAt: new Date().toISOString(),
        isPartial,
      },
      finance: extractFinance(creds, stripeResult.payload, mercuryResult.payload),
      traffic: extractTraffic(creds, gaResult.payload),
      sales: extractSales(creds, hubspotResult.payload),
      customerSuccess: extractCustomerSuccess(creds, pylonResult.payload, productResult.payload),
      adSpend: extractAdSpend(
        creds,
        googleAdsResult.payload,
        metaAdsResult.payload,
        redditAdsResult.payload
      ),
      sections: buildSectionHealth(creds, snapshotStatuses),
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    console.error("GET /api/dashboard/overview error:", error);
    return NextResponse.json({ error: "Failed to fetch executive overview" }, { status: 500 });
  }
}
