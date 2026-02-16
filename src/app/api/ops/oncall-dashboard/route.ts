export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOutboxOperationalMetrics } from "@/lib/outbox-worker";
import { evaluateObservabilitySlos } from "@/lib/observability/slo";
import {
  detectBreaches,
  DEFAULT_BREACH_CONFIG,
  type BreachRecord,
} from "@/lib/observability/breach-detector";
import { getSuggestedRunbooks } from "@/lib/observability/runbooks";
import {
  assembleOnCallDashboard,
  type SystemComponentHealth,
} from "@/lib/observability/oncall-dashboard";
import type { StructuredLogEntry, MetricPoint, TraceSpan } from "@/lib/observability/structured-logger";

/**
 * In-memory breach history for detection continuity across requests.
 * In production this would be persisted, but for the on-call dashboard
 * an in-memory sliding window is sufficient.
 */
let breachHistory: BreachRecord[] = [];
let lastCheckAt: Date | null = null;

/**
 * In-memory ring buffers for recent instrumentation data.
 * These accumulate from domain event instrumentation calls.
 */
const recentLogs: StructuredLogEntry[] = [];
const recentMetrics: MetricPoint[] = [];
const recentTraces: TraceSpan[] = [];

/**
 * GET /api/ops/oncall-dashboard
 *
 * Returns the complete on-call dashboard view including:
 * - SLO report with breach detection
 * - System component health
 * - Recent logs, metrics, traces
 * - Suggested runbooks
 * - On-call summary
 */
export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();

    // Collect real-time data
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
        where: { enabled: true },
        select: {
          provider: true,
          key: true,
          enabled: true,
          lastRunAt: true,
          lastError: true,
        },
      }),
    ]);

    // Evaluate SLOs
    const sloReport = evaluateObservabilitySlos({
      outboxMetrics,
      connections: connections.map((c) => ({
        provider: c.provider,
        status: c.status,
        lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
        lastError: c.lastError,
      })),
      rules: rules.map((r) => ({
        provider: r.provider,
        key: r.key,
        enabled: r.enabled,
        lastRunAt: r.lastRunAt?.toISOString() ?? null,
        lastError: r.lastError,
      })),
      now,
    });

    // Detect breaches with history
    const breachDetection = detectBreaches(
      sloReport,
      breachHistory,
      now,
      DEFAULT_BREACH_CONFIG
    );

    // Update in-memory state
    breachHistory = breachDetection.breachWindow.records;
    lastCheckAt = now;

    // Get suggested runbooks based on active breaches
    const breachedSloKeys = breachDetection.activeBreaches.map((b) => b.sloKey);
    const suggestedRunbooks = getSuggestedRunbooks(breachedSloKeys);

    // System health (simplified -- based on SLO state)
    const systemHealth: SystemComponentHealth[] = [
      {
        component: "outbox-worker",
        status:
          sloReport.slos.find((s) => s.key === "outbox_delivery_lag")?.breached
            ? "degraded"
            : "healthy",
        lastCheckedAt: now.toISOString(),
        details: `Lag: ${outboxMetrics.lag.oldestRetryableEventAgeSeconds ?? 0}s, Pending: ${outboxMetrics.counts.pending}`,
      },
      {
        component: "integration-sync",
        status:
          sloReport.slos.find((s) => s.key === "integration_connection_health")?.breached
            ? "degraded"
            : "healthy",
        lastCheckedAt: now.toISOString(),
        details: `${sloReport.integrationHealth.connectedConnections}/${sloReport.integrationHealth.totalConnections} connected, ${sloReport.integrationHealth.errorConnections} errors`,
      },
      {
        component: "websocket",
        status:
          sloReport.slos.find((s) => s.key === "websocket_delivery_proxy")?.breached
            ? "degraded"
            : "healthy",
        lastCheckedAt: now.toISOString(),
        details: "Proxied via outbox delivery health",
      },
    ];

    // Assemble the dashboard
    const dashboard = assembleOnCallDashboard({
      sloReport,
      breachDetection,
      recentLogs: [...recentLogs],
      recentMetrics: [...recentMetrics],
      recentTraces: [...recentTraces],
      suggestedRunbooks,
      runbookExecutions: [],
      systemHealth,
      lastCheckAt,
      now,
    });

    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("GET /api/ops/oncall-dashboard error:", error);
    return NextResponse.json(
      { error: "Failed to assemble on-call dashboard" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ops/oncall-dashboard/runbooks
 * (handled by separate route file if needed, but embedded here for simplicity)
 */

// Export ring buffer push functions for use by instrumentation callers
export function pushLog(entry: StructuredLogEntry): void {
  recentLogs.unshift(entry);
  if (recentLogs.length > 200) recentLogs.length = 200;
}

export function pushMetric(point: MetricPoint): void {
  recentMetrics.unshift(point);
  if (recentMetrics.length > 500) recentMetrics.length = 500;
}

export function pushTrace(span: TraceSpan): void {
  recentTraces.unshift(span);
  if (recentTraces.length > 100) recentTraces.length = 100;
}
