export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  type Prisma,
} from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { compactErrorMessage, verifyPylonApiToken } from "@/lib/integrations/oauth";
import { protectIntegrationSecret, unprotectIntegrationSecret } from "@/lib/integrations/token-crypto";
import { enforcePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

interface ConnectPylonBody {
  token?: string;
  baseUrl?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function readBaseUrl(metadata: unknown): string | null {
  const record = asRecord(metadata);
  const candidate = record.baseUrl;
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
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
    const baseUrl = body.baseUrl?.trim() ? body.baseUrl.trim() : null;

    const existing = await prisma.integrationConnection.findUnique({
      where: {
        userId_provider: {
          userId: session.user.id,
          provider: IntegrationProvider.PYLON,
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
      body.token?.trim() || existingToken?.trim() || process.env.PYLON_API_KEY?.trim();
    if (!token || token.trim().length === 0) {
      return NextResponse.json(
        { error: "Pylon API token is required (or set PYLON_API_KEY on the server)" },
        { status: 400 }
      );
    }

    const preservedBaseUrl = baseUrl ?? readBaseUrl(existing?.metadata ?? null);
    const profile = await verifyPylonApiToken(token, {
      baseUrl: preservedBaseUrl ?? undefined,
    });
    const metadata: Prisma.InputJsonObject = {
      ...asRecord(existing?.metadata ?? null),
      ...asRecord(profile.metadata ?? null),
      authType: "api_token",
      connectedByUserId: session.user.id,
      ...(preservedBaseUrl ? { baseUrl: preservedBaseUrl } : {}),
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
