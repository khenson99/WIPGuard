export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOutboxOperationalMetrics } from "@/lib/outbox-worker";
import { evaluateObservabilitySlos } from "@/lib/observability/slo";

const RUNBOOKS = [
  {
    id: "sync-lag",
    title: "Integration Sync Lag",
    description:
      "Use when provider syncs fall behind freshness SLOs or integration status enters ERROR.",
    path: "docs/runbooks/sync-lag.md",
  },
  {
    id: "queue-backup",
    title: "Queue Backup",
    description:
      "Use when outbox lag grows, retries increase, or dead-letter events exceed budget.",
    path: "docs/runbooks/queue-backup.md",
  },
  {
    id: "websocket-degradation",
    title: "WebSocket Degradation",
    description:
      "Use when realtime board updates are delayed or not delivered to connected clients.",
    path: "docs/runbooks/websocket-degradation.md",
  },
] as const;

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [outboxMetrics, connections, rules] = await Promise.all([
      getOutboxOperationalMetrics(prisma),
      prisma.integrationConnection.findMany({
        select: {
          provider: true,
          status: true,
          lastSyncedAt: true,
          lastError: true,
        },
      }),
      prisma.integrationRule.findMany({
        where: {
          enabled: true,
        },
        select: {
          provider: true,
          enabled: true,
          lastRunAt: true,
          lastError: true,
        },
      }),
    ]);

    const generatedAt = new Date();
    const report = evaluateObservabilitySlos({
      outboxMetrics,
      connections: connections.map((connection) => ({
        provider: connection.provider,
        status: connection.status,
        lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
        lastError: connection.lastError,
      })),
      rules: rules.map((rule) => ({
        provider: rule.provider,
        enabled: rule.enabled,
        lastRunAt: rule.lastRunAt?.toISOString() ?? null,
        lastError: rule.lastError,
      })),
      now: generatedAt,
    });

    const suggestedRunbookIds = Array.from(
      new Set(
        report.slos
          .filter((slo) => slo.breached)
          .flatMap((slo) => slo.runbookIds)
      )
    );

    return NextResponse.json({
      generatedAt: generatedAt.toISOString(),
      report,
      outboxMetrics,
      runbooks: RUNBOOKS,
      suggestedRunbookIds,
    });
  } catch (error) {
    console.error("GET /api/ops/observability error:", error);
    return NextResponse.json(
      { error: "Failed to fetch observability report" },
      { status: 500 }
    );
  }
}
