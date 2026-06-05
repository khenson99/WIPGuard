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
import { compactErrorMessage, verifyLinearApiToken } from "@/lib/integrations/oauth";
import { protectIntegrationSecret, unprotectIntegrationSecret } from "@/lib/integrations/token-crypto";
import { enforcePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/session-user";

interface ConnectLinearBody {
  token?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
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
      targetId: IntegrationProvider.LINEAR,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);
    const organizationId = sessionUser.organizationId ?? null;
    await ensureIntegrationOwnerOrganizationId(ownerUserId, organizationId);

    const body = (await request.json().catch(() => ({}))) as ConnectLinearBody;
    const existing = await prisma.integrationConnection.findUnique({
      where: {
        userId_provider: {
          userId: ownerUserId,
          provider: IntegrationProvider.LINEAR,
        },
      },
      select: {
        accessToken: true,
        metadata: true,
      },
    });

    const existingToken = existing?.accessToken
      ? unprotectIntegrationSecret(existing.accessToken)
      : null;
    const token =
      body.token?.trim() ||
      existingToken?.trim() ||
      getIntegrationEnvValue("LINEAR_API_KEY")?.trim();

    if (!token) {
      return NextResponse.json(
        { error: "Linear API token is required (or set LINEAR_API_KEY on the server)" },
        { status: 400 },
      );
    }

    const profile = await verifyLinearApiToken(token);
    const metadata: Prisma.InputJsonObject = {
      ...asRecord(existing?.metadata ?? null),
      ...asRecord(profile.metadata ?? null),
      authType: "api_token",
      connectedByUserId: session.user.id,
    };

    await prisma.integrationConnection.upsert({
      where: {
        userId_provider: {
          userId: ownerUserId,
          provider: IntegrationProvider.LINEAR,
        },
      },
      create: {
        userId: ownerUserId,
        provider: IntegrationProvider.LINEAR,
        status: IntegrationConnectionStatus.CONNECTED,
        providerAccountId: profile.providerAccountId,
        accountLabel: profile.accountLabel,
        accessToken: protectIntegrationSecret(token),
        refreshToken: null,
        tokenType: "LinearApiKey",
        connectedAt: new Date(),
        lastSyncedAt: new Date(),
        lastError: null,
        metadata,
        organizationId,
      },
      update: {
        status: IntegrationConnectionStatus.CONNECTED,
        providerAccountId: profile.providerAccountId,
        accountLabel: profile.accountLabel,
        accessToken: protectIntegrationSecret(token),
        refreshToken: null,
        tokenType: "LinearApiKey",
        connectedAt: new Date(),
        lastSyncedAt: new Date(),
        lastError: null,
        metadata,
        organizationId,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/integrations/linear/token error:", error);
    return NextResponse.json(
      { error: compactErrorMessage(error) },
      { status: 500 },
    );
  }
}
