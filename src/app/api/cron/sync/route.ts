export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { runAnalyticsRefresh } from "@/lib/analytics/refresh-runner";
import { pruneAnalyticsSnapshots } from "@/lib/analytics/snapshots";
import { runVisitorFunnelEnrichmentSyncs } from "@/lib/analytics/provider-enrichment-sync";
import { buildVisitorFunnelEnrichmentStatus } from "@/lib/analytics/visitor-funnel";
import { enqueueVisitorFunnelEnrichmentAlertNotifications } from "@/lib/analytics/visitor-funnel-enrichment-alert-delivery";
import { instrumentVisitorFunnelEnrichmentAlerts } from "@/lib/analytics/visitor-funnel-enrichment-alerts";
import { runRules } from "@/lib/integrations/orchestrator";
import {
  bestEffortMigrateConnectionsToOwner,
  bestEffortMigrateRulesToOwner,
} from "@/lib/integrations/ownership";
import { runIntegrationHealthChecks } from "@/lib/integrations/health-checks";
import { prisma } from "@/lib/prisma";

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

    const visitorFunnelEnrichment = await runVisitorFunnelEnrichmentSyncs({
      prisma,
    });
    const visitorFunnelEnrichmentStatus = await buildVisitorFunnelEnrichmentStatus(prisma);
    const visitorFunnelEnrichmentTelemetry = instrumentVisitorFunnelEnrichmentAlerts(
      visitorFunnelEnrichmentStatus,
    );
    const visitorFunnelFailures = visitorFunnelEnrichment
      .filter((result) => !result.ok)
      .map((result) => `${result.provider}: ${result.reason ?? "unknown error"}`);
    const failures: string[] = [...visitorFunnelFailures];

    for (const log of visitorFunnelEnrichmentTelemetry.logs) {
      const message = JSON.stringify(log);
      if (log.level === "error") {
        console.error("[visitor-funnel.enrichment.alert]", message);
      } else {
        console.warn("[visitor-funnel.enrichment.alert]", message);
      }
    }
    for (const metric of visitorFunnelEnrichmentTelemetry.metrics) {
      console.info("[visitor-funnel.enrichment.metric]", JSON.stringify(metric));
    }

    const visitorFunnelEnrichmentNotifications =
      await enqueueVisitorFunnelEnrichmentAlertNotifications({
        alerts: visitorFunnelEnrichmentTelemetry.alerts,
      }).catch((error) => {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to enqueue visitor funnel enrichment alert notifications.";
        failures.push(`visitor-funnel-alerts: ${message}`);
        console.error("POST /api/cron/sync visitor funnel alert enqueue failed:", error);
        return {
          enabled: false,
          ownerUserId,
          slackChannelId: null,
          minIntervalHours: 24,
          bucketStart: null,
          enqueued: 0,
          skippedReason: message,
        };
      });

    const [analyticsResult, rulesResult, healthResult, pruningResult] = await Promise.allSettled([
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

    const settled = { analytics: null as unknown, rules: null as unknown, health: null as unknown, pruning: null as unknown };

    if (analyticsResult.status === "fulfilled") {
      settled.analytics = analyticsResult.value;
    } else {
      const msg = analyticsResult.reason instanceof Error ? analyticsResult.reason.message : String(analyticsResult.reason);
      failures.push(`analytics: ${msg}`);
      console.error("POST /api/cron/sync analytics failed:", analyticsResult.reason);
    }
    if (rulesResult.status === "fulfilled") {
      settled.rules = rulesResult.value;
    } else {
      const msg = rulesResult.reason instanceof Error ? rulesResult.reason.message : String(rulesResult.reason);
      failures.push(`rules: ${msg}`);
      console.error("POST /api/cron/sync rules failed:", rulesResult.reason);
    }
    if (healthResult.status === "fulfilled") {
      settled.health = healthResult.value;
    } else {
      const msg = healthResult.reason instanceof Error ? healthResult.reason.message : String(healthResult.reason);
      failures.push(`health: ${msg}`);
      console.error("POST /api/cron/sync health failed:", healthResult.reason);
    }
    if (pruningResult.status === "fulfilled") {
      settled.pruning = pruningResult.value;
    } else {
      const msg = pruningResult.reason instanceof Error ? pruningResult.reason.message : String(pruningResult.reason);
      failures.push(`pruning: ${msg}`);
      console.error("POST /api/cron/sync pruning failed:", pruningResult.reason);
    }

    return NextResponse.json({
      ok: failures.length === 0,
      startedAt,
      finishedAt: new Date().toISOString(),
      ownerUserId,
      migrations: {
        connections: connectionsMigration,
        rules: rulesMigration,
      },
      visitorFunnelEnrichment,
      visitorFunnelEnrichmentHealth: {
        alerts: visitorFunnelEnrichmentTelemetry.alerts,
        providers: visitorFunnelEnrichmentStatus,
      },
      visitorFunnelEnrichmentNotifications,
      ...settled,
      ...(failures.length > 0 ? { failures } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron sync failed";
    console.error("POST /api/cron/sync error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
