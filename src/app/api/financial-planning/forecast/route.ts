export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { AnalyticsSnapshotStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import { normalizeMercuryDataPayload } from "@/lib/analytics/mercury-normalization";
import {
  buildForecastScenario,
  buildDefaultScenarios,
} from "@/lib/analytics/forecast-engine";
import type {
  StripeData,
  MercuryData,
  HubSpotData,
  ForecastAssumptions,
} from "@/lib/analytics/types";

const DEFAULT_FORECAST_ASSUMPTIONS: ForecastAssumptions = {
  revenueGrowthRate: 0,
  churnRateDelta: 0,
  burnRateDelta: 0,
  additionalMonthlyExpense: 0,
  additionalMonthlyRevenue: 0,
};

function isForecastAssumptions(value: unknown): value is ForecastAssumptions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<ForecastAssumptions>;
  return (
    typeof candidate.revenueGrowthRate === "number" &&
    typeof candidate.churnRateDelta === "number" &&
    typeof candidate.burnRateDelta === "number" &&
    typeof candidate.additionalMonthlyExpense === "number" &&
    typeof candidate.additionalMonthlyRevenue === "number"
  );
}

function toForecastAssumptions(value: unknown): ForecastAssumptions {
  return isForecastAssumptions(value) ? value : DEFAULT_FORECAST_ASSUMPTIONS;
}

async function loadFinancialData(
  userId: string,
): Promise<{ stripe: StripeData | null; mercury: MercuryData | null; hubspot: HubSpotData | null }> {
  const now = new Date();
  const [stripe, mercury, hubspot] = await Promise.all([
    loadLatestProviderPayload<StripeData>(userId, "stripe", now),
    loadLatestProviderPayload<MercuryData>(userId, "mercury", now),
    loadLatestProviderPayload<HubSpotData>(userId, "hubspot", now),
  ]);

  return { stripe, mercury: normalizeMercuryDataPayload(mercury), hubspot };
}

async function loadLatestProviderPayload<T>(
  userId: string,
  providerKey: string,
  now: Date,
): Promise<T | null> {
  const snapshot = await prisma.analyticsSnapshot.findFirst({
    where: {
      userId,
      providerKey,
      status: AnalyticsSnapshotStatus.SUCCESS,
      capturedAt: { lte: now },
    },
    orderBy: { capturedAt: "desc" },
    select: { payload: true },
  });

  return (snapshot?.payload as T | null) ?? null;
}

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const integrationOwnerUserId = resolveIntegrationOwnerUserId(userId);

    const [{ stripe, mercury, hubspot }, savedScenarios] = await Promise.all([
      loadFinancialData(integrationOwnerUserId),
      prisma.forecastScenario.findMany({ where: { userId } }),
    ]);

    const defaults = buildDefaultScenarios(stripe, mercury, 18, hubspot);

    const custom = savedScenarios.map((scenario) =>
      buildForecastScenario(
        stripe,
        mercury,
        toForecastAssumptions(scenario.assumptions),
        { id: scenario.id, name: scenario.name, hubspot },
      ),
    );

    return NextResponse.json({ defaults, custom });
  } catch (error) {
    console.error("GET /api/financial-planning/forecast error:", error);
    return NextResponse.json(
      { error: "Failed to compute forecasts" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const integrationOwnerUserId = resolveIntegrationOwnerUserId(userId);
    const body = await request.json();

    if (!body.name || !body.assumptions) {
      return NextResponse.json(
        { error: "name and assumptions are required" },
        { status: 400 },
      );
    }
    if (!isForecastAssumptions(body.assumptions)) {
      return NextResponse.json(
        { error: "assumptions must contain numeric forecast fields" },
        { status: 400 },
      );
    }

    const scenario = await prisma.forecastScenario.create({
      data: {
        userId,
        name: body.name,
        assumptions: body.assumptions,
      },
    });

    const { stripe, mercury, hubspot } = await loadFinancialData(integrationOwnerUserId);

    const result = buildForecastScenario(
      stripe,
      mercury,
      toForecastAssumptions(scenario.assumptions),
      { id: scenario.id, name: scenario.name, hubspot },
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("POST /api/financial-planning/forecast error:", error);
    return NextResponse.json(
      { error: "Failed to save forecast scenario" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const scenarioId = request.nextUrl.searchParams.get("scenarioId");

    if (!scenarioId) {
      return NextResponse.json(
        { error: "scenarioId query parameter is required" },
        { status: 400 },
      );
    }

    const existing = await prisma.forecastScenario.findUnique({
      where: { id: scenarioId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Scenario not found" },
        { status: 404 },
      );
    }

    if (existing.userId !== userId) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 },
      );
    }

    await prisma.forecastScenario.delete({ where: { id: scenarioId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/financial-planning/forecast error:", error);
    return NextResponse.json(
      { error: "Failed to delete forecast scenario" },
      { status: 500 },
    );
  }
}
