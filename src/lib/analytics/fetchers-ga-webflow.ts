import { createSign } from "crypto";
import {
  GAData,
  GATrafficChannel,
  GATopPage,
  WebflowData,
  WebflowFormEntry,
  AnalyticsTimestamp,
} from "./types";

function makeMeta(source: "live" | "cached" = "live"): AnalyticsTimestamp {
  const now = new Date();
  return {
    fetchedAt: now.toISOString(),
    nextRefresh: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    source,
  };
}

/**
 * Obtain a GA4 access token.
 * Supports two authentication methods:
 *   1. OAuth2 Refresh Token (preferred when org policy blocks SA keys)
 *      - Requires: GA_REFRESH_TOKEN + GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET
 *   2. Service Account JWT (traditional approach)
 *      - Requires: GA_CLIENT_EMAIL + GA_PRIVATE_KEY
 */
async function getGAAccessToken(opts: {
  clientEmail?: string | null;
  privateKey?: string | null;
  refreshToken?: string | null;
  googleClientId?: string | null;
  googleClientSecret?: string | null;
}): Promise<string> {
  // ── Path 1: OAuth2 Refresh Token ──
  if (opts.refreshToken && opts.googleClientId && opts.googleClientSecret) {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: opts.refreshToken,
        client_id: opts.googleClientId,
        client_secret: opts.googleClientSecret,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      throw new Error(
        `GA4 OAuth2 token refresh failed (${tokenResponse.status}): ${errorBody}`
      );
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string };
    return tokenData.access_token;
  }

  // ── Path 2: Service Account JWT ──
  if (opts.clientEmail && opts.privateKey) {
    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      iss: opts.clientEmail,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    };

    const jwtHeader = { alg: "RS256" as const, typ: "JWT" as const };

    const encodeBase64Url = (str: string): string =>
      Buffer.from(str)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

    const headerEncoded = encodeBase64Url(JSON.stringify(jwtHeader));
    const payloadEncoded = encodeBase64Url(JSON.stringify(jwtPayload));
    const signatureInput = `${headerEncoded}.${payloadEncoded}`;

    const sign = createSign("RSA-SHA256");
    sign.update(signatureInput);
    const signatureBuffer = sign.sign(opts.privateKey);
    const signatureEncoded = signatureBuffer
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    const jwt = `${signatureInput}.${signatureEncoded}`;

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      throw new Error(
        `GA4 SA token exchange failed: ${tokenResponse.statusText}`
      );
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string };
    return tokenData.access_token;
  }

  throw new Error(
    "GA4 authentication failed: provide either GA_REFRESH_TOKEN (with GOOGLE_CLIENT_ID/SECRET) " +
      "or GA_CLIENT_EMAIL + GA_PRIVATE_KEY"
  );
}

export async function fetchGAData(
  propertyId: string,
  clientEmail: string,
  privateKey: string
): Promise<GAData> {
  // Get access token using whichever auth method is configured
  const accessToken = await getGAAccessToken({
    clientEmail: clientEmail || null,
    privateKey: privateKey || null,
    refreshToken: process.env.GA_REFRESH_TOKEN?.trim() || null,
    googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || null,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || null,
  });

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const apiUrl = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

  // Run all requests in parallel
  const [current30d, previous30d, trafficAndTrend, topPagesRaw] = await Promise.all([
    // Request 1: Current 30d metrics
    fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "screenPageViews" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
        ],
      }),
    }).then((r) => r.json()),

    // Request 2: Previous 30d metrics
    fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        dateRanges: [{ startDate: "60daysAgo", endDate: "31daysAgo" }],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "screenPageViews" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
        ],
      }),
    }).then((r) => r.json()),

    // Request 3: Traffic by channel + daily trend
    fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [
          { name: "sessionDefaultChannelGroup" },
          { name: "date" },
        ],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "screenPageViews" },
        ],
      }),
    }).then((r) => r.json()),

    // Request 4: Top pages
    fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [{ name: "pagePath" }],
        metrics: [
          { name: "screenPageViews" },
          { name: "averageSessionDuration" },
        ],
        limit: 10,
        orderBys: [
          {
            metric: { metricName: "screenPageViews" },
            desc: true,
          },
        ],
      }),
    }).then((r) => r.json()),
  ]);

  // Parse current 30d metrics
  const current30dRow = current30d.rows?.[0]?.metricValues || [];
  const sessions30d = parseInt(current30dRow[0]?.value || "0");
  const users30d = parseInt(current30dRow[1]?.value || "0");
  const pageviews30d = parseInt(current30dRow[2]?.value || "0");
  const bounceRate = parseFloat(current30dRow[3]?.value || "0");
  const avgSessionDuration = parseFloat(current30dRow[4]?.value || "0");

  // Parse previous 30d metrics
  const previous30dRow = previous30d.rows?.[0]?.metricValues || [];
  const sessionsPrev30d = parseInt(previous30dRow[0]?.value || "0");
  const usersPrev30d = parseInt(previous30dRow[1]?.value || "0");
  const pageviewsPrev30d = parseInt(previous30dRow[2]?.value || "0");

  // Parse traffic by channel
  const trafficByChannelMap: Record<string, GATrafficChannel> = {};
  const dailyTrendMap: Record<string, number> = {};

  (trafficAndTrend.rows || []).forEach(
    (row: {
      dimensionValues: Array<{ value: string }>;
      metricValues: Array<{ value: string }>;
    }) => {
      const channel = row.dimensionValues[0]?.value || "Unknown";
      const date = row.dimensionValues[1]?.value || "";
      const sessions = parseInt(row.metricValues[0]?.value || "0");
      const users = parseInt(row.metricValues[1]?.value || "0");
      const pageviews = parseInt(row.metricValues[2]?.value || "0");

      // Aggregate by channel
      if (!trafficByChannelMap[channel]) {
        trafficByChannelMap[channel] = {
          channel,
          sessions: 0,
          users: 0,
          pageviews: 0,
        };
      }
      trafficByChannelMap[channel].sessions += sessions;
      trafficByChannelMap[channel].users += users;
      trafficByChannelMap[channel].pageviews += pageviews;

      // Aggregate daily trend
      if (date) {
        dailyTrendMap[date] = (dailyTrendMap[date] || 0) + sessions;
      }
    }
  );

  const trafficByChannel: GATrafficChannel[] = Object.values(trafficByChannelMap);

  const dailyTrend = Object.entries(dailyTrendMap).map(([date, sessions]) => ({
    date: date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"),
    sessions,
  }));

  // Parse top pages
  const topPages: GATopPage[] = (topPagesRaw.rows || []).map(
    (row: {
      dimensionValues: Array<{ value: string }>;
      metricValues: Array<{ value: string }>;
    }) => ({
      path: row.dimensionValues[0]?.value || "/",
      pageviews: parseInt(row.metricValues[0]?.value || "0"),
      avgDuration: parseFloat(row.metricValues[1]?.value || "0"),
    })
  );

  return {
    sessions30d,
    sessionsPrev30d,
    users30d,
    usersPrev30d,
    pageviews30d,
    pageviewsPrev30d,
    bounceRate,
    avgSessionDuration,
    trafficByChannel,
    topPages,
    dailyTrend,
    _meta: makeMeta("live"),
  };
}

export async function fetchWebflowData(
  apiToken: string,
  siteId: string
): Promise<WebflowData> {
  const baseUrl = "https://api.webflow.com/v2";
  const headers = {
    Authorization: `Bearer ${apiToken}`,
    Accept: "application/json",
  };

  try {
    // Fetch site info, pages, collections in parallel
    const [siteResponse, pagesResponse, collectionsResponse] = await Promise.all([
      fetch(`${baseUrl}/sites/${siteId}`, { headers }).then((r) => r.json()),
      fetch(`${baseUrl}/sites/${siteId}/pages`, { headers }).then((r) => r.json()),
      fetch(`${baseUrl}/sites/${siteId}/collections`, { headers }).then((r) =>
        r.json()
      ),
    ]);

    const siteName = siteResponse.displayName || siteResponse.name || "";
    const lastPublished = siteResponse.lastPublished || "";
    const customDomains = siteResponse.customDomains || [];
    const totalPages = (pagesResponse.items || []).length;
    const totalCollections = (collectionsResponse.items || []).length;

    // Try to fetch form submissions (may fail in v2)
    let formSubmissions: WebflowFormEntry[] = [];
    try {
      const submissionsResponse = await fetch(
        `${baseUrl}/sites/${siteId}/form-submissions`,
        { headers }
      ).then((r) => r.json());

      if (submissionsResponse.items) {
        const formMap: Record<string, number> = {};
        (submissionsResponse.items || []).forEach(
          (submission: { formId?: string; formName?: string }) => {
            const formName = submission.formName || submission.formId || "Unknown";
            formMap[formName] = (formMap[formName] || 0) + 1;
          }
        );
        formSubmissions = Object.entries(formMap).map(([formName, count]) => ({
          formName,
          count,
        }));
      }
    } catch {
      // Form submissions endpoint may not exist in v2, silently fail
      formSubmissions = [];
    }

    return {
      siteName,
      lastPublished,
      totalPages,
      totalCollections,
      formSubmissions,
      customDomains,
      _meta: makeMeta("live"),
    };
  } catch (error) {
    throw new Error(`Failed to fetch Webflow data: ${error instanceof Error ? error.message : String(error)}`);
  }
}
