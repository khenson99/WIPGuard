export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildMonthlyPnLHistory } from "@/lib/analytics/monthly-pnl-history";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const monthsParam = request.nextUrl.searchParams.get("months");
    const monthsBack = monthsParam ? Math.min(Math.max(parseInt(monthsParam, 10) || 12, 1), 24) : null;
    const now = new Date();
    const options =
      monthsBack == null
        ? undefined
        : {
            startDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1)),
          };

    const history = await buildMonthlyPnLHistory(userId, options);

    return NextResponse.json(history, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("GET /api/financial-planning/monthly-history error:", error);
    return NextResponse.json(
      { error: "Failed to fetch monthly P&L history" },
      { status: 500 },
    );
  }
}
