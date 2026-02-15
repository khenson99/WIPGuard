// ─── Analytics API Route ──────────────────────────────────
// GET /api/analytics — returns combined dashboard data
// Supports: on-page-load fetch, hourly revalidation, manual refresh

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCredentials } from "@/lib/analytics/credentials";
import { fetchHubSpotData, fetchStripeData, fetchMercuryData } from "@/lib/analytics/fetchers";
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
    lastFullRefresh: new Date().toISOString(),
    errors: [],
  };

  // Fetch all sources in parallel
  const [hubspotResult, stripeResult, mercuryResult] = await Promise.allSettled([
    creds.hubspotToken
      ? fetchHubSpotData(creds.hubspotToken)
      : Promise.reject(new Error("No HubSpot token configured")),
    creds.stripeKey
      ? fetchStripeData(creds.stripeKey)
      : Promise.reject(new Error("No Stripe key configured")),
    creds.mercuryKey
      ? fetchMercuryData(creds.mercuryKey)
      : Promise.reject(new Error("No Mercury key configured")),
  ]);

  if (hubspotResult.status === "fulfilled") {
    result.hubspot = hubspotResult.value;
  } else {
    result.errors.push({ source: "hubspot", message: hubspotResult.reason?.message || "Failed" });
  }

  if (stripeResult.status === "fulfilled") {
    result.stripe = stripeResult.value;
  } else {
    result.errors.push({ source: "stripe", message: stripeResult.reason?.message || "Failed" });
  }

  if (mercuryResult.status === "fulfilled") {
    result.mercury = mercuryResult.value;
  } else {
    result.errors.push({ source: "mercury", message: mercuryResult.reason?.message || "Failed" });
  }

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": forceRefresh
        ? "no-cache, no-store"
        : "public, s-maxage=3600, stale-while-revalidate=300",
    },
  });
}
