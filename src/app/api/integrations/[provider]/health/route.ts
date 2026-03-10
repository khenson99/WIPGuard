export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationConnectionStatus } from "@/generated/prisma/client";
import {
  defaultFreshnessSnapshot,
  getCredentials,
  hasIntegrationCredential,
} from "@/lib/analytics/credentials";
import { auth } from "@/lib/auth";
import { enforcePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getIntegrationBySlug } from "@/lib/integrations/catalog";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import { getCircuitSnapshot } from "@/lib/integrations/circuit-breaker";
import {
  assembleProviderHealth,
  type ConnectionHealth,
  type RuleHealth,
} from "@/lib/integrations/provider-health";

interface RouteParams {
  params: Promise<{ provider: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteParams,
): Promise<NextResponse> {
  try {
    const { provider: slug } = await context.params;
    const definition = getIntegrationBySlug(slug);
    if (!definition) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "integration.read",
      request,
      targetType: "integration",
      targetId: definition.provider,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);
    const credentials = await getCredentials(ownerUserId);
    const freshness =
      credentials.freshness[definition.provider] ??
      defaultFreshnessSnapshot(definition.provider);
    const hasCredential = hasIntegrationCredential(definition.provider, credentials);

    const [connectionRow, ruleRows, circuit] = await Promise.all([
      prisma.integrationConnection.findUnique({
        where: {
          userId_provider: { userId: ownerUserId, provider: definition.provider },
        },
        select: {
          provider: true,
          status: true,
          lastSyncedAt: true,
          lastError: true,
          connectedAt: true,
        },
      }),
      prisma.integrationRule.findMany({
        where: { userId: ownerUserId, provider: definition.provider },
        select: {
          key: true,
          enabled: true,
          lastRunAt: true,
          lastError: true,
          lastObservedAt: true,
        },
        orderBy: { updatedAt: "desc" },
      }),
      getCircuitSnapshot(definition.provider, ownerUserId),
    ]);

    const connection: ConnectionHealth = connectionRow
      ? {
          provider: connectionRow.provider,
          status: connectionRow.status,
          lastSyncedAt: connectionRow.lastSyncedAt,
          lastError: connectionRow.lastError,
          connectedAt: connectionRow.connectedAt,
        }
      : hasCredential
        ? {
            provider: definition.provider,
            status: IntegrationConnectionStatus.CONNECTED,
            lastSyncedAt: freshness.lastSyncedAt ? new Date(freshness.lastSyncedAt) : null,
            lastError: freshness.lastError,
            connectedAt: freshness.connectedAt ? new Date(freshness.connectedAt) : null,
          }
      : {
          provider: definition.provider,
          status: IntegrationConnectionStatus.DISCONNECTED,
          lastSyncedAt: null,
          lastError: null,
          connectedAt: null,
        };

    const rules: RuleHealth[] = ruleRows.map((r) => ({
      key: r.key,
      enabled: r.enabled,
      lastRunAt: r.lastRunAt,
      lastError: r.lastError,
      lastObservedAt: r.lastObservedAt,
    }));

    const health = assembleProviderHealth({ connection, rules, circuit });

    return NextResponse.json(health);
  } catch (error) {
    console.error("GET /api/integrations/[provider]/health error:", error);
    return NextResponse.json(
      { error: "Failed to fetch provider health" },
      { status: 500 },
    );
  }
}
