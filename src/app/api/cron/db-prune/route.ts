export const dynamic = "force-dynamic";

import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runDbPrune } from "@/lib/db-pruning/prune";
import { resolveDbPrunePolicy } from "@/lib/db-pruning/policy";

/**
 * POST /api/cron/db-prune
 *
 * Scheduled database retention job — deletes rows outside the retention
 * policy in short batched transactions. Triggered daily by the
 * railway/cron-db-prune service (same curl-image pattern as
 * railway/cron-sync). See docs/runbooks/db-pruning.md.
 *
 * Auth matches /api/cron/sync: `x-cron-secret` (or
 * `x-integration-sync-secret`) against CRON_SYNC_SECRET /
 * INTEGRATION_SYNC_SECRET.
 *
 * Modes:
 *   - default: queued in the background, responds 202 immediately
 *   - `?wait=1`: runs inline and returns the full result
 *   - `?dryRun=1` or body `{ "dryRun": true }`: counts prunable rows
 *     without deleting; DB_PRUNE_FORCE_DRY_RUN=true forces this for
 *     every run (kill switch / rollout aid)
 */

function isAuthorized(request: NextRequest): boolean {
  const expected =
    process.env.CRON_SYNC_SECRET?.trim() || process.env.INTEGRATION_SYNC_SECRET?.trim();
  if (!expected) return false;
  const provided =
    request.headers.get("x-cron-secret")?.trim() ||
    request.headers.get("x-integration-sync-secret")?.trim() ||
    "";
  return Boolean(provided && provided === expected);
}

function isTruthyFlag(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function shouldWaitForCompletion(request: NextRequest): boolean {
  return isTruthyFlag(new URL(request.url).searchParams.get("wait"));
}

async function requestedDryRun(request: NextRequest): Promise<boolean> {
  if (isTruthyFlag(new URL(request.url).searchParams.get("dryRun"))) {
    return true;
  }
  try {
    const body = (await request.json()) as { dryRun?: unknown } | null;
    return body?.dryRun === true || isTruthyFlag(typeof body?.dryRun === "string" ? body.dryRun : null);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const policy = resolveDbPrunePolicy();
  const dryRun = policy.forceDryRun || (await requestedDryRun(request));

  if (shouldWaitForCompletion(request)) {
    try {
      const result = await runDbPrune({ prisma, dryRun, policy });
      return NextResponse.json(result, { status: result.ok ? 200 : 500 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Database prune failed";
      console.error("POST /api/cron/db-prune error:", error);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  after(async () => {
    try {
      const result = await runDbPrune({ prisma, dryRun, policy });
      if (!result.ok) {
        console.error("POST /api/cron/db-prune background degraded:", JSON.stringify(result));
      }
    } catch (error) {
      console.error("POST /api/cron/db-prune background error:", error);
    }
  });

  return NextResponse.json(
    {
      ok: true,
      queued: true,
      mode: "background",
      dryRun,
      startedAt,
    },
    { status: 202 },
  );
}
