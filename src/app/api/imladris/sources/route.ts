export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { buildImladrisSources } from "@/lib/imladris/service";
import { prisma } from "@/lib/prisma";
import { getImladrisApiContext } from "@/app/api/imladris/_context";

export async function GET(request: NextRequest): Promise<NextResponse> {
  void request;

  const apiContext = await getImladrisApiContext();
  if (!apiContext.ok) return apiContext.response;

  const sources = await buildImladrisSources({
    prisma,
    context: apiContext.context,
  });

  return NextResponse.json({
    product: "Imladris",
    generatedAt: new Date().toISOString(),
    sources,
  });
}
