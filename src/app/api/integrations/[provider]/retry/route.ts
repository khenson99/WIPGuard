export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforcePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getIntegrationBySlug } from "@/lib/integrations/catalog";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import { getCircuitSnapshot } from "@/lib/integrations/circuit-breaker";
import { runRules } from "@/lib/integrations/orchestrator";

interface RouteParams {
  params: Promise<{ provider: string }>;
}

export async function POST(
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
      action: "integration.manage",
      request,
      targetType: "integration",
      targetId: definition.provider,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);

    // Verify the provider is connected
    const connection = await prisma.integrationConnection.findUnique({
      where: {
        userId_provider: { userId: ownerUserId, provider: definition.provider },
      },
      select: { status: true },
    });

    if (!connection || connection.status === "DISCONNECTED") {
      return NextResponse.json(
        { error: "Integration is not connected" },
        { status: 409 },
      );
    }

    // Check circuit breaker — reject if still in cooldown
    const circuit = await getCircuitSnapshot(definition.provider, ownerUserId);
    if (circuit.state === "OPEN" && circuit.nextRetryAt) {
      return NextResponse.json(
        {
          error: "Circuit breaker is open — retry not allowed yet",
          nextRetryAt: circuit.nextRetryAt.toISOString(),
          backoff: {
            circuitState: circuit.state,
            consecutiveFailures: circuit.consecutiveFailures,
            currentCooldownMs: circuit.currentCooldownMs,
            openCount: circuit.openCount,
          },
        },
        { status: 429 },
      );
    }

    // Verify there are enabled rules to run
    const enabledRuleCount = await prisma.integrationRule.count({
      where: {
        userId: ownerUserId,
        provider: definition.provider,
        enabled: true,
      },
    });

    if (enabledRuleCount === 0) {
      return NextResponse.json(
        { error: "No enabled sync rules for this provider" },
        { status: 409 },
      );
    }

    // Trigger sync through the existing orchestrator (respects circuit breaker internally)
    const result = await runRules({
      mode: "incremental",
      providers: [definition.provider],
      userIds: [ownerUserId],
      dryRun: false,
      startedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      provider: definition.provider,
      executedRules: result.executedRules,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
    });
  } catch (error) {
    console.error("POST /api/integrations/[provider]/retry error:", error);
    return NextResponse.json(
      { error: "Failed to trigger retry" },
      { status: 500 },
    );
  }
}
