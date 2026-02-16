import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
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
import type {
  AnalyticsDashboardData,
  AnalyticsRecommendation,
  CrossFunnelData,
  ProductSuccessData,
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
  | "funnelJourney"
  | "recommendations";

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
  "funnelJourney",
  "recommendations",
];

const SECTION_DOMAINS: Record<string, DomainKey[]> = {
  overview: ["googleAnalytics", "hubspot", "stripe", "mercury", "pylon", "product", "funnelJourney", "recommendations"],
  "ads-traffic": ["googleAnalytics", "googleAds", "metaAds", "redditAds", "webflow", "semrush", "coda", "funnelJourney", "recommendations"],
  finance: ["mercury", "stripe", "hubspot", "funnelJourney", "recommendations"],
  "sales-pipeline": ["hubspot", "stripe", "funnelJourney", "recommendations"],
  "customer-success": ["pylon", "coda", "product", "funnelJourney", "recommendations"],
  "ads-google-analytics": ["googleAnalytics"],
  "ads-google-ads": ["googleAds"],
  "ads-meta-ads": ["metaAds"],
  "ads-reddit-ads": ["redditAds"],
  "ads-webflow": ["webflow"],
  "ads-semrush": ["semrush"],
  "ads-coda-kanban": ["coda"],
  "finance-mercury": ["mercury"],
  "finance-stripe": ["stripe"],
  "finance-hubspot": ["hubspot"],
  "sales-hubspot": ["hubspot"],
  "sales-stripe": ["stripe"],
  "cs-pylon": ["pylon"],
  "cs-coda": ["coda"],
  "cs-product": ["product"],
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

function buildFunnelJourney(data: AnalyticsDashboardData): CrossFunnelData {
  const marketingCount =
    data.googleAnalytics?.users30d ??
    ((data.googleAds?.totalClicks ?? 0) + (data.metaAds?.totalClicks ?? 0) + (data.redditAds?.totalClicks ?? 0));
  const salesCount = data.hubspot?.funnel?.totalDeals ?? 0;
  const customerSuccessCount =
    data.stripe?.subscriptions?.active ?? Math.max(0, (data.pylon?.resolvedInRange ?? 0) - (data.pylon?.urgentConversations ?? 0));

  const salesConv = marketingCount > 0 ? (salesCount / marketingCount) * 100 : null;
  const csConv = salesCount > 0 ? (customerSuccessCount / salesCount) * 100 : null;

  const narrative: string[] = [];
  if (salesConv !== null) {
    narrative.push(`Marketing to sales conversion is ${salesConv.toFixed(1)}%.`);
  }
  if (csConv !== null) {
    narrative.push(`Sales to customer-success handoff retention is ${csConv.toFixed(1)}%.`);
  }
  if (data.hubspot?.funnel?.noShowRate && data.hubspot.funnel.noShowRate > 15) {
    narrative.push("No-show rate is high; tighten reminder and follow-up automations.");
  }
  if (data.pylon?.urgentConversations && data.pylon.urgentConversations > 10) {
    narrative.push("Urgent support load is elevated; consider SLA triage workflow automation.");
  }
  if (narrative.length === 0) {
    narrative.push("Funnel health is stable across acquisition, conversion, and customer success.");
  }

  return {
    stages: [
      { id: "marketing", label: "Marketing", count: marketingCount, conversionFromPrev: null },
      { id: "sales", label: "Sales", count: salesCount, conversionFromPrev: salesConv },
      { id: "customer-success", label: "Customer Success", count: customerSuccessCount, conversionFromPrev: csConv },
    ],
    narrative,
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
      insight: `Bounce rate is ${(((data.googleAnalytics?.bounceRate ?? 0) * 100)).toFixed(1)}%, indicating weak landing relevance.`,
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
    funnelJourney: null,
    recommendations: [],
    timeRange: range,
    lastFullRefresh: new Date().toISOString(),
    errors: [],
  };

  type FetchEntry = {
    key: DomainKey;
    fn: () => Promise<unknown>;
  };
  const fetchers: FetchEntry[] = [];

  if (domains.has("hubspot") && creds.hubspotToken) {
    fetchers.push({ key: "hubspot", fn: () => fetchHubSpotData(creds.hubspotToken!) });
  }
  if (domains.has("stripe") && creds.stripeKey) {
    fetchers.push({ key: "stripe", fn: () => fetchStripeData(creds.stripeKey!) });
  }
  if (domains.has("mercury") && creds.mercuryKey) {
    fetchers.push({ key: "mercury", fn: () => fetchMercuryData(creds.mercuryKey!) });
  }
  // Google Analytics (GA4) — service account OR OAuth2 refresh token
  const hasGAServiceAccount = !!(creds.gaClientEmail && creds.gaPrivateKey);
  const hasGAOAuth = !!(creds.gaRefreshToken && creds.gaOAuthClientId && creds.gaOAuthClientSecret);
  if (domains.has("googleAnalytics") && creds.gaPropertyId && (hasGAServiceAccount || hasGAOAuth)) {
    fetchers.push({
      key: "googleAnalytics",
      fn: () => fetchGAData(creds.gaPropertyId!, creds.gaClientEmail || "", creds.gaPrivateKey || ""),
    });
  }
  if (
    domains.has("googleAds") &&
    creds.googleAdsDevToken &&
    creds.googleAdsCustomerId &&
    creds.googleAdsRefreshToken &&
    creds.googleAdsClientId &&
    creds.googleAdsClientSecret
  ) {
    fetchers.push({
      key: "googleAds",
      fn: () =>
        fetchGoogleAdsData(
          creds.googleAdsDevToken!,
          creds.googleAdsCustomerId!,
          creds.googleAdsRefreshToken!,
          creds.googleAdsClientId!,
          creds.googleAdsClientSecret!
        ),
    });
  }
  if (domains.has("metaAds") && creds.metaAccessToken && creds.metaAdAccountId) {
    fetchers.push({
      key: "metaAds",
      fn: () => fetchMetaAdsData(creds.metaAccessToken!, creds.metaAdAccountId!),
    });
  }
  if (domains.has("metaPage") && creds.metaAccessToken && creds.metaPageId) {
    fetchers.push({
      key: "metaPage",
      fn: () => fetchMetaPageData(creds.metaAccessToken!, creds.metaPageId!),
    });
  }
  if (
    domains.has("redditAds") &&
    creds.redditClientId &&
    creds.redditClientSecret &&
    creds.redditRefreshToken &&
    creds.redditAdAccountId
  ) {
    fetchers.push({
      key: "redditAds",
      fn: () =>
        fetchRedditAdsData(
          creds.redditClientId!,
          creds.redditClientSecret!,
          creds.redditRefreshToken!,
          creds.redditAdAccountId!
        ),
    });
  }
  if (domains.has("webflow") && creds.webflowApiToken && creds.webflowSiteId) {
    fetchers.push({
      key: "webflow",
      fn: () => fetchWebflowData(creds.webflowApiToken!, creds.webflowSiteId!),
    });
  }
  if (domains.has("coda") && creds.codaApiToken && creds.codaDocId) {
    fetchers.push({
      key: "coda",
      fn: () => fetchCodaData(creds.codaApiToken!, creds.codaDocId!),
    });
  }
  if (domains.has("semrush") && creds.semrushApiToken) {
    fetchers.push({
      key: "semrush",
      fn: () => fetchSemrushData(creds.semrushApiToken!),
    });
  }
  if (domains.has("pylon") && creds.pylonApiKey) {
    fetchers.push({
      key: "pylon",
      fn: () => fetchPylonData({ apiKey: creds.pylonApiKey!, from: range.from, to: range.to }),
    });
  }
  if (domains.has("product")) {
    fetchers.push({
      key: "product",
      fn: () => computeProductSuccessData(fromDate, toDate),
    });
  }

  const settled = await Promise.allSettled(
    fetchers.map((entry) => withTimeout(entry.fn, 6500, entry.key))
  );

  settled.forEach((outcome, index) => {
    const targetKey = fetchers[index].key;
    if (outcome.status === "fulfilled") {
      (result as unknown as Record<string, unknown>)[targetKey] = outcome.value;
      return;
    }
    result.errors.push({
      source: targetKey,
      message: outcome.reason instanceof Error ? outcome.reason.message : "Failed",
    });
  });

  if (domains.has("funnelJourney")) {
    result.funnelJourney = buildFunnelJourney(result);
  }
  if (domains.has("recommendations")) {
    result.recommendations = buildRecommendations(result);
  }

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": forceRefresh ? "no-cache, no-store" : "public, s-maxage=300, stale-while-revalidate=60",
    },
  });
}
