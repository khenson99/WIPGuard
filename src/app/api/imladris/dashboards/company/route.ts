export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getImladrisApiContext } from "@/app/api/imladris/_context";
import { buildCompanyTrackerDashboard } from "@/lib/imladris/company-tracker";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest): Promise<NextResponse> {
  void request;

  const apiContext = await getImladrisApiContext();
  if (!apiContext.ok) return apiContext.response;

  const payload = await buildCompanyTrackerDashboard({
    prisma,
    context: apiContext.context,
  });

  return NextResponse.json({
    product: "Imladris",
    generatedAt: new Date().toISOString(),
    ...payload,
  });
}
