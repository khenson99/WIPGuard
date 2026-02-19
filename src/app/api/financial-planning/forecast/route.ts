export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  buildForecastScenario,
  buildDefaultScenarios,
} from "@/lib/analytics/forecast-engine";
import type {
  StripeData,
  MercuryData,
  ForecastAssumptions,
} from "@/lib/analytics/types";

async function loadFinancialData(
  userId: string,
): Promise<{ stripe: StripeData | null; mercury: MercuryData | null }> {
  const snapshot = await prisma.analyticsSnapshot.findFirst({
    where: { userId },
    orderBy: { capturedAt: "desc" },
  });

  const dashboardData = snapshot?.data as Record<string, unknown> | null;
  const stripe = (dashboardData?.stripe as StripeData | null) ?? null;
  const mercury = (dashboardData?.mercury as MercuryData | null) ?? null;

  return { stripe, mercury };
}

export async function GET(
  _request: NextRequest,
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;

    const [{ stripe, mercury }, savedScenarios] = await Promise.all([
      loadFinancialData(userId),
      prisma.forecastScenario.findMany({ where: { userId } }),
    ]);

    const defaults = buildDefaultScenarios(stripe, mercury);

    const custom = savedScenarios.map((scenario) =>
      buildForecastScenario(
        stripe,
        mercury,
        scenario.assumptions as ForecastAssumptions,
        { id: scenario.id, name: scenario.name },
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
    const body = await request.json();

    if (!body.name || !body.assumptions) {
      return NextResponse.json(
        { error: "name and assumptions are required" },
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

    const { stripe, mercury } = await loadFinancialData(userId);

    const result = buildForecastScenario(
      stripe,
      mercury,
      scenario.assumptions as ForecastAssumptions,
      { id: scenario.id, name: scenario.name },
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
