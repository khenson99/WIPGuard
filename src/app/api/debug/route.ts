import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Force wipe PYLON error
    await prisma.integrationConnection.updateMany({
      where: { provider: "PYLON" },
      data: { lastError: null },
    });

    const integrations = await prisma.integrationConnection.findMany({
      select: {
        provider: true,
        status: true,
        lastError: true
      },
      where: {
        OR: [
          { lastError: { not: null } },
          { status: { not: 'CONNECTED' } }
        ]
      }
    });

    const snapshots = await prisma.analyticsSnapshot.findMany({
      orderBy: { capturedAt: 'desc' },
      take: 20
    });

    return NextResponse.json({ integrations, snapshots });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
