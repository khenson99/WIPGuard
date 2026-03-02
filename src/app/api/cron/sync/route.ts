export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { runAnalyticsRefresh } from "@/lib/analytics/refresh-runner";
import { pruneAnalyticsSnapshots } from "@/lib/analytics/snapshots";
import { runRules } from "@/lib/integrations/orchestrator";
import {
  bestEffortMigrateConnectionsToOwner,
  bestEffortMigrateRulesToOwner,
} from "@/lib/integrations/ownership";
import { runIntegrationHealthChecks } from "@/lib/integrations/health-checks";

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SYNC_SECRET?.trim() || process.env.INTEGRATION_SYNC_SECRET?.trim();
  if (!expected) return false;
  const provided =
    request.headers.get("x-cron-secret")?.trim() ||
    request.headers.get("x-integration-sync-secret")?.trim() ||
    "";
  return Boolean(provided && provided === expected);
}

function parseRetentionDays(): number {
  const raw = process.env.ANALYTICS_SNAPSHOT_RETENTION_DAYS?.trim();
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return 30;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const ownerUserId = process.env.INTEGRATION_OWNER_USER_ID?.trim();
  if (!ownerUserId) {
    return NextResponse.json(
      { error: "Missing INTEGRATION_OWNER_USER_ID for cron sync" },
      { status: 500 }
    );
  }

  try {
    const [connectionsMigration, rulesMigration] = await Promise.all([
      bestEffortMigrateConnectionsToOwner(ownerUserId),
      bestEffortMigrateRulesToOwner(ownerUserId),
    ]);

    const [analytics, rules, health, pruning] = await Promise.all([
      runAnalyticsRefresh({ userIds: [ownerUserId], rangePresets: ["7d", "30d"] }),
      runRules({
        mode: "incremental",
        dryRun: false,
        userIds: [ownerUserId],
        startedAt,
      }),
      runIntegrationHealthChecks({ userId: ownerUserId }),
      pruneAnalyticsSnapshots({ olderThanDays: parseRetentionDays() }),
    ]);

    return NextResponse.json({
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      ownerUserId,
      migrations: {
        connections: connectionsMigration,
        rules: rulesMigration,
      },
      analytics,
      rules,
      health,
      pruning,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron sync failed";
    console.error("POST /api/cron/sync error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

