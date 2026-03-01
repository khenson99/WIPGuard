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
  privateKey: string,
  options?: { fromDate?: Date; toDate?: Date }
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

  const rangeFrom = options?.fromDate ?? null;
  const rangeTo = options?.toDate ?? null;
  const useRange =
    Boolean(rangeFrom && rangeTo) &&
    !Number.isNaN(rangeFrom?.getTime() ?? NaN) &&
    !Number.isNaN(rangeTo?.getTime() ?? NaN) &&
    Boolean(rangeFrom && rangeTo && rangeFrom <= rangeTo);

  const currentRange = useRange
    ? [{ startDate: rangeFrom!.toISOString().slice(0, 10), endDate: rangeTo!.toISOString().slice(0, 10) }]
    : [{ startDate: "30daysAgo", endDate: "today" }];

  const days = useRange
    ? Math.max(
        1,
        Math.ceil((rangeTo!.getTime() - rangeFrom!.getTime()) / (1000 * 60 * 60 * 24)) + 1
      )
    : 30;

  const previousStart = useRange
    ? new Date(rangeFrom!.getTime() - days * 24 * 60 * 60 * 1000)
    : null;
  const previousEnd = useRange ? new Date(rangeTo!.getTime() - days * 24 * 60 * 60 * 1000) : null;
  const previousRange = useRange
    ? [
        {
          startDate: previousStart!.toISOString().slice(0, 10),
          endDate: previousEnd!.toISOString().slice(0, 10),
        },
      ]
    : [{ startDate: "60daysAgo", endDate: "31daysAgo" }];

  // Run all requests in parallel
  const [current30d, previous30d, trafficAndTrend, topPagesRaw] = await Promise.all([
    // Request 1: Current 30d metrics
    fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        dateRanges: currentRange,
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
        dateRanges: previousRange,
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
        dateRanges: currentRange,
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
        dateRanges: currentRange,
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

  const parseJson = async (response: Response): Promise<unknown> => {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  };

  const errorFromResponse = async (
    response: Response,
    context: string
  ): Promise<Error> => {
    const parsed = (await parseJson(response)) as Record<string, unknown>;
    const message =
      typeof parsed?.message === "string"
        ? parsed.message
        : typeof parsed?.error === "string"
          ? parsed.error
          : response.statusText || "Webflow API request failed";
    const withScopeHint =
      message.includes("missing") && message.includes("scope")
        ? `${message} (check both read/write scopes; read scopes are required for analytics pulls)`
        : message;
    return new Error(`${context} (${response.status}): ${withScopeHint}`);
  };

  const requireObject = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

  const [siteRes, pagesRes, collectionsRes] = await Promise.all([
    fetch(`${baseUrl}/sites/${siteId}`, { headers }),
    fetch(`${baseUrl}/sites/${siteId}/pages`, { headers }),
    fetch(`${baseUrl}/sites/${siteId}/collections`, { headers }),
  ]);

  if (!siteRes.ok) {
    throw await errorFromResponse(siteRes, "Webflow site request failed");
  }
  if (!pagesRes.ok) {
    throw await errorFromResponse(pagesRes, "Webflow pages request failed");
  }
  if (!collectionsRes.ok) {
    throw await errorFromResponse(collectionsRes, "Webflow collections request failed");
  }

  const siteResponse = requireObject(await parseJson(siteRes));
  const pagesResponse = requireObject(await parseJson(pagesRes));
  const collectionsResponse = requireObject(await parseJson(collectionsRes));

  const siteName = String(siteResponse.displayName || siteResponse.name || "");
  const lastPublished = String(
    siteResponse.lastPublished || siteResponse.lastPublishedOn || ""
  );

  const customDomains = asArray(siteResponse.customDomains).map((entry) => {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object") {
      const domain = entry as Record<string, unknown>;
      return String(domain.host || domain.name || domain.url || "");
    }
    return "";
  }).filter(Boolean);

  const pages = asArray(pagesResponse.items).length
    ? asArray(pagesResponse.items)
    : asArray(pagesResponse.pages);
  const collections = asArray(collectionsResponse.items).length
    ? asArray(collectionsResponse.items)
    : asArray(collectionsResponse.collections);

  let formSubmissions: WebflowFormEntry[] = [];
  try {
    const formsRes = await fetch(`${baseUrl}/sites/${siteId}/form_submissions`, {
      headers,
    });
    if (formsRes.ok) {
      const formsResponse = requireObject(await parseJson(formsRes));
      const items = asArray(formsResponse.items).length
        ? asArray(formsResponse.items)
        : asArray(formsResponse.formSubmissions);

      const formMap: Record<string, number> = {};
      items.forEach((submission) => {
        const row = requireObject(submission);
        const formName = String(row.formName || row.formId || "Unknown");
        formMap[formName] = (formMap[formName] || 0) + 1;
      });
      formSubmissions = Object.entries(formMap).map(([formName, count]) => ({
        formName,
        count,
      }));
    }
  } catch {
    formSubmissions = [];
  }

  return {
    siteName,
    lastPublished,
    totalPages: pages.length,
    totalCollections: collections.length,
    formSubmissions,
    customDomains,
    _meta: makeMeta("live"),
  };
}
