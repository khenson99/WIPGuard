export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { buildImladrisDashboard } from "@/lib/imladris/service";
import { prisma } from "@/lib/prisma";
import { getImladrisApiContext } from "@/app/api/imladris/_context";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ department: string }> },
): Promise<NextResponse> {
  const apiContext = await getImladrisApiContext();
  if (!apiContext.ok) return apiContext.response;

  const { department } = await params;
  const payload = await buildImladrisDashboard({
    prisma,
    context: apiContext.context,
    dashboardId: department,
  });
  if (!payload) {
    return NextResponse.json({ error: "Unknown Imladris dashboard" }, { status: 404 });
  }

  return NextResponse.json({
    product: "Imladris",
    generatedAt: new Date().toISOString(),
    ...payload,
  });
}
