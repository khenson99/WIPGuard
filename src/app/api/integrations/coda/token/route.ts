export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  type Prisma,
} from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { resolveCodaDocId } from "@/lib/integrations/coda-config";
import { compactErrorMessage, verifyCodaApiToken } from "@/lib/integrations/oauth";
import { protectIntegrationSecret } from "@/lib/integrations/token-crypto";
import { enforcePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

interface ConnectCodaBody {
  token?: string;
  docId?: string;
  docUrl?: string;
}

function readPersistedDocId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const candidate = (metadata as Record<string, unknown>).docId;
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function hasCodaDocInput(body: ConnectCodaBody): boolean {
  return Boolean(body.docId?.trim() || body.docUrl?.trim());
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
      targetId: IntegrationProvider.CODA,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const body = (await request.json().catch(() => ({}))) as ConnectCodaBody;
    const token = body.token?.trim() || process.env.CODA_API_TOKEN?.trim();
    if (!token) {
      return NextResponse.json(
        { error: "Coda API token is required (or set CODA_API_TOKEN on the server)" },
        { status: 400 }
      );
    }

    const profile = await verifyCodaApiToken(token);
    const connection = await prisma.integrationConnection.findUnique({
      where: {
        userId_provider: {
          userId: session.user.id,
          provider: IntegrationProvider.CODA,
        },
      },
      select: {
        metadata: true,
      },
    });
    const docId =
      hasCodaDocInput(body)
        ? resolveCodaDocId({ docId: body.docId, docUrl: body.docUrl })
        : readPersistedDocId(connection?.metadata);
    const metadata: Prisma.InputJsonObject = {
      ...(profile.metadata ?? {}),
      authType: "api_token",
      connectedByUserId: session.user.id,
      docId,
    };

    await prisma.integrationConnection.upsert({
      where: {
        userId_provider: {
          userId: session.user.id,
          provider: IntegrationProvider.CODA,
        },
      },
      create: {
        userId: session.user.id,
        provider: IntegrationProvider.CODA,
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

    return NextResponse.json({ ok: true, docId });
  } catch (error) {
    console.error("POST /api/integrations/coda/token error:", error);
    return NextResponse.json(
      { error: compactErrorMessage(error) },
      { status: 500 }
    );
  }
}
