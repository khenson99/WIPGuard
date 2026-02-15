// ─── Analytics Credentials Helper ─────────────────────────
// Retrieves API tokens from environment variables or HubSpot integration connection

import { prisma } from "@/lib/prisma";

export interface AnalyticsCredentials {
  hubspotToken: string | null;
  stripeKey: string | null;
  mercuryKey: string | null;
  // Google Analytics (GA4)
  gaPropertyId: string | null;
  gaClientEmail: string | null;
  gaPrivateKey: string | null;
  // Google Ads
  googleAdsDevToken: string | null;
  googleAdsCustomerId: string | null;
  googleAdsRefreshToken: string | null;
  googleAdsClientId: string | null;
  googleAdsClientSecret: string | null;
  // Meta (Facebook/Instagram)
  metaAccessToken: string | null;
  metaAdAccountId: string | null;
  metaPageId: string | null;
  // Reddit Ads
  redditClientId: string | null;
  redditClientSecret: string | null;
  redditRefreshToken: string | null;
  redditAdAccountId: string | null;
  // Webflow
  webflowApiToken: string | null;
  webflowSiteId: string | null;
  // SEMrush
  semrushApiToken: string | null;

  // Coda
  codaApiToken: string | null;
  codaDocId: string | null;
}

/**
 * Get analytics credentials for the current user.
 * Priority: Integration connection (OAuth) > Environment variables
 */
export async function getCredentials(userId?: string): Promise<AnalyticsCredentials> {
  const envHubspot = process.env.HUBSPOT_ACCESS_TOKEN?.trim() || null;
  const stripeKey: string | null = process.env.STRIPE_SECRET_KEY?.trim() || null;
  const mercuryKey: string | null = process.env.MERCURY_API_TOKEN?.trim() || null;

  // Prefer env var when set; only fall back to DB integration connection
  let hubspotToken: string | null = envHubspot;

  if (!hubspotToken && userId) {
    try {
      const conn = await prisma.integrationConnection.findUnique({
        where: { userId_provider: { userId, provider: "HUBSPOT" } },
      });
      if (conn?.accessToken && conn.status === "CONNECTED") {
        hubspotToken = conn.accessToken;
      }
    } catch {
      // No DB connection available
    }
  }

  return {
    hubspotToken,
    stripeKey,
    mercuryKey,

    // Google Analytics (GA4) — Service Account
    gaPropertyId: process.env.GA_PROPERTY_ID?.trim() || null,
    gaClientEmail: process.env.GA_CLIENT_EMAIL?.trim() || null,
    gaPrivateKey: process.env.GA_PRIVATE_KEY?.replace(/\\n/g, "\n").trim() || null,

    // Google Ads
    googleAdsDevToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() || null,
    googleAdsCustomerId: process.env.GOOGLE_ADS_CUSTOMER_ID?.trim() || null,
    googleAdsRefreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim() || null,
    googleAdsClientId: process.env.GOOGLE_ADS_CLIENT_ID?.trim() || null,
    googleAdsClientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET?.trim() || null,

    // Meta (Facebook/Instagram)
    metaAccessToken: process.env.META_ACCESS_TOKEN?.trim() || null,
    metaAdAccountId: process.env.META_AD_ACCOUNT_ID?.trim() || null,
    metaPageId: process.env.META_PAGE_ID?.trim() || null,

    // Reddit Ads
    redditClientId: process.env.REDDIT_CLIENT_ID?.trim() || null,
    redditClientSecret: process.env.REDDIT_CLIENT_SECRET?.trim() || null,
    redditRefreshToken: process.env.REDDIT_REFRESH_TOKEN?.trim() || null,
    redditAdAccountId: process.env.REDDIT_AD_ACCOUNT_ID?.trim() || null,

    // SEMrush
    semrushApiToken: process.env.SEMRUSH_API_TOKEN?.trim() || null,

    // Webflow
    webflowApiToken: process.env.WEBFLOW_API_TOKEN?.trim() || null,
    webflowSiteId: process.env.WEBFLOW_SITE_ID?.trim() || "67b7700312bb763ca2083376",

  // Coda
    codaApiToken: process.env.CODA_API_TOKEN?.trim() || null,
    codaDocId: process.env.CODA_DOC_ID?.trim() || "dPjhbdhLZh9",
  };
}
