import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { IntegrationProvider } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Force wipe PYLON error
    await prisma.integrationConnection.updateMany({
      where: { provider: IntegrationProvider.PYLON },
      data: { lastError: null },
    });

    // Pylon Network Test
    const pylonUrl = "https://api.usepylon.com/issues?limit=1&start_time=2026-01-25T00:00:00.000Z&end_time=2026-02-23T23:59:59.999Z";
    let pylonResult = "no key";
    if (process.env.PYLON_API_KEY) {
      const pylonResponse = await fetch(pylonUrl, {
        headers: {
          Authorization: `Bearer ${process.env.PYLON_API_KEY}`,
          Accept: "application/json"
        }
      });
      pylonResult = `Status: ${pylonResponse.status}, Body: ${await pylonResponse.text()}`;
    }

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

    return NextResponse.json({ pylonResult, integrations, snapshots });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
