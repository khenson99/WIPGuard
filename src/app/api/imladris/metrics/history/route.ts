export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { buildImladrisMetricHistory } from "@/lib/imladris/history";
import { prisma } from "@/lib/prisma";
import { getImladrisApiContext } from "@/app/api/imladris/_context";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const apiContext = await getImladrisApiContext();
  if (!apiContext.ok) return apiContext.response;

  const monthsParam = Number(request.nextUrl.searchParams.get("months"));
  const months = Number.isFinite(monthsParam) && monthsParam > 0 ? monthsParam : 13;

  const history = await buildImladrisMetricHistory({
    prisma,
    context: apiContext.context,
    months,
  });

  return NextResponse.json({
    product: "Imladris",
    generatedAt: new Date().toISOString(),
    ...history,
  });
}
