export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  type Prisma,
} from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { verifyAirtableConnection } from "@/lib/integrations/airtable";
import {
  ensureIntegrationOwnerOrganizationId,
  resolveIntegrationOwnerUserId,
} from "@/lib/integrations/ownership";
import { compactErrorMessage } from "@/lib/integrations/oauth";
import { protectIntegrationSecret } from "@/lib/integrations/token-crypto";
import { enforcePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/session-user";

interface ConnectAirtableBody {
  token?: string;
  baseId?: string;
  tableName?: string;
  writeEnabled?: boolean;
}

/**
 * Airtable writes stay OFF unless the caller explicitly opts in.
 * On update we preserve whatever was already stored when the field is omitted;
 * on create an omitted field means false. Never infer true.
 */
function resolveWriteEnabledForWrite(
  body: ConnectAirtableBody,
  existingMetadata: unknown
): boolean {
  if (typeof body.writeEnabled === "boolean") {
    return body.writeEnabled;
  }
  const existing =
    existingMetadata &&
    typeof existingMetadata === "object" &&
    !Array.isArray(existingMetadata)
      ? (existingMetadata as Record<string, unknown>).writeEnabled
      : undefined;
  return existing === true;
}

function asMetadataObject(metadata: unknown): Prisma.InputJsonObject {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  return metadata as Prisma.InputJsonObject;
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
      targetId: IntegrationProvider.AIRTABLE,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);
    const organizationId = sessionUser.organizationId ?? null;
    await ensureIntegrationOwnerOrganizationId(ownerUserId, organizationId);

    const body = (await request.json().catch(() => ({}))) as ConnectAirtableBody;
    const token = body.token?.trim() || process.env.AIRTABLE_API_TOKEN?.trim();
    const baseId = body.baseId?.trim() || process.env.AIRTABLE_BASE_ID?.trim();
    const tableName =
      body.tableName?.trim() || process.env.AIRTABLE_TABLE_NAME?.trim();

    const connection = await prisma.integrationConnection.findUnique({
      where: {
        userId_provider: {
          userId: ownerUserId,
          provider: IntegrationProvider.AIRTABLE,
        },
      },
      select: {
        metadata: true,
      },
    });

    if (!baseId || !tableName) {
      return NextResponse.json(
        {
          error:
            "Airtable Base ID and table name are required (or set AIRTABLE_BASE_ID and AIRTABLE_TABLE_NAME on the server)",
        },
        { status: 400 }
      );
    }

    if (!token) {
      if (!connection) {
        return NextResponse.json(
          {
            error:
              "Airtable API token is required (or set AIRTABLE_API_TOKEN on the server)",
          },
          { status: 400 }
        );
      }

      const writeEnabled = resolveWriteEnabledForWrite(body, connection.metadata);
      const metadata: Prisma.InputJsonObject = {
        ...asMetadataObject(connection.metadata),
        baseId,
        tableName,
        writeEnabled,
      };

      await prisma.integrationConnection.update({
        where: {
          userId_provider: {
            userId: ownerUserId,
            provider: IntegrationProvider.AIRTABLE,
          },
        },
        data: { metadata },
      });

      return NextResponse.json({ ok: true, baseId, tableName, writeEnabled });
    }

    const profile = await verifyAirtableConnection({ token, baseId, tableName });
    const writeEnabled = resolveWriteEnabledForWrite(body, connection?.metadata);
    const metadata: Prisma.InputJsonObject = {
      ...(profile.metadata ?? {}),
      ...asMetadataObject(connection?.metadata),
      authType: "api_token",
      connectedByUserId: session.user.id,
      baseId,
      tableName,
      writeEnabled,
    };

    await prisma.integrationConnection.upsert({
      where: {
        userId_provider: {
          userId: ownerUserId,
          provider: IntegrationProvider.AIRTABLE,
        },
      },
      create: {
        userId: ownerUserId,
        provider: IntegrationProvider.AIRTABLE,
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

    return NextResponse.json({ ok: true, baseId, tableName, writeEnabled });
  } catch (error) {
    console.error("POST /api/integrations/airtable/token error:", error);
    return NextResponse.json(
      { error: compactErrorMessage(error) },
      { status: 500 }
    );
  }
}
