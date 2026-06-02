import { createSign } from "crypto";
import { safeJson } from "@/lib/analytics/fetcher-utils";
import { type AnalyticsTimestamp } from "@/lib/analytics/types";

export interface GoogleSearchConsoleMetricRow {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GoogleSearchConsoleDailyRow extends GoogleSearchConsoleMetricRow {
  date: string;
}

export interface GoogleSearchConsoleQueryRow extends GoogleSearchConsoleMetricRow {
  query: string;
}

export interface GoogleSearchConsolePageRow extends GoogleSearchConsoleMetricRow {
  page: string;
}

export interface GoogleSearchConsoleDeviceRow extends GoogleSearchConsoleMetricRow {
  device: string;
}

export interface GoogleSearchConsoleCountryRow extends GoogleSearchConsoleMetricRow {
  country: string;
}

export interface GoogleSearchConsoleData extends GoogleSearchConsoleMetricRow {
  siteUrl: string;
  queryCount: number;
  pageCount: number;
  dailyTrend: GoogleSearchConsoleDailyRow[];
  topQueries: GoogleSearchConsoleQueryRow[];
  topPages: GoogleSearchConsolePageRow[];
  devices: GoogleSearchConsoleDeviceRow[];
  countries: GoogleSearchConsoleCountryRow[];
  _meta: AnalyticsTimestamp;
}

interface SearchConsoleApiRow {
  keys?: string[];
  clicks?: unknown;
  impressions?: unknown;
  ctr?: unknown;
  position?: unknown;
}

interface SearchConsoleApiResponse {
  rows?: SearchConsoleApiRow[];
}

type SearchConsoleQueryResult = {
  rows: SearchConsoleApiRow[];
  truncated: boolean;
};

function makeMeta(source: "live" | "cached" = "live"): AnalyticsTimestamp {
  const now = new Date();
  return {
    fetchedAt: now.toISOString(),
    nextRefresh: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    source,
  };
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function defaultFromDate(now = new Date()): Date {
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 29);
  from.setUTCHours(0, 0, 0, 0);
  return from;
}

function defaultToDate(now = new Date()): Date {
  const to = new Date(now);
  to.setUTCHours(23, 59, 59, 999);
  return to;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function getSearchConsoleAccessToken(input: {
  accessToken?: string | null;
  clientEmail?: string | null;
  privateKey?: string | null;
  refreshToken?: string | null;
  googleClientId?: string | null;
  googleClientSecret?: string | null;
}): Promise<string> {
  if (input.accessToken) {
    return input.accessToken;
  }

  if (input.refreshToken && input.googleClientId && input.googleClientSecret) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      cache: "no-store",
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: input.refreshToken,
        client_id: input.googleClientId,
        client_secret: input.googleClientSecret,
      }).toString(),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google Search Console OAuth refresh failed (${response.status}): ${body}`);
    }
    const parsed = await safeJson<{ access_token?: string }>(response, "search console oauth token");
    if (!parsed.access_token) {
      throw new Error("Google Search Console OAuth refresh did not return an access token");
    }
    return parsed.access_token;
  }

  if (input.clientEmail && input.privateKey) {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256" as const, typ: "JWT" as const };
    const payload = {
      iss: input.clientEmail,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    };
    const headerEncoded = encodeBase64Url(JSON.stringify(header));
    const payloadEncoded = encodeBase64Url(JSON.stringify(payload));
    const signatureInput = `${headerEncoded}.${payloadEncoded}`;
    const sign = createSign("RSA-SHA256");
    sign.update(signatureInput);
    const signature = sign.sign(input.privateKey)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      cache: "no-store",
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${signatureInput}.${signature}`,
      }).toString(),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google Search Console service account token exchange failed (${response.status}): ${body}`);
    }
    const parsed = await safeJson<{ access_token?: string }>(response, "search console service account token");
    if (!parsed.access_token) {
      throw new Error("Google Search Console service account exchange did not return an access token");
    }
    return parsed.access_token;
  }

  throw new Error(
    "Google Search Console authentication failed: provide an access token, OAuth refresh token, or service account credentials",
  );
}

function readFiniteMetric(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function metricRow(row: SearchConsoleApiRow): GoogleSearchConsoleMetricRow {
  return {
    clicks: readFiniteMetric(row.clicks),
    impressions: readFiniteMetric(row.impressions),
    ctr: readFiniteMetric(row.ctr),
    position: readFiniteMetric(row.position),
  };
}

function weightedPosition(rows: GoogleSearchConsoleMetricRow[]): number {
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  if (impressions <= 0) return 0;
  return rows.reduce((sum, row) => sum + row.position * row.impressions, 0) / impressions;
}

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return response.statusText || "request failed";
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string };
    return parsed.error?.message ?? parsed.message ?? text;
  } catch {
    return text;
  }
}

export async function fetchGoogleSearchConsoleData(input: {
  accessToken?: string | null;
  siteUrl: string;
  clientEmail?: string | null;
  privateKey?: string | null;
  refreshToken?: string | null;
  googleClientId?: string | null;
  googleClientSecret?: string | null;
  fromDate?: Date;
  toDate?: Date;
}): Promise<GoogleSearchConsoleData> {
  const accessToken = await getSearchConsoleAccessToken(input);
  const fromDate = input.fromDate ?? defaultFromDate();
  const toDate = input.toDate ?? defaultToDate();
  const startDate = dateKey(fromDate);
  const endDate = dateKey(toDate);
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(input.siteUrl)}/searchAnalytics/query`;

  const query = async (
    label: string,
    dimensions: string[],
    rowLimit: number,
  ): Promise<SearchConsoleQueryResult> => {
    const rows: SearchConsoleApiRow[] = [];
    const pageSize = Math.max(1, rowLimit);
    let truncated = false;

    for (let page = 0; page < 100; page += 1) {
      const startRow = page * pageSize;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions,
          rowLimit: pageSize,
          ...(startRow > 0 ? { startRow } : {}),
          dataState: "all",
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Google Search Console ${label} request failed (${response.status}): ${await readError(response)}`,
        );
      }
      const parsed = await safeJson<SearchConsoleApiResponse>(response, `search console ${label}`);
      const pageRows = Array.isArray(parsed.rows) ? parsed.rows : [];
      rows.push(...pageRows);
      if (page === 99 && pageRows.length >= pageSize) {
        truncated = true;
        break;
      }
      if (pageRows.length < pageSize) break;
    }

    return { rows, truncated };
  };

  const [dateResult, queryResult, pageResult, deviceResult, countryResult] = await Promise.all([
    query("date", ["date"], 25000),
    query("query", ["query"], 1000),
    query("page", ["page"], 1000),
    query("device", ["device"], 25),
    query("country", ["country"], 1000),
  ]);
  const dateRows = dateResult.rows;
  const queryRows = queryResult.rows;
  const pageRows = pageResult.rows;
  const deviceRows = deviceResult.rows;
  const countryRows = countryResult.rows;

  const dailyTrend = dateRows.map((row) => ({
    date: String(row.keys?.[0] ?? ""),
    ...metricRow(row),
  })).filter((row) => row.date);
  const topQueries = queryRows.map((row) => ({
    query: String(row.keys?.[0] ?? ""),
    ...metricRow(row),
  })).filter((row) => row.query);
  const topPages = pageRows.map((row) => ({
    page: String(row.keys?.[0] ?? ""),
    ...metricRow(row),
  })).filter((row) => row.page);
  const devices = deviceRows.map((row) => ({
    device: String(row.keys?.[0] ?? ""),
    ...metricRow(row),
  })).filter((row) => row.device);
  const countries = countryRows.map((row) => ({
    country: String(row.keys?.[0] ?? ""),
    ...metricRow(row),
  })).filter((row) => row.country);

  const clicks = dailyTrend.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = dailyTrend.reduce((sum, row) => sum + row.impressions, 0);
  const truncatedResources = [
    ...(dateResult.truncated ? ["dates"] : []),
    ...(queryResult.truncated ? ["queries"] : []),
    ...(pageResult.truncated ? ["pages"] : []),
    ...(deviceResult.truncated ? ["devices"] : []),
    ...(countryResult.truncated ? ["countries"] : []),
  ];
  const meta = makeMeta("live");
  meta.truncated = truncatedResources.length > 0;
  meta.truncatedResources = truncatedResources;

  return {
    siteUrl: input.siteUrl,
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: weightedPosition(dailyTrend),
    queryCount: topQueries.length,
    pageCount: topPages.length,
    dailyTrend,
    topQueries,
    topPages,
    devices,
    countries,
    _meta: meta,
  };
}
