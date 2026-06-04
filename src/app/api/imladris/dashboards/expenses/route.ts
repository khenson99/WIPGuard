export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildExpenseDashboard, type ExpenseDashboardRange } from "@/lib/imladris/expense-dashboard";
import { prisma } from "@/lib/prisma";

function parseRange(request: NextRequest): ExpenseDashboardRange {
  const requested = request.nextUrl.searchParams.get("range")?.trim();
  return requested === "30d" || requested === "90d" || requested === "180d" ? requested : "180d";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; organizationId?: string | null } | undefined;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await buildExpenseDashboard({
      prisma,
      context: {
        userId: user.id,
        organizationId: user.organizationId ?? null,
      },
      range: parseRange(request),
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    console.error("GET /api/imladris/dashboards/expenses error:", error);
    return NextResponse.json(
      { error: "Failed to load expense dashboard" },
      { status: 500 },
    );
  }
}
