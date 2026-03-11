export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseAnalyticsTimeRange } from "@/lib/analytics/time-range";
import { getAuthenticatedUser } from "@/lib/session-user";
import {
  listVisitorFunnelRecords,
  parseVisitorFunnelFilters,
} from "@/lib/analytics/visitor-funnel";
import {
  VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON,
  getVisitorFunnelPrisma,
} from "@/lib/analytics/visitor-funnel-availability";

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const range = parseAnalyticsTimeRange(request.nextUrl.searchParams);
    const from = new Date(`${range.from}T00:00:00.000Z`);
    const to = new Date(`${range.to}T23:59:59.999Z`);
    const page = parsePositiveInt(request.nextUrl.searchParams.get("page"), 1, 10_000);
    const pageSize = parsePositiveInt(request.nextUrl.searchParams.get("pageSize"), 25, 100);
    const funnelPrisma = getVisitorFunnelPrisma(prisma);

    if (!funnelPrisma) {
      return NextResponse.json(
        {
          records: [],
          pagination: {
            page,
            pageSize,
            total: 0,
            totalPages: 1,
          },
          disabled: true,
          reason: VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON,
        },
        { status: 202 },
      );
    }

    const result = await listVisitorFunnelRecords(funnelPrisma, {
      from,
      to,
      filters: parseVisitorFunnelFilters(request.nextUrl.searchParams),
      page,
      pageSize,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/analytics/visitor-funnel/records error:", error);
    return NextResponse.json(
      { error: "Failed to load visitor funnel records" },
      { status: 500 },
    );
  }
}
