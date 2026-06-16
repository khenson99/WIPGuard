import { NextResponse } from "next/server";
import packageJson from "../../../../package.json";
import { prisma } from "@/lib/prisma";
import { poolMonitor } from "@/lib/pool-monitor";

const APP_VERSION = process.env.APP_VERSION?.trim() || packageJson.version;

/** Railway Postgres volume capacity. Override via DATABASE_VOLUME_CAPACITY_MB. */
const DEFAULT_VOLUME_CAPACITY_MB = 20_000;
const DEFAULT_DISK_WARN_PERCENT = 75;
const DEFAULT_DISK_CRITICAL_PERCENT = 90;

function parsePositiveNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
}

interface StorageCheck {
  status: "ok" | "warning" | "critical" | "unknown";
  databaseSizeMb: number | null;
  volumeCapacityMb: number;
  usagePercent: number | null;
  warnPercent: number;
  criticalPercent: number;
  error?: string;
}

/**
 * Database disk-usage check.
 *
 * The June 2026 incident (Postgres volume silently filled to 93%) went
 * unnoticed because nothing reported storage. This check compares
 * pg_database_size() against the configured volume capacity and emits a
 * structured `[health:storage]` log line at warning/critical levels so
 * Railway log-based alerts (and anything polling /api/health) can fire
 * long before writes start failing.
 *
 * NOTE: pg_database_size() measures the database only; WAL, temp files and
 * other databases on the volume add roughly 5-10% on top. Thresholds are
 * chosen with that headroom in mind.
 */
async function checkStorage(): Promise<StorageCheck> {
  const volumeCapacityMb = parsePositiveNumberEnv(
    "DATABASE_VOLUME_CAPACITY_MB",
    DEFAULT_VOLUME_CAPACITY_MB,
  );
  const warnPercent = parsePositiveNumberEnv(
    "DATABASE_DISK_WARN_PERCENT",
    DEFAULT_DISK_WARN_PERCENT,
  );
  const criticalPercent = parsePositiveNumberEnv(
    "DATABASE_DISK_CRITICAL_PERCENT",
    DEFAULT_DISK_CRITICAL_PERCENT,
  );

  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ size: unknown }>>(
      "SELECT pg_database_size(current_database())::bigint AS size",
    );
    const raw = Array.isArray(rows) && rows.length > 0 ? rows[0].size : null;
    const sizeBytes = typeof raw === "bigint" ? Number(raw) : Number(raw);
    if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
      return {
        status: "unknown",
        databaseSizeMb: null,
        volumeCapacityMb,
        usagePercent: null,
        warnPercent,
        criticalPercent,
        error: "pg_database_size returned a non-numeric value",
      };
    }

    const databaseSizeMb = Math.round(sizeBytes / 1_000_000);
    const usagePercent =
      Math.round((databaseSizeMb / volumeCapacityMb) * 1000) / 10;
    const status: StorageCheck["status"] =
      usagePercent >= criticalPercent
        ? "critical"
        : usagePercent >= warnPercent
          ? "warning"
          : "ok";

    const check: StorageCheck = {
      status,
      databaseSizeMb,
      volumeCapacityMb,
      usagePercent,
      warnPercent,
      criticalPercent,
    };

    if (status !== "ok") {
      // Structured, grep-able line for Railway log alerting.
      console.error("[health:storage]", JSON.stringify(check));
    }

    return check;
  } catch (error) {
    return {
      status: "unknown",
      databaseSizeMb: null,
      volumeCapacityMb,
      usagePercent: null,
      warnPercent,
      criticalPercent,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * GET /api/health
 *
 * Dependency health endpoint that verifies database connectivity and
 * reports pool + storage status.
 *
 * Returns:
 * - 200 if database is reachable and pool/storage are healthy or warning
 * - 503 if database is unreachable, pool is critical, or disk usage has
 *   crossed the critical threshold
 *
 * @see Issue #378; docs/runbooks/postgres-disk-incident-2026-06.md
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
    const storage = await checkStorage();

    const isHealthy = poolStatus !== "critical" && storage.status !== "critical";

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
          storage,
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
