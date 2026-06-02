export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCredentials, hasIntegrationCredential } from "@/lib/analytics/credentials";
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

function asPositiveNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function formatRuleFailureDetails(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.map((entry) => {
    const record = entry && typeof entry === "object"
      ? (entry as Record<string, unknown>)
      : {};
    const ruleKey =
      typeof record.ruleKey === "string" && record.ruleKey.trim()
        ? record.ruleKey
        : "unknown_rule";
    const error =
      typeof record.error === "string" && record.error.trim()
        ? record.error
        : "failed without error detail";
    return `${ruleKey}: ${error}`;
  });
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
    const credentials = await getCredentials(ownerUserId);
    const hasCredential = hasIntegrationCredential(definition.provider, credentials);

    // Verify the provider is connected
    const connection = await prisma.integrationConnection.findUnique({
      where: {
        userId_provider: { userId: ownerUserId, provider: definition.provider },
      },
      select: { status: true },
    });

    if ((!connection || connection.status === "DISCONNECTED") && !hasCredential) {
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

    // Trigger sync through the existing orchestrator. It bootstraps missing
    // provider metric rules and respects circuit breaker state internally.
    const result = await runRules({
      mode: "incremental",
      providers: [definition.provider],
      userIds: [ownerUserId],
      dryRun: false,
      startedAt: new Date().toISOString(),
    });
    const failedRules = asPositiveNumber(result.failedRules);
    const failedUserRuns = asPositiveNumber(result.failedUserRuns);
    const failures = [
      ...formatRuleFailureDetails(result.failedRuleErrors),
      ...(failedUserRuns > 0 ? [`${failedUserRuns} user run failed`] : []),
    ];
    const degraded = failedRules > 0 || failedUserRuns > 0;

    return NextResponse.json({
      ok: !degraded,
      degraded,
      provider: definition.provider,
      executedRules: result.executedRules,
      failedRules,
      failedUserRuns,
      failures,
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
