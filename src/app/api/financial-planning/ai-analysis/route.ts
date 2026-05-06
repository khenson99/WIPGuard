export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildMonthlyPnLHistory } from "@/lib/analytics/monthly-pnl-history";
import { generateExecutiveAnalysis } from "@/lib/analytics/executive-ai-analysis";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;

    // Build the monthly history, then generate AI analysis from it
    const history = await buildMonthlyPnLHistory(userId);

    if (history.months.length === 0) {
      return NextResponse.json(
        { error: "No monthly financial data available for analysis" },
        { status: 422 },
      );
    }

    const analysis = await generateExecutiveAnalysis(history);

    return NextResponse.json(analysis, {
      headers: {
        // Cache for 5 minutes — analysis is expensive
        "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("GET /api/financial-planning/ai-analysis error:", error);

    const message =
      error instanceof Error && error.message.includes("OPENAI_API_KEY")
        ? "AI analysis is not configured. Set OPENAI_API_KEY to enable."
        : "Failed to generate executive analysis";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
