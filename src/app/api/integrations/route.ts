export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { IntegrationConnectionStatus } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getMissingIntegrationEnv,
  isIntegrationConfigured,
  listIntegrationDefinitions,
} from "@/lib/integrations/catalog";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connections = await prisma.integrationConnection.findMany({
      where: { userId: session.user.id },
      select: {
        provider: true,
        status: true,
        accountLabel: true,
        connectedAt: true,
        lastSyncedAt: true,
        lastError: true,
      },
    });

    const byProvider = new Map(
      connections.map((connection) => [connection.provider, connection])
    );

    const response = listIntegrationDefinitions().map((definition) => {
      const connection = byProvider.get(definition.provider);
      const status = connection?.status ?? IntegrationConnectionStatus.DISCONNECTED;
      return {
        slug: definition.slug,
        provider: definition.provider,
        name: definition.name,
        description: definition.description,
        capabilities: definition.capabilities,
        authType: definition.authType,
        configured: isIntegrationConfigured(definition),
        missingEnv: getMissingIntegrationEnv(definition),
        connected: status === IntegrationConnectionStatus.CONNECTED,
        status,
        accountLabel: connection?.accountLabel ?? null,
        connectedAt: connection?.connectedAt ?? null,
        lastSyncedAt: connection?.lastSyncedAt ?? null,
        lastError: connection?.lastError ?? null,
      };
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("GET /api/integrations error:", error);
    return NextResponse.json(
      { error: "Failed to fetch integrations" },
      { status: 500 }
    );
  }
}

