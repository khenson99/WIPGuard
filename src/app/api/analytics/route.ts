import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { IntegrationProvider } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCredentials } from "@/lib/analytics/credentials";
import { parseAnalyticsTimeRange } from "@/lib/analytics/time-range";
import { fetchHubSpotData, fetchMercuryData, fetchStripeData } from "@/lib/analytics/fetchers";
import { fetchGAData, fetchWebflowData } from "@/lib/analytics/fetchers-ga-webflow";
import {
  fetchGoogleAdsData,
  fetchMetaAdsData,
  fetchMetaPageData,
  fetchRedditAdsData,
} from "@/lib/analytics/fetchers-ads";
import { fetchCodaData } from "@/lib/analytics/fetchers-coda";
import { fetchSemrushData } from "@/lib/analytics/fetchers-semrush";
import { fetchPylonData } from "@/lib/analytics/fetchers-pylon";
import { fetchIntegrationTelemetryData } from "@/lib/analytics/fetchers-integrations";
import { buildCrossFunnelData } from "@/lib/analytics/funnel";
import { buildDistilledInsights } from "@/lib/analytics/insight-engine";
import {
  readLatestSnapshot,
  readLatestSuccessfulSnapshot,
  snapshotExpiryFromNow,
  storeAnalyticsSnapshot,
  storeAnalyticsSnapshotFailure,
} from "@/lib/analytics/snapshots";
import type {
  AnalyticsDashboardData,
  AnalyticsRecommendation,
  ProductSuccessData,
  ProviderFreshness,
} from "@/lib/analytics/types";

export const revalidate = 300;

type DomainKey =
  | "hubspot"
  | "stripe"
  | "mercury"
  | "googleAnalytics"
  | "googleAds"
  | "metaAds"
  | "metaPage"
  | "redditAds"
  | "webflow"
  | "coda"
  | "semrush"
  | "pylon"
  | "product"
  | "googleWorkspace"
  | "slack"
  | "hubspotOps"
  | "codaOps"
  | "redditOps"
  | "funnelJourney"
  | "recommendations"
  | "distilledInsights";

const ALL_DOMAINS: DomainKey[] = [
  "hubspot",
  "stripe",
  "mercury",
  "googleAnalytics",
  "googleAds",
  "metaAds",
  "metaPage",
  "redditAds",
  "webflow",
  "coda",
  "semrush",
  "pylon",
  "product",
  "googleWorkspace",
  "slack",
  "hubspotOps",
  "codaOps",
  "redditOps",
  "funnelJourney",
  "recommendations",
  "distilledInsights",
];

const SECTION_DOMAINS: Record<string, DomainKey[]> = {
  overview: [
    "googleAnalytics",
    "hubspot",
    "stripe",
    "mercury",
    "pylon",
    "product",
    "googleWorkspace",
    "slack",
    "funnelJourney",
    "recommendations",
    "distilledInsights",
  ],
  "ads-traffic": [
    "googleAnalytics",
    "googleAds",
    "metaAds",
    "redditAds",
    "webflow",
    "semrush",
    "coda",
    "funnelJourney",
    "recommendations",
    "distilledInsights",
  ],
  finance: ["mercury", "stripe", "hubspot", "hubspotOps", "funnelJourney", "recommendations", "distilledInsights"],
  "sales-pipeline": ["hubspot", "stripe", "googleWorkspace", "slack", "hubspotOps", "funnelJourney", "recommendations", "distilledInsights"],
  "customer-success": ["pylon", "coda", "product", "googleWorkspace", "slack", "codaOps", "funnelJourney", "recommendations", "distilledInsights"],
  "ads-google-analytics": ["googleAnalytics"],
  "ads-google-ads": ["googleAds"],
  "ads-meta-ads": ["metaAds"],
  "ads-reddit-ads": ["redditAds", "redditOps"],
  "ads-webflow": ["webflow"],
  "ads-semrush": ["semrush"],
  "ads-coda-kanban": ["coda", "codaOps"],
  "finance-mercury": ["mercury"],
  "finance-stripe": ["stripe"],
  "finance-hubspot": ["hubspot", "hubspotOps"],
  "sales-hubspot": ["hubspot", "hubspotOps"],
  "sales-stripe": ["stripe"],
  "sales-google-workspace": ["googleWorkspace"],
  "sales-slack": ["slack"],
  "cs-pylon": ["pylon"],
  "cs-coda": ["coda", "codaOps"],
  "cs-product": ["product"],
  "cs-google-workspace": ["googleWorkspace"],
  "cs-slack": ["slack"],
};

function requiredDomainsForSection(section: string | null): Set<DomainKey> {
  if (!section) return new Set(ALL_DOMAINS);
  return new Set(SECTION_DOMAINS[section] ?? ALL_DOMAINS);
}

function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    fn()
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

async function computeProductSuccessData(from: Date, to: Date): Promise<ProductSuccessData> {
  const [createdTasksInRange, completedTasksInRange, overdueOpenTasks, contributors] = await Promise.all([
    prisma.task.count({ where: { createdAt: { gte: from, lte: to } } }),
    prisma.task.count({ where: { completedOn: { gte: from, lte: to } } }),
    prisma.task.count({
      where: {
        status: { not: "DONE" },
        dueDate: { lt: to },
      },
    }),
    prisma.statusHistory.findMany({
      where: {
        changedAt: { gte: from, lte: to },
        changedBy: { not: null },
      },
      distinct: ["changedBy"],
      select: { changedBy: true },
    }),
  ]);

  const activeContributors = contributors.filter((entry) => Boolean(entry.changedBy)).length;
  const backlogGrowth = createdTasksInRange - completedTasksInRange;
  const throughputRate =
    createdTasksInRange > 0 ? Math.round((completedTasksInRange / createdTasksInRange) * 10000) / 100 : null;

  return {
    activeContributors,
    createdTasksInRange,
    completedTasksInRange,
    overdueOpenTasks,
    backlogGrowth,
    throughputRate,
    _meta: {
      fetchedAt: new Date().toISOString(),
      nextRefresh: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      source: "live",
    },
  };
}

function buildRecommendations(data: AnalyticsDashboardData): AnalyticsRecommendation[] {
  const recommendations: AnalyticsRecommendation[] = [];

  if ((data.googleAnalytics?.bounceRate ?? 0) > 0.55) {
    recommendations.push({
      id: "ads-bounce",
      section: "ads-traffic",
      severity: "warning",
      title: "Reduce high bounce traffic",
      insight: `Bounce rate is ${((data.googleAnalytics?.bounceRate ?? 0) * 100).toFixed(1)}%, indicating weak landing relevance.`,
      suggestedAction: "Launch A/B tests on top entry pages and tighten ad-to-page message match.",
    });
  }

  if ((data.hubspot?.funnel?.noShowRate ?? 0) > 15) {
    recommendations.push({
      id: "sales-noshow",
      section: "sales-pipeline",
      severity: "critical",
      title: "No-show rate is hurting conversion",
      insight: `${data.hubspot?.funnel?.noShows ?? 0} no-shows detected in the selected period.`,
      suggestedAction: "Create an automated reminder + reschedule sequence with a 24h and 1h cadence.",
    });
  }

  if ((data.mercury?.cashFlow?.runway ?? 0) > 0 && (data.mercury?.cashFlow?.runway ?? 0) < 4) {
    recommendations.push({
      id: "finance-runway",
      section: "finance",
      severity: "critical",
      title: "Cash runway is below 4 months",
      insight: `Estimated runway is ${(data.mercury?.cashFlow?.runway ?? 0).toFixed(1)} months.`,
      suggestedAction: "Cut non-performing spend and prioritize collections/revenue acceleration this month.",
    });
  }

  if ((data.product?.backlogGrowth ?? 0) > 0) {
    recommendations.push({
      id: "cs-backlog",
      section: "customer-success",
      severity: "warning",
      title: "Execution backlog is growing",
      insight: `Backlog grew by ${data.product?.backlogGrowth ?? 0} items in the selected range.`,
      suggestedAction: "Enable queue-throttling automations and rebalance owner load across active contributors.",
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: "general-steady",
      section: "sales-pipeline",
      severity: "info",
      title: "Performance is stable",
      insight: "No major risk spikes were detected across the selected range.",
      suggestedAction: "Use this window to run one growth experiment in Ads and one cycle-time experiment in execution.",
    });
  }

  return recommendations;
}

function providerForDomain(domain: DomainKey): "google_workspace" | "hubspot" | "slack" | "coda" | "reddit" | null {
  if (domain === "hubspot" || domain === "hubspotOps") return "hubspot";
  if (domain === "googleWorkspace") return "google_workspace";
  if (domain === "slack") return "slack";
  if (domain === "coda" || domain === "codaOps") return "coda";
  if (domain === "redditOps") return "reddit";
  return null;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "true";
  const section = url.searchParams.get("section");
  const domains = requiredDomainsForSection(section);
  const range = parseAnalyticsTimeRange(url.searchParams);
  const fromDate = new Date(`${range.from}T00:00:00.000Z`);
  const toDate = new Date(`${range.to}T23:59:59.999Z`);

  const userId = (session.user as { id?: string }).id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creds = await getCredentials(userId);

  const result: AnalyticsDashboardData = {
    hubspot: null,
    stripe: null,
    mercury: null,
    googleAnalytics: null,
    googleAds: null,
    metaAds: null,
    metaPage: null,
    redditAds: null,
    webflow: null,
    coda: null,
    semrush: null,
    pylon: null,
    product: null,
    googleWorkspace: null,
    slack: null,
    hubspotOps: null,
    codaOps: null,
    redditOps: null,
    funnelJourney: null,
    recommendations: [],
    distilledInsights: [],
    freshness: {
      google_workspace: {
        provider: "google_workspace",
        source: creds.freshness.GOOGLE_WORKSPACE.source,
        status: creds.freshness.GOOGLE_WORKSPACE.status,
        connectedAt: creds.freshness.GOOGLE_WORKSPACE.connectedAt,
        lastSyncedAt: creds.freshness.GOOGLE_WORKSPACE.lastSyncedAt,
        lastError: creds.freshness.GOOGLE_WORKSPACE.lastError,
        stale: false,
        lastSnapshotAt: null,
      },
      hubspot: {
        provider: "hubspot",
        source: creds.freshness.HUBSPOT.source,
        status: creds.freshness.HUBSPOT.status,
        connectedAt: creds.freshness.HUBSPOT.connectedAt,
        lastSyncedAt: creds.freshness.HUBSPOT.lastSyncedAt,
        lastError: creds.freshness.HUBSPOT.lastError,
        stale: false,
        lastSnapshotAt: null,
      },
      slack: {
        provider: "slack",
        source: creds.freshness.SLACK.source,
        status: creds.freshness.SLACK.status,
        connectedAt: creds.freshness.SLACK.connectedAt,
        lastSyncedAt: creds.freshness.SLACK.lastSyncedAt,
        lastError: creds.freshness.SLACK.lastError,
        stale: false,
        lastSnapshotAt: null,
      },
      coda: {
        provider: "coda",
        source: creds.freshness.CODA.source,
        status: creds.freshness.CODA.status,
        connectedAt: creds.freshness.CODA.connectedAt,
        lastSyncedAt: creds.freshness.CODA.lastSyncedAt,
        lastError: creds.freshness.CODA.lastError,
        stale: false,
        lastSnapshotAt: null,
      },
      reddit: {
        provider: "reddit",
        source: creds.freshness.REDDIT.source,
        status: creds.freshness.REDDIT.status,
        connectedAt: creds.freshness.REDDIT.connectedAt,
        lastSyncedAt: creds.freshness.REDDIT.lastSyncedAt,
        lastError: creds.freshness.REDDIT.lastError,
        stale: false,
        lastSnapshotAt: null,
      },
      stripe: {
        provider: "stripe",
        source: creds.freshness.STRIPE.source,
        status: creds.freshness.STRIPE.status,
        connectedAt: creds.freshness.STRIPE.connectedAt,
        lastSyncedAt: creds.freshness.STRIPE.lastSyncedAt,
        lastError: creds.freshness.STRIPE.lastError,
        stale: false,
        lastSnapshotAt: null,
      },
      mercury: {
        provider: "mercury",
        source: creds.freshness.MERCURY.source,
        status: creds.freshness.MERCURY.status,
        connectedAt: creds.freshness.MERCURY.connectedAt,
        lastSyncedAt: creds.freshness.MERCURY.lastSyncedAt,
        lastError: creds.freshness.MERCURY.lastError,
        stale: false,
        lastSnapshotAt: null,
      },
    },
    staleDomains: [],
    timeRange: range,
    lastFullRefresh: new Date().toISOString(),
    errors: [],
  };

  type FetchEntry = {
    key: Exclude<DomainKey, "funnelJourney" | "recommendations" | "distilledInsights">;
    fn: () => Promise<unknown>;
  };

  const fetchers = ([
    { key: "hubspot", fn: () => (creds.hubspotToken ? fetchHubSpotData(creds.hubspotToken) : Promise.reject(new Error("Missing HubSpot credential"))) },
    { key: "stripe", fn: () => (creds.stripeKey ? fetchStripeData(creds.stripeKey) : Promise.reject(new Error("Missing Stripe credential"))) },
    { key: "mercury", fn: () => (creds.mercuryKey ? fetchMercuryData(creds.mercuryKey) : Promise.reject(new Error("Missing Mercury credential"))) },
    {
      key: "googleAnalytics",
      fn: () =>
        creds.gaPropertyId && creds.gaClientEmail && creds.gaPrivateKey
          ? fetchGAData(creds.gaPropertyId, creds.gaClientEmail, creds.gaPrivateKey)
          : Promise.reject(new Error("Missing Google Analytics credential")),
    },
    {
      key: "googleAds",
      fn: () =>
        creds.googleAdsDevToken &&
        creds.googleAdsCustomerId &&
        creds.googleAdsRefreshToken &&
        creds.googleAdsClientId &&
        creds.googleAdsClientSecret
          ? fetchGoogleAdsData(
              creds.googleAdsDevToken,
              creds.googleAdsCustomerId,
              creds.googleAdsRefreshToken,
              creds.googleAdsClientId,
              creds.googleAdsClientSecret
            )
          : Promise.reject(new Error("Missing Google Ads credential")),
    },
    {
      key: "metaAds",
      fn: () =>
        creds.metaAccessToken && creds.metaAdAccountId
          ? fetchMetaAdsData(creds.metaAccessToken, creds.metaAdAccountId)
          : Promise.reject(new Error("Missing Meta Ads credential")),
    },
    {
      key: "metaPage",
      fn: () =>
        creds.metaAccessToken && creds.metaPageId
          ? fetchMetaPageData(creds.metaAccessToken, creds.metaPageId)
          : Promise.reject(new Error("Missing Meta Page credential")),
    },
    {
      key: "redditAds",
      fn: () =>
        creds.redditClientId && creds.redditClientSecret && creds.redditRefreshToken && creds.redditAdAccountId
          ? fetchRedditAdsData(creds.redditClientId, creds.redditClientSecret, creds.redditRefreshToken, creds.redditAdAccountId)
          : Promise.reject(new Error("Missing Reddit Ads credential")),
    },
    {
      key: "webflow",
      fn: () =>
        creds.webflowApiToken && creds.webflowSiteId
          ? fetchWebflowData(creds.webflowApiToken, creds.webflowSiteId)
          : Promise.reject(new Error("Missing Webflow credential")),
    },
    {
      key: "coda",
      fn: () =>
        creds.codaApiToken && creds.codaDocId
          ? fetchCodaData(creds.codaApiToken, creds.codaDocId)
          : Promise.reject(new Error("Missing Coda credential")),
    },
    {
      key: "semrush",
      fn: () => (creds.semrushApiToken ? fetchSemrushData(creds.semrushApiToken) : Promise.reject(new Error("Missing SEMrush credential"))),
    },
    {
      key: "pylon",
      fn: () =>
        creds.pylonApiKey
          ? fetchPylonData({ apiKey: creds.pylonApiKey, from: range.from, to: range.to })
          : Promise.reject(new Error("Missing Pylon credential")),
    },
    {
      key: "product",
      fn: () => computeProductSuccessData(fromDate, toDate),
    },
    {
      key: "googleWorkspace",
      fn: () => fetchIntegrationTelemetryData({ userId, provider: IntegrationProvider.GOOGLE_WORKSPACE, from: fromDate, to: toDate }),
    },
    {
      key: "hubspotOps",
      fn: () => fetchIntegrationTelemetryData({ userId, provider: IntegrationProvider.HUBSPOT, from: fromDate, to: toDate }),
    },
    {
      key: "slack",
      fn: () => fetchIntegrationTelemetryData({ userId, provider: IntegrationProvider.SLACK, from: fromDate, to: toDate }),
    },
    {
      key: "codaOps",
      fn: () => fetchIntegrationTelemetryData({ userId, provider: IntegrationProvider.CODA, from: fromDate, to: toDate }),
    },
    {
      key: "redditOps",
      fn: () => fetchIntegrationTelemetryData({ userId, provider: IntegrationProvider.REDDIT, from: fromDate, to: toDate }),
    },
  ] as FetchEntry[]).filter((entry) => domains.has(entry.key));

  const snapshotExpiresAt = snapshotExpiryFromNow(1);

  const settled = await Promise.allSettled(
    fetchers.map(async (entry) => {
      const latestSnapshot = await readLatestSnapshot({
        userId,
        providerKey: entry.key,
        contextKey: "default",
        rangePreset: range.preset,
        fromDate,
        toDate,
      });

      if (!forceRefresh && latestSnapshot.payload && !latestSnapshot.stale) {
        return {
          key: entry.key,
          payload: latestSnapshot.payload,
          stale: false,
          capturedAt: latestSnapshot.capturedAt,
          source: "snapshot" as const,
        };
      }

      try {
        const live = await withTimeout(entry.fn, 8_500, entry.key);
        await storeAnalyticsSnapshot({
          userId,
          providerKey: entry.key,
          contextKey: "default",
          rangePreset: range.preset,
          fromDate,
          toDate,
          payload: live,
          expiresAt: snapshotExpiresAt,
        });

        return {
          key: entry.key,
          payload: live,
          stale: false,
          capturedAt: new Date().toISOString(),
          source: "live" as const,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed";

        await storeAnalyticsSnapshotFailure({
          userId,
          providerKey: entry.key,
          contextKey: "default",
          rangePreset: range.preset,
          fromDate,
          toDate,
          error: message,
          expiresAt: snapshotExpiresAt,
        });

        const fallback = await readLatestSuccessfulSnapshot({
          userId,
          providerKey: entry.key,
          contextKey: "default",
          rangePreset: range.preset,
          fromDate,
          toDate,
        });

        if (fallback.payload) {
          return {
            key: entry.key,
            payload: fallback.payload,
            stale: true,
            capturedAt: fallback.capturedAt,
            source: "snapshot" as const,
            fallbackError: message,
          };
        }

        throw new Error(message);
      }
    })
  );

  settled.forEach((outcome) => {
    if (outcome.status === "rejected") {
      result.errors.push({
        source: "analytics",
        message: outcome.reason instanceof Error ? outcome.reason.message : "Failed",
      });
      return;
    }

    const { key, payload, stale, capturedAt, fallbackError } = outcome.value;
    (result as unknown as Record<string, unknown>)[key] = payload;

    if (stale) {
      result.staleDomains.push(key);
      if (fallbackError) {
        result.errors.push({ source: key, message: fallbackError });
      }
    }

    const provider = providerForDomain(key);
    if (provider) {
      const existing = result.freshness[provider] as ProviderFreshness | undefined;
      if (existing) {
        result.freshness[provider] = {
          ...existing,
          stale: existing.stale || stale,
          lastSnapshotAt: capturedAt ?? existing.lastSnapshotAt,
          source: stale ? "snapshot" : existing.source,
        };
      }
    }
  });

  if (domains.has("funnelJourney")) {
    result.funnelJourney = buildCrossFunnelData(result);
  }
  if (domains.has("recommendations")) {
    result.recommendations = buildRecommendations(result);
  }
  if (domains.has("distilledInsights")) {
    result.distilledInsights = buildDistilledInsights(result);
  }

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": forceRefresh ? "no-cache, no-store" : "public, s-maxage=120, stale-while-revalidate=60",
    },
  });
}
