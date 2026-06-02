import { createSign } from "crypto";
import { safeJson } from "@/lib/analytics/fetcher-utils";
import {
  GAData,
  GATrafficChannel,
  GATopPage,
  WebflowData,
  WebflowFormEntry,
  WebflowPageDetail,
  WebflowCollectionDetail,
  WebflowFormTrendEntry,
  WebflowSeoAudit,
  WebflowContentFreshness,
  AnalyticsTimestamp,
} from "./types";
import { computeKanbanBounceComparison } from "./kanban-bounce-comparison";

type GAReportValue = { value?: string };
type GAReportRow = { dimensionValues?: GAReportValue[]; metricValues?: GAReportValue[] };
type GAReportResponse = { rows?: GAReportRow[]; rowCount?: number };
type GAPaginatedReportResult = { rows: GAReportRow[]; truncated: boolean };

function makeMeta(source: "live" | "cached" = "live"): AnalyticsTimestamp {
  const now = new Date();
  return {
    fetchedAt: now.toISOString(),
    nextRefresh: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    source,
  };
}

function readFiniteMetric(value: string | undefined, mode: "int" | "float"): number {
  if (!value?.trim()) return 0;
  const normalized = value.trim().replace(/,/g, "");
  const parsed = mode === "int"
    ? Number.parseInt(normalized, 10)
    : Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readMetricInt(value: string | undefined): number {
  return readFiniteMetric(value, "int");
}

function readMetricFloat(value: string | undefined): number {
  return readFiniteMetric(value, "float");
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
      cache: "no-store",
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

    const tokenData = await safeJson<{ access_token: string }>(tokenResponse, "ga4 oauth token");
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
      cache: "no-store",
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

    const tokenData = await safeJson<{ access_token: string }>(tokenResponse, "ga4 service account token");
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

  const fetchReport = async (
    body: Record<string, unknown>,
    label: string,
  ): Promise<GAReportResponse> => {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      cache: "no-store",
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`GA4 report (${label}) failed (${response.status})`);
    return await safeJson<GAReportResponse>(response, `GA report (${label})`);
  };

  const fetchReportPages = async (
    body: Record<string, unknown>,
    label: string,
    pageSize = 100,
  ): Promise<GAPaginatedReportResult> => {
    const rows: GAReportRow[] = [];
    let truncated = false;

    for (let page = 0; page < 100; page += 1) {
      const offset = page * pageSize;
      const response = await fetchReport(
        {
          ...body,
          limit: pageSize,
          offset,
        },
        label,
      );
      const pageRows = response.rows ?? [];
      rows.push(...pageRows);

      const rowCount = typeof response.rowCount === "number" ? response.rowCount : null;
      if (page === 99 && rowCount !== null && offset + pageRows.length < rowCount) {
        truncated = true;
        break;
      }
      if (rowCount !== null && offset + pageRows.length >= rowCount) break;
      if (pageRows.length < pageSize) break;
    }

    return { rows, truncated };
  };

  // Run all requests in parallel
  const [current30d, previous30d, trafficAndTrend, topPageResult, topPagesPrevious] = await Promise.all([
    // Request 1: Current 30d metrics
    fetchReport(
      {
        dateRanges: currentRange,
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "screenPageViews" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
        ],
      },
      "current",
    ),

    // Request 2: Previous 30d metrics
    fetchReport(
      {
        dateRanges: previousRange,
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "screenPageViews" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
        ],
      },
      "previous",
    ),

    // Request 3: Traffic by channel + daily trend
    fetchReport(
      {
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
      },
      "traffic",
    ),

    // Request 4: Top pages
    fetchReportPages(
      {
        dateRanges: currentRange,
        dimensions: [{ name: "pagePath" }],
        metrics: [
          { name: "screenPageViews" },
          { name: "averageSessionDuration" },
          { name: "sessions" },
          { name: "bounceRate" },
        ],
        orderBys: [
          {
            metric: { metricName: "screenPageViews" },
            desc: true,
          },
        ],
      },
      "top pages",
    ),

    // Request 5: Previous-period top pages used for landing-page bounce deltas.
    fetchReport(
      {
        dateRanges: previousRange,
        dimensions: [{ name: "pagePath" }],
        metrics: [
          { name: "screenPageViews" },
          { name: "averageSessionDuration" },
          { name: "sessions" },
          { name: "bounceRate" },
        ],
        limit: 100,
        orderBys: [
          {
            metric: { metricName: "screenPageViews" },
            desc: true,
          },
        ],
      },
      "top pages previous",
    ),
  ]);
  const topPageRows = topPageResult.rows;

  // Parse current 30d metrics
  const current30dRow = current30d.rows?.[0]?.metricValues || [];
  const sessions30d = readMetricInt(current30dRow[0]?.value);
  const users30d = readMetricInt(current30dRow[1]?.value);
  const pageviews30d = readMetricInt(current30dRow[2]?.value);
  const bounceRate = readMetricFloat(current30dRow[3]?.value);
  const avgSessionDuration = readMetricFloat(current30dRow[4]?.value);

  // Parse previous 30d metrics
  const previous30dRow = previous30d.rows?.[0]?.metricValues || [];
  const sessionsPrev30d = readMetricInt(previous30dRow[0]?.value);
  const usersPrev30d = readMetricInt(previous30dRow[1]?.value);
  const pageviewsPrev30d = readMetricInt(previous30dRow[2]?.value);
  const bounceRatePrev30d = readMetricFloat(previous30dRow[3]?.value);

  // Parse traffic by channel
  const trafficByChannelMap: Record<string, GATrafficChannel> = {};
  const dailyTrendMap: Record<string, number> = {};

  (trafficAndTrend.rows || []).forEach((row: GAReportRow) => {
      const dimensionValues = row.dimensionValues ?? [];
      const metricValues = row.metricValues ?? [];
      const channel = dimensionValues[0]?.value || "Unknown";
      const date = dimensionValues[1]?.value || "";
      const sessions = readMetricInt(metricValues[0]?.value);
      const users = readMetricInt(metricValues[1]?.value);
      const pageviews = readMetricInt(metricValues[2]?.value);

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
    });

  const trafficByChannel: GATrafficChannel[] = Object.values(trafficByChannelMap);

  const dailyTrend = Object.entries(dailyTrendMap).map(([date, sessions]) => ({
    date: date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"),
    sessions,
  }));

  // Parse top pages
  const parseTopPage = (row: GAReportRow): GATopPage => {
    const dimensionValues = row.dimensionValues ?? [];
    const metricValues = row.metricValues ?? [];
    return {
      path: dimensionValues[0]?.value || "/",
      pageviews: readMetricInt(metricValues[0]?.value),
      avgDuration: readMetricFloat(metricValues[1]?.value),
      sessions: readMetricInt(metricValues[2]?.value),
      bounceRate: readMetricFloat(metricValues[3]?.value),
    };
  };

  const topPages: GATopPage[] = topPageRows.map(parseTopPage);
  const topPagesPrev30d: GATopPage[] = (topPagesPrevious.rows ?? []).map(parseTopPage);
  const kanbanBounceComparison = computeKanbanBounceComparison({
    siteBounceRate: bounceRate,
    topPages,
    topPagesPrev: topPagesPrev30d,
  });

  const truncatedResources = [
    ...(topPageResult.truncated ? ["topPages"] : []),
  ];
  const meta = makeMeta("live");
  meta.truncated = truncatedResources.length > 0;
  meta.truncatedResources = truncatedResources;

  return {
    sessions30d,
    sessionsPrev30d,
    users30d,
    usersPrev30d,
    pageviews30d,
    pageviewsPrev30d,
    bounceRate,
    bounceRatePrev30d,
    avgSessionDuration,
    trafficByChannel,
    topPages,
    topPagesPrev30d,
    kanbanBounceComparison,
    dailyTrend,
    _meta: meta,
  };
}

export async function fetchWebflowData(
  apiToken: string,
  siteId: string,
  from?: Date,
  to?: Date
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
  const readNumber = (value: unknown): number => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const normalized = value.trim().replace(/[$,%\s]/g, "");
      if (!normalized) return 0;
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };
  const pagedItems = async (path: string, keys: string[]): Promise<{ items: unknown[]; truncated: boolean }> => {
    const items: unknown[] = [];
    const limit = 100;
    let truncated = false;

    for (let page = 0; page < 100; page += 1) {
      const url = new URL(`${baseUrl}${path}`);
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("offset", String(page * limit));

      const response = await fetch(url.toString(), { headers, cache: "no-store" });
      if (!response.ok) {
        throw await errorFromResponse(response, `Webflow ${keys[0] ?? "list"} request failed`);
      }

      const payload = requireObject(await parseJson(response));
      const pageItems =
        keys.map((key) => asArray(payload[key])).find((candidate) => candidate.length > 0) ?? [];
      items.push(...pageItems);

      const pagination = requireObject(payload.pagination);
      const total = readNumber(pagination.total);
      const responseLimit = readNumber(pagination.limit) || limit;
      const offset = readNumber(pagination.offset);
      if (total > 0) {
        if (page === 99 && offset + responseLimit < total) {
          truncated = true;
          break;
        }
        if (offset + responseLimit >= total) break;
      } else if (pageItems.length < limit) {
        break;
      }
    }

    return { items, truncated };
  };

  const [siteRes, pageResult, collectionResult] = await Promise.all([
    fetch(`${baseUrl}/sites/${siteId}`, { headers, cache: "no-store" }),
    pagedItems(`/sites/${siteId}/pages`, ["items", "pages"]),
    pagedItems(`/sites/${siteId}/collections`, ["items", "collections"]),
  ]);
  const rawPages = pageResult.items;
  const rawCollections = collectionResult.items;

  if (!siteRes.ok) {
    throw await errorFromResponse(siteRes, "Webflow site request failed");
  }

  const siteResponse = requireObject(await parseJson(siteRes));

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

  // ── Parse page details ──
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const daysSince = (dateStr: string | null): number => {
    if (!dateStr) return Infinity;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return Infinity;
    return Math.floor((now - d.getTime()) / dayMs);
  };
  const strOrNull = (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;

  const pageDetails: WebflowPageDetail[] = rawPages.map((entry) => {
    const p = requireObject(entry);
    const seo = requireObject(p.seo);
    const og = requireObject(p.openGraph);
    return {
      id: String(p.id || p._id || ""),
      title: String(p.title || p.name || ""),
      slug: String(p.slug || ""),
      createdOn: strOrNull(p.createdOn),
      updatedOn: strOrNull(p.updatedOn || p.lastUpdated),
      draft: p.draft === true,
      archived: p.archived === true,
      seoTitle: strOrNull(seo.title || p.seoTitle),
      seoDescription: strOrNull(seo.description || p.seoDescription),
      openGraphImageUrl: strOrNull(og.imageUrl || og.image),
    };
  });

  // ── SEO audit ──
  const totalPageCount = pageDetails.length;
  const pagesWithSeoTitle = pageDetails.filter((p) => p.seoTitle !== null).length;
  const pagesWithSeoDescription = pageDetails.filter((p) => p.seoDescription !== null).length;
  const pagesWithOgImage = pageDetails.filter((p) => p.openGraphImageUrl !== null).length;
  const seoScore =
    totalPageCount > 0
      ? Math.round(
          40 * (pagesWithSeoTitle / totalPageCount) +
          40 * (pagesWithSeoDescription / totalPageCount) +
          20 * (pagesWithOgImage / totalPageCount)
        )
      : 0;
  const seoAudit: WebflowSeoAudit = {
    totalPages: totalPageCount,
    pagesWithSeoTitle,
    pagesWithSeoDescription,
    pagesWithOgImage,
    seoScore,
  };

  // ── Content freshness ──
  const contentFreshness: WebflowContentFreshness = {
    updatedLast7d: pageDetails.filter((p) => daysSince(p.updatedOn) <= 7).length,
    updatedLast30d: pageDetails.filter((p) => daysSince(p.updatedOn) <= 30).length,
    updatedLast90d: pageDetails.filter((p) => daysSince(p.updatedOn) <= 90).length,
    staleOver90d: pageDetails.filter((p) => daysSince(p.updatedOn) > 90).length,
  };

  // ── Recently updated pages (top 10) ──
  const recentlyUpdatedPages = [...pageDetails]
    .filter((p) => p.updatedOn !== null)
    .sort((a, b) => new Date(b.updatedOn!).getTime() - new Date(a.updatedOn!).getTime())
    .slice(0, 10);

  // ── Draft / published / archived counts ──
  const archivedPages = pageDetails.filter((p) => p.archived).length;
  const draftPages = pageDetails.filter((p) => p.draft && !p.archived).length;
  const publishedPages = totalPageCount - draftPages - archivedPages;

  // ── Parse collection details ──
  const collectionDetails: WebflowCollectionDetail[] = rawCollections.map((entry) => {
    const c = requireObject(entry);
    return {
      id: String(c.id || c._id || ""),
      displayName: String(c.displayName || c.name || c.slug || ""),
      slug: String(c.slug || ""),
      itemCount: readNumber(c.itemCount),
      createdOn: strOrNull(c.createdOn),
    };
  });
  const totalCmsItems = collectionDetails.reduce((sum, c) => sum + c.itemCount, 0);
  const emptyCollections = collectionDetails.filter((c) => c.itemCount === 0).length;

  // ── Form submissions + trend ──
  let formSubmissions: WebflowFormEntry[] = [];
  let formTrend: WebflowFormTrendEntry[] = [];
  let formSubmissionsTruncated = false;
  let formSubmissionsAvailable = true;
  let formSubmissionsError: string | null = null;
  try {
    const formSubmissionResult = await pagedItems(`/sites/${siteId}/form_submissions`, [
      "items",
      "formSubmissions",
    ]);
    const items = formSubmissionResult.items;
    formSubmissionsTruncated = formSubmissionResult.truncated;

    const formMap: Record<string, number> = {};
    const trendMap: Record<string, number> = {};
    items.forEach((submission) => {
      const row = requireObject(submission);

      // Filter by date if createdOn is available and bounds exist
      let createdDate: Date | null = null;
      if (row.createdOn) {
        const d = new Date(String(row.createdOn));
        if (!isNaN(d.getTime())) createdDate = d;
      }

      if (from && to && createdDate) {
        if (createdDate < from || createdDate > to) {
          return; // Skip submission outside range
        }
      }

      const formName = String(row.formName || row.formId || "Unknown");
      formMap[formName] = (formMap[formName] || 0) + 1;

      // Bucket by day for trend
      if (createdDate) {
        const dayKey = createdDate.toISOString().split("T")[0];
        trendMap[dayKey] = (trendMap[dayKey] || 0) + 1;
      }
    });
    formSubmissions = Object.entries(formMap).map(([formName, count]) => ({
      formName,
      count,
    }));
    formTrend = Object.entries(trendMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, submissions]) => ({ date, submissions }));
  } catch (error) {
    formSubmissions = [];
    formTrend = [];
    formSubmissionsAvailable = false;
    formSubmissionsError = error instanceof Error ? error.message : String(error);
  }

  const totalFormSubmissions = formSubmissions.reduce((sum, f) => sum + f.count, 0);
  const truncatedResources = [
    ...(pageResult.truncated ? ["pages"] : []),
    ...(collectionResult.truncated ? ["collections"] : []),
    ...(formSubmissionsTruncated ? ["formSubmissions"] : []),
  ];
  const meta = makeMeta("live");
  meta.truncated = truncatedResources.length > 0;
  meta.truncatedResources = truncatedResources;
  meta.diagnostics = {
    formSubmissionsAvailable,
    ...(formSubmissionsError ? { formSubmissionsError } : {}),
  };

  return {
    siteName,
    lastPublished,
    totalPages: totalPageCount,
    totalCollections: rawCollections.length,
    formSubmissions,
    customDomains,

    publishedPages,
    draftPages,
    archivedPages,
    pages: pageDetails,
    seoAudit,
    contentFreshness,
    recentlyUpdatedPages,

    collections: collectionDetails,
    totalCmsItems,
    emptyCollections,

    formTrend,
    totalFormSubmissions,

    _meta: meta,
  };
}
