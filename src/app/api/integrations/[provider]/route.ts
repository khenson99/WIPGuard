export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationConnectionStatus } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { getIntegrationBySlug } from "@/lib/integrations/catalog";
import { enforcePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ provider: string }>;
}

export async function DELETE(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse> {
  try {
    const { provider } = await context.params;
    const definition = getIntegrationBySlug(provider);
    if (!definition) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "profile.write",
      request,
      targetType: "integration",
      targetId: definition.provider,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    await prisma.integrationConnection.updateMany({
      where: {
        userId: session.user.id,
        provider: definition.provider,
      },
      data: {
        status: IntegrationConnectionStatus.DISCONNECTED,
        accessToken: null,
        refreshToken: null,
        tokenType: null,
        expiresAt: null,
        lastSyncedAt: null,
        lastError: null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/integrations/[provider] error:", error);
    return NextResponse.json(
      { error: "Failed to disconnect integration" },
      { status: 500 }
    );
  }
}

