import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  computeDecisionDashboard,
  type DecisionDashboardConfig,
} from "@/lib/analytics/decision-dashboard";

export const dynamic = "force-dynamic";

class BadRequestError extends Error {}

function parseIntegerParam(
  params: URLSearchParams,
  key: string,
  min: number,
  max: number
): number | undefined {
  const value = params.get(key);
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new BadRequestError(`${key} must be an integer`);
  }
  if (parsed < min || parsed > max) {
    throw new BadRequestError(`${key} must be between ${min} and ${max}`);
  }
  return parsed;
}

function parseConfig(params: URLSearchParams): Partial<DecisionDashboardConfig> {
  return {
    lookbackDays: parseIntegerParam(params, "lookbackDays", 7, 120),
    monthlyWindowMonths: parseIntegerParam(params, "monthlyWindowMonths", 3, 12),
    staleTaskDays: parseIntegerParam(params, "staleTaskDays", 1, 45),
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const config = parseConfig(request.nextUrl.searchParams);
    const report = await computeDecisionDashboard({ config });
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof BadRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("GET /api/analytics/decision-dashboard error:", error);
    return NextResponse.json(
      { error: "Failed to load decision dashboard report" },
      { status: 500 }
    );
  }
}
