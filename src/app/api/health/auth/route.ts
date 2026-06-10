export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/health/auth
 *
 * Sign-in readiness probe. The NextAuth `Callback` error on the login page
 * means the OAuth exchange with Google succeeded and the server failed while
 * persisting the sign-in — this endpoint checks every dependency of that step
 * so the cause is visible without shell access to the host.
 *
 * Intentionally unauthenticated (it exists for when sign-in is broken) and
 * intentionally coarse: booleans, counts, and Prisma error codes only — no
 * env values, hostnames, or migration names are echoed back.
 */

interface MigrationCountRow {
  applied: number;
  failed: number;
}

interface InsertPrivilegeRow {
  can_insert_user: boolean;
  can_insert_account: boolean;
}

function requestHost(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-host");
  const host = forwarded ?? request.headers.get("host");
  return host?.split(",")[0]?.trim().toLowerCase() || null;
}

function nextauthUrlHost(): string | null {
  const raw = process.env.NEXTAUTH_URL;
  if (!raw) return null;
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return null;
  }
}

function compactErrorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
    if (error instanceof Error && error.name !== "Error") return error.name;
  }
  return "UNKNOWN";
}

export async function GET(request: NextRequest) {
  const urlHost = nextauthUrlHost();
  const reqHost = requestHost(request);

  const checks: Record<string, unknown> = {
    googleProviderConfigured: Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
    ),
    nextauthSecretSet: Boolean(process.env.NEXTAUTH_SECRET),
    nextauthUrl: {
      set: Boolean(process.env.NEXTAUTH_URL),
      parseable: urlHost !== null || !process.env.NEXTAUTH_URL,
      matchesRequestHost: urlHost !== null && reqHost !== null ? urlHost === reqHost : null,
    },
  };

  const startedAt = Date.now();
  try {
    // Same client (pool, tenant extension) the NextAuth adapter uses.
    const [migrations] = await prisma.$queryRaw<MigrationCountRow[]>`
      SELECT
        COUNT(*) FILTER (WHERE finished_at IS NOT NULL)::int AS applied,
        COUNT(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int AS failed
      FROM _prisma_migrations
    `;
    const [privileges] = await prisma.$queryRaw<InsertPrivilegeRow[]>`
      SELECT
        has_table_privilege(current_user, '"User"', 'INSERT') AS can_insert_user,
        has_table_privilege(current_user, '"Account"', 'INSERT') AS can_insert_account
    `;
    const userCount = await prisma.user.count();

    checks.database = {
      reachable: true,
      latencyMs: Date.now() - startedAt,
      canInsertUser: privileges?.can_insert_user === true,
      canInsertAccount: privileges?.can_insert_account === true,
      userCount,
    };
    checks.migrations = {
      applied: migrations?.applied ?? 0,
      failed: migrations?.failed ?? 0,
    };
  } catch (error) {
    checks.database = {
      reachable: false,
      latencyMs: Date.now() - startedAt,
      errorCode: compactErrorCode(error),
    };
  }

  const database = checks.database as { reachable: boolean; canInsertUser?: boolean };
  const migrations = checks.migrations as { failed: number } | undefined;
  const healthy =
    checks.googleProviderConfigured === true &&
    checks.nextauthSecretSet === true &&
    database.reachable &&
    database.canInsertUser === true &&
    (migrations?.failed ?? 1) === 0;

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
