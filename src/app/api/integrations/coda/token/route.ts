export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  type Prisma,
} from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { resolveCodaDocId } from "@/lib/integrations/coda-config";
import {
  ensureIntegrationOwnerOrganizationId,
  resolveIntegrationOwnerUserId,
} from "@/lib/integrations/ownership";
import { compactErrorMessage, verifyCodaApiToken } from "@/lib/integrations/oauth";
import { protectIntegrationSecret } from "@/lib/integrations/token-crypto";
import { enforcePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/session-user";

interface ConnectCodaBody {
  token?: string;
  docId?: string;
  docUrl?: string;
}

function asMetadataObject(metadata: unknown): Prisma.InputJsonObject {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  return metadata as Prisma.InputJsonObject;
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

function isMissingConnectionUpdateError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  if (code === "P2025") {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("record to update not found");
}

async function persistCodaDocMetadata(input: {
  ownerUserId: string;
  organizationId: string | null;
  metadata: Prisma.InputJsonObject;
}): Promise<void> {
  const { ownerUserId, organizationId, metadata } = input;

  try {
    await prisma.integrationConnection.update({
      where: {
        userId_provider: {
          userId: ownerUserId,
          provider: IntegrationProvider.CODA,
        },
      },
      data: { metadata },
    });
    return;
  } catch (error) {
    if (!isMissingConnectionUpdateError(error)) {
      throw error;
    }
  }

  await prisma.integrationConnection.upsert({
    where: {
      userId_provider: {
        userId: ownerUserId,
        provider: IntegrationProvider.CODA,
      },
    },
    create: {
      userId: ownerUserId,
      provider: IntegrationProvider.CODA,
      status: IntegrationConnectionStatus.ERROR,
      lastError: "Coda token is required to reconnect this doc sync.",
      metadata,
      organizationId,
    },
    update: {
      metadata,
    },
  });
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
      targetId: IntegrationProvider.CODA,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);
    const organizationId = sessionUser.organizationId ?? null;
    await ensureIntegrationOwnerOrganizationId(ownerUserId, organizationId);
    const body = (await request.json().catch(() => ({}))) as ConnectCodaBody;
    const connection = await prisma.integrationConnection.findUnique({
      where: {
        userId_provider: {
          userId: ownerUserId,
          provider: IntegrationProvider.CODA,
        },
      },
      select: {
        metadata: true,
      },
    });
    const token = body.token?.trim() || process.env.CODA_API_TOKEN?.trim();
    const hasDocInput = hasCodaDocInput(body);

    if (!token) {
      if (!hasDocInput || !connection) {
        return NextResponse.json(
          { error: "Coda API token is required (or set CODA_API_TOKEN on the server)" },
          { status: 400 }
        );
      }

      const docId = resolveCodaDocId({ docId: body.docId, docUrl: body.docUrl });
      const metadata: Prisma.InputJsonObject = {
        ...asMetadataObject(connection.metadata),
        docId,
      };

      await persistCodaDocMetadata({
        ownerUserId,
        organizationId,
        metadata,
      });

      return NextResponse.json({ ok: true, docId });
    }

    const profile = await verifyCodaApiToken(token);
    const docId =
      hasDocInput
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
          userId: ownerUserId,
          provider: IntegrationProvider.CODA,
        },
      },
      create: {
        userId: ownerUserId,
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
        organizationId,
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
        organizationId,
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
