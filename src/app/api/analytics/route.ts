// ─── Analytics API Route ──────────────────────────────────
// GET /api/analytics — returns combined dashboard data
// Supports: on-page-load fetch, hourly revalidation, manual refresh

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCredentials } from "@/lib/analytics/credentials";
import { fetchHubSpotData, fetchStripeData, fetchMercuryData } from "@/lib/analytics/fetchers";
import { fetchGAData, fetchWebflowData } from "@/lib/analytics/fetchers-ga-webflow";
import { fetchGoogleAdsData, fetchMetaAdsData, fetchMetaPageData, fetchRedditAdsData } from "@/lib/analytics/fetchers-ads";
import { fetchCodaData } from "@/lib/analytics/fetchers-coda";
import { fetchSemrushData } from "@/lib/analytics/fetchers-semrush";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";

// Cache: revalidate every hour
export const revalidate = 3600;

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check for force refresh
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "true";

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
    lastFullRefresh: new Date().toISOString(),
    errors: [],
  };

  // Build fetcher array — only include sources with credentials
  type FetcherEntry = { key: string; fn: () => Promise<unknown> };
  const fetchers: FetcherEntry[] = [];

  // Existing sources
  if (creds.hubspotToken) {
    fetchers.push({ key: "hubspot", fn: () => fetchHubSpotData(creds.hubspotToken!) });
  }
  if (creds.stripeKey) {
    fetchers.push({ key: "stripe", fn: () => fetchStripeData(creds.stripeKey!) });
  }
  if (creds.mercuryKey) {
    fetchers.push({ key: "mercury", fn: () => fetchMercuryData(creds.mercuryKey!) });
  }

  // Google Analytics (GA4) — service account OR OAuth2 refresh token
  if (creds.gaPropertyId && (
    (creds.gaClientEmail && creds.gaPrivateKey) ||
    (creds.gaRefreshToken && creds.gaOAuthClientId && creds.gaOAuthClientSecret)
  )) {
    fetchers.push({
      key: "googleAnalytics",
      fn: () => fetchGAData(creds.gaPropertyId!, creds.gaClientEmail || "", creds.gaPrivateKey || ""),
    });
  }

  // Google Ads — needs all 5 fields
  if (creds.googleAdsDevToken && creds.googleAdsCustomerId && creds.googleAdsRefreshToken && creds.googleAdsClientId && creds.googleAdsClientSecret) {
    fetchers.push({
      key: "googleAds",
      fn: () => fetchGoogleAdsData(
        creds.googleAdsDevToken!, creds.googleAdsCustomerId!,
        creds.googleAdsRefreshToken!, creds.googleAdsClientId!, creds.googleAdsClientSecret!,
      ),
    });
  }

  // Meta Ads
  if (creds.metaAccessToken && creds.metaAdAccountId) {
    fetchers.push({
      key: "metaAds",
      fn: () => fetchMetaAdsData(creds.metaAccessToken!, creds.metaAdAccountId!),
    });
  }

  // Meta Page Insights
  if (creds.metaAccessToken && creds.metaPageId) {
    fetchers.push({
      key: "metaPage",
      fn: () => fetchMetaPageData(creds.metaAccessToken!, creds.metaPageId!),
    });
  }

  // Reddit Ads
  if (creds.redditClientId && creds.redditClientSecret && creds.redditRefreshToken && creds.redditAdAccountId) {
    fetchers.push({
      key: "redditAds",
      fn: () => fetchRedditAdsData(
        creds.redditClientId!, creds.redditClientSecret!,
        creds.redditRefreshToken!, creds.redditAdAccountId!,
      ),
    });
  }

  // Webflow
  if (creds.webflowApiToken && creds.webflowSiteId) {
    fetchers.push({
      key: "webflow",
      fn: () => fetchWebflowData(creds.webflowApiToken!, creds.webflowSiteId!),
    });
  }

  // Coda
  if (creds.codaApiToken && creds.codaDocId) {
    fetchers.push({
      key: "coda",
      fn: () => fetchCodaData(creds.codaApiToken!, creds.codaDocId!),
    });
  }

  // SEMrush
  if (creds.semrushApiToken) {
    fetchers.push({
      key: "semrush",
      fn: () => fetchSemrushData(creds.semrushApiToken!),
    });
  }

  // Execute all fetchers in parallel
  const results = await Promise.allSettled(fetchers.map((f) => f.fn()));

  // Map results back to the response object
  results.forEach((outcome, i) => {
    const { key } = fetchers[i];
    if (outcome.status === "fulfilled") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result as any)[key] = outcome.value;
    } else {
      result.errors.push({
        source: key,
        message: outcome.reason?.message || "Failed",
      });
    }
  });

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": forceRefresh
        ? "no-cache, no-store"
        : "public, s-maxage=3600, stale-while-revalidate=300",
    },
  });
}
