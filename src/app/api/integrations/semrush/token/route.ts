export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  type Prisma,
} from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { compactErrorMessage } from "@/lib/integrations/oauth";
import { protectIntegrationSecret } from "@/lib/integrations/token-crypto";
import { enforcePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

interface ConnectSemrushBody {
  token?: string;
  domain?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "profile.write",
      request,
      targetType: "integration",
      targetId: IntegrationProvider.SEMRUSH,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const body = (await request.json().catch(() => ({}))) as ConnectSemrushBody;
    const token = body.token?.trim() || process.env.SEMRUSH_API_KEY?.trim();
    const domain = body.domain?.trim() || process.env.SEMRUSH_DOMAIN?.trim();

    if (!token) {
      return NextResponse.json(
        { error: "SEMrush API Token is required (or set SEMRUSH_API_KEY on the server)" },
        { status: 400 }
      );
    }

    if (!domain) {
      return NextResponse.json(
        { error: "SEMrush Target Domain is required (or set SEMRUSH_DOMAIN on the server)" },
        { status: 400 }
      );
    }

    const metadata: Prisma.InputJsonObject = {
      authType: "api_token",
      connectedByUserId: session.user.id,
      domain,
    };

    await prisma.integrationConnection.upsert({
      where: {
        userId_provider: {
          userId: session.user.id,
          provider: IntegrationProvider.SEMRUSH,
        },
      },
      create: {
        userId: session.user.id,
        provider: IntegrationProvider.SEMRUSH,
        status: IntegrationConnectionStatus.CONNECTED,
        providerAccountId: domain,
        accountLabel: domain,
        accessToken: protectIntegrationSecret(token),
        refreshToken: null,
        tokenType: "Bearer",
        connectedAt: new Date(),
        lastSyncedAt: new Date(),
        lastError: null,
        metadata,
      },
      update: {
        status: IntegrationConnectionStatus.CONNECTED,
        providerAccountId: domain,
        accountLabel: domain,
        accessToken: protectIntegrationSecret(token),
        refreshToken: null,
        tokenType: "Bearer",
        connectedAt: new Date(),
        lastSyncedAt: new Date(),
        lastError: null,
        metadata,
      },
    });

    return NextResponse.json({ ok: true, domain });
  } catch (error) {
    console.error("POST /api/integrations/semrush/token error:", error);
    return NextResponse.json(
      { error: compactErrorMessage(error) },
      { status: 500 }
    );
  }
}
