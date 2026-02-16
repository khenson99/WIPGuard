import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  computeFlowRiskIntelligence,
  type FlowRiskConfig,
} from "@/lib/flow/risk-intelligence";

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

function parseRiskConfig(params: URLSearchParams): Partial<FlowRiskConfig> {
  return {
    personWipLimit: parseIntegerParam(params, "personWipLimit", 1, 12),
    staleTaskDays: parseIntegerParam(params, "staleTaskDays", 1, 60),
    blockerLookbackDays: parseIntegerParam(params, "blockerLookbackDays", 7, 120),
    chronicBlockerThreshold: parseIntegerParam(params, "chronicBlockerThreshold", 2, 12),
    fixedDateLookaheadDays: parseIntegerParam(params, "fixedDateLookaheadDays", 1, 60),
    staleDependencyDays: parseIntegerParam(params, "staleDependencyDays", 1, 60),
    riskAlertMinScore: parseIntegerParam(params, "riskAlertMinScore", 10, 95),
    maxRecommendations: parseIntegerParam(params, "maxRecommendations", 3, 30),
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const config = parseRiskConfig(request.nextUrl.searchParams);
    const report = await computeFlowRiskIntelligence({ config });
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof BadRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("GET /api/flow/risk error:", error);
    return NextResponse.json(
      { error: "Failed to compute flow risk intelligence" },
      { status: 500 }
    );
  }
}
