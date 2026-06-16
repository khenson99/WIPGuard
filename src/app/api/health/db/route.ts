export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/health/db
 *
 * Database size readiness probe. The 2026-06-10 outage was the Postgres
 * volume filling up (WAL recovery crash-loop on "No space left on device"),
 * which took down everything DB-backed including sign-in — so, like
 * /api/health/auth, this endpoint is intentionally unauthenticated and
 * intentionally coarse: byte counts, table names, and booleans only — no
 * env values, hostnames, or row contents.
 *
 * Returns `status: "degraded"` (HTTP 503) once the monitored size crosses
 * DB_HEALTH_SIZE_DEGRADED_GB (default 15 — i.e. 75% of the 20GB volume).
 *
 * WAL caveat: the 2026-06-10 disk fill was driven by WAL during recovery,
 * and pg_database_size() counts relations only — not WAL, temp files, or
 * replication-slot retention. When the DB role can read pg_ls_waldir()
 * (pg_monitor), WAL bytes ARE included in the monitored total and the
 * threshold; otherwise `walReadable` is false and WAL is invisible here.
 * Treat Railway's volume-usage metric as the PRIMARY disk alarm and this
 * endpoint as the structural/secondary signal.
 */

const DEFAULT_DEGRADED_GB = 15;
const TOP_TABLE_LIMIT = 10;
const BYTES_PER_GB = 1024 ** 3;

interface DatabaseSizeRow {
  total_bytes: number;
}

interface WalSizeRow {
  wal_bytes: number;
}

interface TableSizeRow {
  table_name: string;
  total_bytes: number;
  table_bytes: number;
  index_bytes: number;
  approx_rows: number;
}

function degradedThresholdBytes(): number {
  const raw = process.env.DB_HEALTH_SIZE_DEGRADED_GB?.trim();
  const parsed = raw ? Number(raw) : NaN;
  const gb = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DEGRADED_GB;
  return Math.round(gb * BYTES_PER_GB);
}

function compactErrorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
    if (error instanceof Error && error.name !== "Error") return error.name;
  }
  return "UNKNOWN";
}

export async function GET() {
  const thresholdBytes = degradedThresholdBytes();
  const checks: Record<string, unknown> = {};
  const startedAt = Date.now();

  try {
    const [size] = await prisma.$queryRaw<DatabaseSizeRow[]>`
      SELECT pg_database_size(current_database())::float8 AS total_bytes
    `;
    const tables = await prisma.$queryRaw<TableSizeRow[]>`
      SELECT
        c.relname AS table_name,
        pg_total_relation_size(c.oid)::float8 AS total_bytes,
        pg_table_size(c.oid)::float8 AS table_bytes,
        pg_indexes_size(c.oid)::float8 AS index_bytes,
        GREATEST(c.reltuples, 0)::float8 AS approx_rows
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
      LIMIT ${TOP_TABLE_LIMIT}
    `;

    // WAL is read separately and tolerantly: pg_ls_waldir() needs the
    // pg_monitor role, which the app's DB user may not have. A failure here
    // must not fail the whole probe — we just report walReadable: false.
    let walBytes: number | null = null;
    try {
      const [wal] = await prisma.$queryRaw<WalSizeRow[]>`
        SELECT COALESCE(SUM(size), 0)::float8 AS wal_bytes FROM pg_ls_waldir()
      `;
      walBytes = Math.round(wal?.wal_bytes ?? 0);
    } catch {
      walBytes = null;
    }

    const databaseBytes = Math.round(size?.total_bytes ?? 0);
    // Monitor relations + WAL (when visible) against the threshold — WAL is
    // exactly what filled the disk during the outage.
    const monitoredBytes = databaseBytes + (walBytes ?? 0);
    checks.database = {
      reachable: true,
      latencyMs: Date.now() - startedAt,
      databaseBytes,
      walBytes,
      walReadable: walBytes !== null,
      monitoredBytes,
      degradedThresholdBytes: thresholdBytes,
      overThreshold: monitoredBytes >= thresholdBytes,
    };
    checks.topTables = tables.map((table) => ({
      table: table.table_name,
      totalBytes: Math.round(table.total_bytes),
      // Heap + TOAST: the actual row data, including JSON payloads (which
      // live in TOAST and dominate ImladrisRawSourceRecord).
      tableBytes: Math.round(table.table_bytes),
      indexBytes: Math.round(table.index_bytes),
      approxRows: Math.round(table.approx_rows),
    }));
  } catch (error) {
    checks.database = {
      reachable: false,
      latencyMs: Date.now() - startedAt,
      errorCode: compactErrorCode(error),
    };
  }

  const database = checks.database as { reachable: boolean; overThreshold?: boolean };
  const healthy = database.reachable && database.overThreshold === false;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
