import { NextResponse } from "next/server";
import { poolMonitor } from "@/lib/pool-monitor";

/**
 * GET /api/metrics
 *
 * Returns database connection pool metrics for monitoring.
 * Useful for dashboards, alerting systems, and debugging.
 *
 * @see Issue #378
 */
export async function GET() {
  try {
    const metrics = poolMonitor.getMetrics();
    const healthStatus = poolMonitor.getHealthStatus();

    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        database: {
          pool: {
            ...metrics,
            status: healthStatus.status,
            utilizationPercent:
              metrics.maxPoolSize > 0
                ? Math.round(
                    (metrics.activeConnections / metrics.maxPoolSize) * 100
                  )
                : 0,
          },
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("[/api/metrics] Error fetching metrics:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch metrics",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
