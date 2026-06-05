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
import { compactErrorMessage, verifyPostHogApiToken } from "@/lib/integrations/oauth";
import { protectIntegrationSecret, unprotectIntegrationSecret } from "@/lib/integrations/token-crypto";
import { enforcePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/session-user";

interface ConnectPostHogBody {
  token?: string;
  projectId?: string;
  host?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function metadataString(metadata: unknown, key: string): string | null {
  const value = asRecord(metadata)[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
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
      targetId: IntegrationProvider.POSTHOG,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);
    const organizationId = sessionUser.organizationId ?? null;
    await ensureIntegrationOwnerOrganizationId(ownerUserId, organizationId);

    const body = (await request.json().catch(() => ({}))) as ConnectPostHogBody;
    const existing = await prisma.integrationConnection.findUnique({
      where: {
        userId_provider: {
          userId: ownerUserId,
          provider: IntegrationProvider.POSTHOG,
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
      getIntegrationEnvValue("POSTHOG_API_KEY")?.trim();
    const projectId =
      body.projectId?.trim() ||
      metadataString(existing?.metadata ?? null, "projectId") ||
      metadataString(existing?.metadata ?? null, "defaultProjectId") ||
      process.env.POSTHOG_PROJECT_ID?.trim();
    const host =
      body.host?.trim() ||
      metadataString(existing?.metadata ?? null, "host") ||
      metadataString(existing?.metadata ?? null, "apiHost") ||
      process.env.POSTHOG_HOST?.trim() ||
      process.env.POSTHOG_API_HOST?.trim() ||
      "https://app.posthog.com";

    if (!token) {
      return NextResponse.json(
        { error: "PostHog API token is required (or set POSTHOG_API_KEY on the server)" },
        { status: 400 },
      );
    }
    if (!projectId) {
      return NextResponse.json(
        { error: "PostHog project ID is required (or set POSTHOG_PROJECT_ID on the server)" },
        { status: 400 },
      );
    }

    const profile = await verifyPostHogApiToken({ token, projectId, host });
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
          provider: IntegrationProvider.POSTHOG,
        },
      },
      create: {
        userId: ownerUserId,
        provider: IntegrationProvider.POSTHOG,
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

    return NextResponse.json({
      ok: true,
      projectId,
      host: metadataString(metadata, "host") ?? host,
    });
  } catch (error) {
    console.error("POST /api/integrations/posthog/token error:", error);
    return NextResponse.json(
      { error: compactErrorMessage(error) },
      { status: 500 },
    );
  }
}
