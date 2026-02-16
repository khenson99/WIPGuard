export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { runAnalyticsRefresh } from "@/lib/analytics/refresh-runner";

function parseRangePresets(raw: string | null): Array<"7d" | "30d" | "90d"> {
  if (!raw) return ["30d"];
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is "7d" | "30d" | "90d" => value === "7d" || value === "30d" || value === "90d");

  return values.length > 0 ? values : ["30d"];
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.ANALYTICS_REFRESH_SECRET?.trim();
  if (!expected) return false;

  const header = request.headers.get("x-analytics-refresh-secret")?.trim();
  return Boolean(header && header === expected);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rangePresets = parseRangePresets(request.nextUrl.searchParams.get("ranges"));
    const result = await runAnalyticsRefresh({ rangePresets });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/analytics/refresh error:", error);
    return NextResponse.json({ error: "Failed to refresh analytics snapshots" }, { status: 500 });
  }
}
