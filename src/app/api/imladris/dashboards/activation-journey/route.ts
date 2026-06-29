export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getImladrisApiContext } from "@/app/api/imladris/_context";
import { buildActivationJourneyDashboard } from "@/lib/imladris/activation-journey";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const apiContext = await getImladrisApiContext();
  if (!apiContext.ok) return apiContext.response;

  const sp = request.nextUrl.searchParams;
  const daysParam = Number(sp.get("days"));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : undefined;
  const all = sp.get("all") === "1" || sp.get("range") === "all";

  // Custom window: ?from=YYYY-MM-DD&to=YYYY-MM-DD (to is inclusive of the whole day).
  const fromRaw = sp.get("from");
  const toRaw = sp.get("to");
  const fromDate = fromRaw ? new Date(fromRaw) : null;
  const from = fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined;
  let to: Date | undefined;
  if (toRaw) {
    const toDate = new Date(toRaw);
    if (!Number.isNaN(toDate.getTime())) {
      toDate.setUTCHours(23, 59, 59, 999);
      to = toDate;
    }
  }

  const dashboard = await buildActivationJourneyDashboard({
    prisma,
    context: apiContext.context,
    days,
    from,
    to,
    all,
  });

  return NextResponse.json({
    product: "Imladris",
    generatedAt: new Date().toISOString(),
    ...dashboard,
  });
}
