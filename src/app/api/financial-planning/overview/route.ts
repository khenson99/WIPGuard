export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { AnalyticsSnapshotStatus } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildProfitAndLoss } from "@/lib/analytics/pnl-builder";
import { computeUnitEconomics } from "@/lib/analytics/unit-economics";
import { normalizeMercuryDataPayload } from "@/lib/analytics/mercury-normalization";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import type {
  HubSpotData,
  MercuryData,
  StripeData,
} from "@/lib/analytics/types";

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

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = resolveIntegrationOwnerUserId((session.user as { id: string }).id);
    const now = new Date();

    const [stripe, mercury, hubspot] = await Promise.all([
      loadLatestProviderPayload<StripeData>(userId, "stripe", now),
      loadLatestProviderPayload<MercuryData>(userId, "mercury", now),
      loadLatestProviderPayload<HubSpotData>(userId, "hubspot", now),
    ]);
    const normalizedMercury = normalizeMercuryDataPayload(mercury);

    const timeRange =
      request.nextUrl.searchParams.get("timeRange") ?? "Last 30 days";

    const pnl = buildProfitAndLoss(stripe, normalizedMercury, { timeRange });
    const unitEconomics = computeUnitEconomics(stripe, normalizedMercury, hubspot, {
      observedPeriodDays: normalizedMercury?.cashFlow.observedPeriodDays ?? 30,
    });

    return NextResponse.json(
      { pnl, unitEconomics },
      {
        headers: {
          "Cache-Control":
            "private, max-age=30, stale-while-revalidate=120",
        },
      },
    );
  } catch (error) {
    console.error("GET /api/financial-planning/overview error:", error);
    return NextResponse.json(
      { error: "Failed to fetch financial overview" },
      { status: 500 },
    );
  }
}
