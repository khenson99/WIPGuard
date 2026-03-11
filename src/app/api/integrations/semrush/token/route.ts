export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  type Prisma,
} from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { getIntegrationEnvValue } from "@/lib/integrations/env";
import {
  ensureIntegrationOwnerOrganizationId,
  resolveIntegrationOwnerUserId,
} from "@/lib/integrations/ownership";
import { compactErrorMessage } from "@/lib/integrations/oauth";
import { protectIntegrationSecret } from "@/lib/integrations/token-crypto";
import { enforcePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/session-user";

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

    const sessionUser = getAuthenticatedUser(session);
    if (!sessionUser) {
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

    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);
    const organizationId = sessionUser.organizationId ?? null;
    await ensureIntegrationOwnerOrganizationId(ownerUserId, organizationId);
    const body = (await request.json().catch(() => ({}))) as ConnectSemrushBody;
    const token = body.token?.trim() || getIntegrationEnvValue("SEMRUSH_API_TOKEN");
    const domain = body.domain?.trim() || process.env.SEMRUSH_DOMAIN?.trim();

    if (!token) {
      return NextResponse.json(
        {
          error:
            "SEMrush API Token is required (or set SEMRUSH_API_TOKEN on the server)",
        },
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
          userId: ownerUserId,
          provider: IntegrationProvider.SEMRUSH,
        },
      },
      create: {
        userId: ownerUserId,
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
        organizationId,
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
        organizationId,
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
