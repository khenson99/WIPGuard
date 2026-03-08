import { NextResponse } from "next/server";
import packageJson from "../../../../package.json";
import { prisma } from "@/lib/prisma";
import { poolMonitor } from "@/lib/pool-monitor";

const APP_VERSION = process.env.APP_VERSION?.trim() || packageJson.version;

/**
 * GET /api/health
 *
 * Health check endpoint that verifies database connectivity
 * and reports pool status.
 *
 * Returns:
 * - 200 if database is reachable and pool is healthy/warning
 * - 503 if database is unreachable or pool is critical
 *
 * @see Issue #378
 */
export async function GET() {
  const startTime = Date.now();

  try {
    // Quick connectivity check
    await prisma.$queryRaw`SELECT 1`;
    const queryTimeMs = Date.now() - startTime;

    // Record the wait time for monitoring
    poolMonitor.recordWaitTime(queryTimeMs);

    const { status: poolStatus, pool: poolMetrics } =
      poolMonitor.getHealthStatus();

    const isHealthy = poolStatus !== "critical";

    return NextResponse.json(
      {
        status: isHealthy ? "ok" : "degraded",
        version: APP_VERSION,
        timestamp: new Date().toISOString(),
        checks: {
          database: {
            status: "connected",
            responseTimeMs: queryTimeMs,
          },
          connectionPool: {
            status: poolStatus,
            active: poolMetrics.activeConnections,
            idle: poolMetrics.idleConnections,
            waiting: poolMetrics.waitingRequests,
            max: poolMetrics.maxPoolSize,
            errors: poolMetrics.totalConnectionErrors,
            exhaustionEvents: poolMetrics.totalPoolExhaustionEvents,
          },
        },
        uptime: poolMetrics.uptimeMs,
      },
      {
        status: isHealthy ? 200 : 503,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    const queryTimeMs = Date.now() - startTime;
    poolMonitor.recordWaitTime(queryTimeMs);

    console.error("[/api/health] Health check failed:", error);

    const poolHealth = poolMonitor.getHealthStatus();

    return NextResponse.json(
      {
        status: "error",
        version: APP_VERSION,
        timestamp: new Date().toISOString(),
        checks: {
          database: {
            status: "disconnected",
            responseTimeMs: queryTimeMs,
            error:
              error instanceof Error ? error.message : "Unknown error",
          },
          connectionPool: {
            status: poolHealth.status,
            active: poolHealth.pool.activeConnections,
            idle: poolHealth.pool.idleConnections,
            waiting: poolHealth.pool.waitingRequests,
            max: poolHealth.pool.maxPoolSize,
            errors: poolHealth.pool.totalConnectionErrors,
            exhaustionEvents: poolHealth.pool.totalPoolExhaustionEvents,
          },
        },
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }
}
