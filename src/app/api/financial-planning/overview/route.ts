export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { AnalyticsSnapshotStatus } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildProfitAndLoss } from "@/lib/analytics/pnl-builder";
import { computeUnitEconomics } from "@/lib/analytics/unit-economics";
import type {
  HubSpotData,
  MercuryData,
  StripeData,
} from "@/lib/analytics/types";

async function loadLatestProviderPayload<T>(
  userId: string,
  providerKey: string,
): Promise<T | null> {
  const snapshot = await prisma.analyticsSnapshot.findFirst({
    where: {
      userId,
      providerKey,
      status: AnalyticsSnapshotStatus.SUCCESS,
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

    const [stripe, mercury, hubspot] = await Promise.all([
      loadLatestProviderPayload<StripeData>(userId, "stripe"),
      loadLatestProviderPayload<MercuryData>(userId, "mercury"),
      loadLatestProviderPayload<HubSpotData>(userId, "hubspot"),
    ]);

    const pnl = buildProfitAndLoss(stripe, mercury);
    const unitEconomics = computeUnitEconomics(stripe, mercury, hubspot);

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
