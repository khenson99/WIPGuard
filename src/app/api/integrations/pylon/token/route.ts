export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  type Prisma,
} from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { compactErrorMessage, verifyPylonApiToken } from "@/lib/integrations/oauth";
import { protectIntegrationSecret } from "@/lib/integrations/token-crypto";
import { enforcePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

interface ConnectPylonBody {
  token?: string;
  baseUrl?: string;
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
      targetId: IntegrationProvider.PYLON,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const body = (await request.json().catch(() => ({}))) as ConnectPylonBody;
    const token = body.token?.trim() || process.env.PYLON_API_KEY?.trim();
    if (!token) {
      return NextResponse.json(
        { error: "Pylon API token is required (or set PYLON_API_KEY on the server)" },
        { status: 400 }
      );
    }

    const profile = await verifyPylonApiToken(token, { baseUrl: body.baseUrl });
    const metadata: Prisma.InputJsonObject = {
      ...(profile.metadata ?? {}),
      authType: "api_token",
      connectedByUserId: session.user.id,
      ...(body.baseUrl?.trim() ? { baseUrl: body.baseUrl.trim() } : {}),
    };

    await prisma.integrationConnection.upsert({
      where: {
        userId_provider: {
          userId: session.user.id,
          provider: IntegrationProvider.PYLON,
        },
      },
      create: {
        userId: session.user.id,
        provider: IntegrationProvider.PYLON,
        status: IntegrationConnectionStatus.CONNECTED,
        providerAccountId: profile.providerAccountId,
        accountLabel: profile.accountLabel,
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
        providerAccountId: profile.providerAccountId,
        accountLabel: profile.accountLabel,
        accessToken: protectIntegrationSecret(token),
        refreshToken: null,
        tokenType: "Bearer",
        connectedAt: new Date(),
        lastSyncedAt: new Date(),
        lastError: null,
        metadata,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/integrations/pylon/token error:", error);
    return NextResponse.json(
      { error: compactErrorMessage(error) },
      { status: 500 }
    );
  }
}
