export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getImladrisApiContext } from "@/app/api/imladris/_context";
import { runCompanyReadinessSetup } from "@/lib/imladris/company-readiness-setup";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest): Promise<NextResponse> {
  void request;

  const apiContext = await getImladrisApiContext();
  if (!apiContext.ok) return apiContext.response;

  const payload = await runCompanyReadinessSetup({
    prisma,
    context: apiContext.context,
  });

  return NextResponse.json({
    product: "Imladris",
    generatedAt: new Date().toISOString(),
    setup: payload.setup,
    ...payload.dashboard,
  });
}
