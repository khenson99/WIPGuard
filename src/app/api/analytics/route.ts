import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { IntegrationProvider } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCredentials } from "@/lib/analytics/credentials";
import { parseAnalyticsTimeRange } from "@/lib/analytics/time-range";
import {
  buildSalesPerformancePack,
  fetchHubSpotContacts,
  fetchHubSpotData,
  fetchMercuryData,
  fetchStripeChargesByCustomer,
  fetchStripeData,
} from "@/lib/analytics/fetchers";
import { fetchGAData, fetchWebflowData } from "@/lib/analytics/fetchers-ga-webflow";
import {
  fetchGoogleAdsData,
  fetchMetaAdsData,
  fetchMetaPageData,
  fetchRedditAdsData,
  fetchMetaInstagramData,
} from "@/lib/analytics/fetchers-ads";
import { fetchCodaData } from "@/lib/analytics/fetchers-coda";
import { fetchSemrushData } from "@/lib/analytics/fetchers-semrush";
import { fetchPylonData } from "@/lib/analytics/fetchers-pylon";
import { fetchIntegrationTelemetryData } from "@/lib/analytics/fetchers-integrations";
import { buildCrossFunnelData, buildLifecycleFunnelData } from "@/lib/analytics/funnel";
import { buildCustomerJourneyData } from "@/lib/analytics/customer-journey";
import { buildDemoAnalyticsData } from "@/lib/analytics/demo-analytics";
import { buildProcessAnalyticsData } from "@/lib/analytics/process-analytics";
import { buildAiInsightsBundle, buildDistilledInsights } from "@/lib/analytics/insight-engine";
import { createEmptyAnalyticsDashboardData, patchFreshnessWithStale } from "@/lib/analytics/response-shape";
import {
  analyticsErrorFromReason,
  createAnalyticsDomainError,
} from "@/lib/analytics/error-attribution";
import {
  readLatestSnapshot,
  readLatestSuccessfulSnapshot,
  snapshotExpiryFromNow,
  storeAnalyticsSnapshot,
  storeAnalyticsSnapshotFailure,
} from "@/lib/analytics/snapshots";
import { buildAnalyticsRouteMeta } from "@/lib/analytics/route-meta";
import type {
  AnalyticsDashboardData,
  AnalyticsRecommendation,
  ProductSuccessData,
} from "@/lib/analytics/types";

export const revalidate = 300;

type DomainKey =
  | "hubspot"
  | "salesPerformance"
  | "stripe"
  | "mercury"
  | "googleAnalytics"
  | "googleAds"
  | "metaAds"
  | "metaPage"
  | "instagram"
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
  | "lifecycleFunnel"
  | "funnelJourney"
  | "aiInsights"
  | "recommendations"
  | "distilledInsights"
  | "customerJourney"
  | "demoAnalytics"
  | "processAnalytics";

const ALL_DOMAINS: DomainKey[] = [
  "hubspot",
  "stripe",
  "mercury",
  "googleAnalytics",
  "googleAds",
  "metaAds",
  "metaPage",
  "instagram",
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
  "lifecycleFunnel",
  "funnelJourney",
  "aiInsights",
  "recommendations",
  "distilledInsights",
  "customerJourney",
  "demoAnalytics",
  "processAnalytics",
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
    "lifecycleFunnel",
    "funnelJourney",
    "aiInsights",
    "recommendations",
    "distilledInsights",
  ],
  "ads-traffic": [
    "googleAnalytics",
    "googleAds",
    "metaAds",
    "instagram",
    "redditAds",
    "webflow",
    "semrush",
    "coda",
    "lifecycleFunnel",
    "funnelJourney",
    "aiInsights",
    "recommendations",
    "distilledInsights",
  ],
  finance: [
    "mercury",
    "stripe",
    "hubspot",
    "hubspotOps",
    "lifecycleFunnel",
    "funnelJourney",
    "aiInsights",
    "recommendations",
    "distilledInsights",
  ],
  "finance-planning": ["stripe", "mercury"],
  "finance-forecast": ["stripe", "mercury"],
  "finance-pnl": ["stripe", "mercury"],
  "finance-unit-economics": ["stripe", "mercury", "hubspot"],
  "sales-pipeline": [
    "hubspot",
    "stripe",
    "googleWorkspace",
    "slack",
    "hubspotOps",
    "lifecycleFunnel",
    "funnelJourney",
    "aiInsights",
    "recommendations",
    "distilledInsights",
  ],
  "customer-success": [
    "pylon",
    "coda",
    "product",
    "googleWorkspace",
    "slack",
    "codaOps",
    "lifecycleFunnel",
    "funnelJourney",
    "aiInsights",
    "recommendations",
    "distilledInsights",
  ],
  "ads-google-analytics": ["googleAnalytics"],
  "ads-google-ads": ["googleAds"],
  "ads-meta-ads": ["metaAds", "metaPage", "instagram"],
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

  "customer-journey": [
    "hubspot", "stripe", "mercury", "googleWorkspace", "slack",
    "webflow", "coda", "googleAnalytics", "googleAds", "metaAds",
    "instagram", "redditAds", "pylon", "customerJourney",
    "lifecycleFunnel", "funnelJourney", "aiInsights", "recommendations", "distilledInsights",
  ],
  "cj-overview": ["hubspot", "stripe", "googleWorkspace", "slack", "webflow", "googleAnalytics", "googleAds", "metaAds", "instagram", "redditAds", "pylon", "customerJourney"],
  "cj-touchpoints": ["hubspot", "stripe", "googleWorkspace", "slack", "webflow", "googleAnalytics", "googleAds", "metaAds", "instagram", "redditAds", "pylon", "customerJourney"],

  "demo-analytics": [
    "hubspot", "googleWorkspace", "demoAnalytics",
    "lifecycleFunnel", "funnelJourney", "aiInsights", "recommendations", "distilledInsights",
  ],
  "demo-scheduling": ["hubspot", "googleWorkspace", "demoAnalytics"],
  "demo-attribution": ["hubspot", "googleAds", "metaAds", "instagram", "redditAds", "googleAnalytics", "webflow", "demoAnalytics"],

  "process-analytics": [
    "hubspot", "stripe", "processAnalytics",
    "lifecycleFunnel", "funnelJourney", "aiInsights", "recommendations", "distilledInsights",
  ],
  "process-bottlenecks": ["hubspot", "processAnalytics"],
  "process-velocity": ["hubspot", "processAnalytics"],
  "process-health": ["hubspot", "stripe", "processAnalytics"],
  "process-throughput": ["hubspot", "processAnalytics"],
              creds.googleAdsLoginCustomerId,
              fromDate,
              toDate
            )
          : Promise.reject(new Error("Missing Google Ads credential")),
    },
    {
      key: "metaAds",
      fn: () =>
        creds.metaAccessToken && creds.metaAdAccountId
          ? fetchMetaAdsData(creds.metaAccessToken, creds.metaAdAccountId, fromDate, toDate)
          : Promise.reject(new Error("Missing Meta Ads credential")),
    },
    {
      key: "metaPage",
      fn: () =>
        creds.metaAccessToken && creds.metaPageId
          ? fetchMetaPageData(creds.metaAccessToken, creds.metaPageId, fromDate, toDate)
          : Promise.reject(new Error("Missing Meta Page credential")),
    },
    {
      key: "instagram",
      fn: () =>
        creds.metaAccessToken && creds.metaInstagramAccountId
          ? fetchMetaInstagramData(
              creds.metaAccessToken,
              creds.metaInstagramAccountId,
              { pageId: creds.metaPageId ?? undefined },
              fromDate,
              toDate
            )
          : Promise.reject(new Error("Missing Instagram credential")),
    },
    {
      key: "redditAds",
      fn: () =>
        creds.redditClientId && creds.redditClientSecret && creds.redditRefreshToken && creds.redditAdAccountId
          ? fetchRedditAdsData(
              creds.redditClientId,
              creds.redditClientSecret,
              creds.redditRefreshToken,
              creds.redditAdAccountId,
              creds.redditUserAgent,
              fromDate,
              toDate
            )
          : Promise.reject(new Error("Missing Reddit Ads credential")),
    },
    {
      key: "webflow",
      fn: () =>
        creds.webflowApiToken && creds.webflowSiteId
          ? fetchWebflowData(creds.webflowApiToken, creds.webflowSiteId, fromDate, toDate)
          : Promise.reject(new Error("Missing Webflow credential")),
    },
    {
      key: "coda",
      fn: () =>
        creds.codaApiToken && creds.codaDocId
          ? fetchCodaData(creds.codaApiToken, creds.codaDocId, {
              fromDate,
              toDate,
              now: toDate,
              hubspotAccessToken: creds.hubspotToken,
              maxRecentSubmitters: 25,
            })
          : Promise.reject(new Error("Missing Coda credential")),
    },
    {
      key: "semrush",
      fn: () =>
        creds.semrushApiToken && creds.semrushDomain
          ? fetchSemrushData(creds.semrushApiToken, creds.semrushDomain)
          : Promise.reject(new Error("Missing SEMrush credential")),
    },
    {
      key: "pylon",
      fn: () =>
        creds.pylonApiKey
          ? fetchPylonData({
              apiKey: creds.pylonApiKey,
              from: range.from,
              to: range.to,
              baseUrl: creds.pylonBaseUrl ?? undefined,
            })
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

  const TIMEOUT_OVERRIDES: Partial<Record<DomainKey, number>> = {
    stripe: 20000,
  };
  const DEFAULT_TIMEOUT = 12000;

  const snapshotExpiresAt = snapshotExpiryFromNow(1);

  const settled = await Promise.allSettled(
    fetchers.map(async (entry): Promise<FetchOutcome> => {
      const latestSnapshot = await readLatestSnapshot({
        userId,
        providerKey: entry.key,
        contextKey: "default",
        rangePreset: range.preset,
        fromDate,
        toDate,
      });

      if (!forceRefresh && latestSnapshot.payload) {
        if (latestSnapshot.stale) {
          queueStaleSnapshotRefresh({
            userId,
            rangePreset: range.preset,
            fromDate,
            toDate,
            snapshotExpiresAt,
            entry,
          });
        }

        return {
          key: entry.key,
          payload: latestSnapshot.payload,
          stale: latestSnapshot.stale,
          capturedAt: latestSnapshot.capturedAt,
          source: "snapshot" as const,
        };
      }

      try {
        const live = await withTimeout(
          entry.fn,
          TIMEOUT_OVERRIDES[entry.key] ?? DEFAULT_TIMEOUT,
          entry.key
        );
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

        throw createAnalyticsDomainError(entry.key, message);
      }
    })
  );

  settled.forEach((outcome) => {
    if (outcome.status === "rejected") {
      const mapped = analyticsErrorFromReason(outcome.reason);
      result.errors.push(mapped);
      result.staleDomains.push(mapped.source);

      const provider = providerForDomain(mapped.source as DomainKey);
      if (provider) {
        const existing = result.freshness[provider];
        if (existing) {
          result.freshness[provider] = patchFreshnessWithStale(existing, {
            stale: true,
            source: "snapshot",
            lastError: mapped.message,
          });
        }
      }
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
      const existing = result.freshness[provider];
      if (existing) {
        result.freshness[provider] = patchFreshnessWithStale(existing, {
          stale,
          capturedAt,
          lastError: fallbackError ?? null,
        });
      }
    }
  });

  await hydrateStripeCustomerLinks(userId, result);

  if (domains.has("funnelJourney")) {
    result.funnelJourney = buildCrossFunnelData(result);
  }
  if (domains.has("lifecycleFunnel")) {
    result.lifecycleFunnel = buildLifecycleFunnelData(result);
  }
  if (domains.has("aiInsights")) {
    result.aiInsights = buildAiInsightsBundle(result);
  }
  
  if (domains.has("customerJourney")) {
    result.customerJourney = buildCustomerJourneyData(result);
  }
  if (domains.has("recommendations")) {
    result.recommendations = buildRecommendations(result);
  }
  if (domains.has("distilledInsights")) {
    result.distilledInsights = buildDistilledInsights(result);
  }
  if (domains.has("customerJourney")) {
    result.customerJourney = buildCustomerJourneyData(result);
  }
  if (domains.has("demoAnalytics")) {
    result.demoAnalytics = buildDemoAnalyticsData(result);
  }
  if (domains.has("processAnalytics")) {
    result.processAnalytics = buildProcessAnalyticsData(result);
  }

  const staleDomains = Array.from(new Set(result.staleDomains));
  const erroredDomains = Array.from(new Set(result.errors.map((entry) => entry.source)));
  result.staleDomains = staleDomains;
  result.meta = buildAnalyticsRouteMeta({
    section,
    forceRefresh,
    staleDomains,
    erroredDomains,
  });

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": forceRefresh ? "no-cache, no-store" : "private, max-age=30, stale-while-revalidate=120",
    },
  });
}
