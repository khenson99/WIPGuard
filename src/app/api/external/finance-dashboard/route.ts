export const dynamic = "force-dynamic";

import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { fetchMercuryData } from "@/lib/analytics/fetchers";

const DEFAULT_ALLOWED_ORIGIN = "https://vigilant-invention-j1n5g1p.pages.github.io";
const RANGE_DAYS = {
  "30d": 30,
  "90d": 90,
  "180d": 180,
} as const;

type RangePreset = keyof typeof RANGE_DAYS;

function allowedOrigins(): string[] {
  return (process.env.FINANCE_DASHBOARD_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGIN)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function resolveAllowedOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin")?.trim();
  if (!origin) return null;
  return allowedOrigins().includes(origin) ? origin : null;
}

function corsHeaders(request: NextRequest): HeadersInit {
  const origin = resolveAllowedOrigin(request);
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, x-finance-dashboard-token",
    Vary: "Origin",
  };
}

function jsonResponse(
  request: NextRequest,
  body: Record<string, unknown>,
  init: ResponseInit,
): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...corsHeaders(request),
      "Cache-Control": "no-cache, no-store",
      ...(init.headers ?? {}),
    },
  });
}

function timingSafeTokenEquals(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function readToken(request: NextRequest): string {
  const dashboardToken = request.headers.get("x-finance-dashboard-token")?.trim();
  if (dashboardToken) return dashboardToken;

  const authHeader = request.headers.get("authorization")?.trim();
  const [scheme, token] = authHeader?.split(/\s+/, 2) ?? [];
  return scheme?.toLowerCase() === "bearer" && token ? token.trim() : "";
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.FINANCE_DASHBOARD_EXPORT_TOKEN?.trim();
  if (!expected) return false;
  const provided = readToken(request);
  return Boolean(provided && timingSafeTokenEquals(provided, expected));
}

function parseRange(request: NextRequest): RangePreset {
  const requested = request.nextUrl.searchParams.get("range")?.trim();
  return requested === "30d" || requested === "90d" || requested === "180d" ? requested : "180d";
}

function dateRangeForPreset(preset: RangePreset, now = new Date()): { fromDate: Date; toDate: Date } {
  const toDate = new Date(now);
  toDate.setUTCHours(23, 59, 59, 999);
  const fromDate = new Date(toDate.getTime() - (RANGE_DAYS[preset] - 1) * 24 * 60 * 60 * 1000);
  fromDate.setUTCHours(0, 0, 0, 0);
  return { fromDate, toDate };
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return jsonResponse(request, { error: "Unauthorized" }, { status: 401 });
  }

  const mercuryToken = process.env.MERCURY_API_TOKEN?.trim();
  if (!mercuryToken) {
    return jsonResponse(request, { error: "Mercury data source is not configured" }, { status: 503 });
  }

  try {
    const range = parseRange(request);
    const { fromDate, toDate } = dateRangeForPreset(range);
    const mercury = await fetchMercuryData(mercuryToken, { fromDate, toDate });
    const servedAt = new Date().toISOString();

    return jsonResponse(
      request,
      {
        mercury,
        meta: {
          servedAt,
          range,
          from: fromDate.toISOString().slice(0, 10),
          to: toDate.toISOString().slice(0, 10),
          source: "wipguard-finance-dashboard-export",
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/external/finance-dashboard error:", error);
    return jsonResponse(request, { error: "Failed to load fresh finance data" }, { status: 500 });
  }
}
