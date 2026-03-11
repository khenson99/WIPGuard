export const dynamic = "force-dynamic";

import { after, NextRequest, NextResponse } from "next/server";
import { runAnalyticsRefresh } from "@/lib/analytics/refresh-runner";
import { pruneAnalyticsSnapshots } from "@/lib/analytics/snapshots";
import { runVisitorFunnelEnrichmentSyncs } from "@/lib/analytics/provider-enrichment-sync";
import {
  VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON,
  getVisitorFunnelPrisma,
} from "@/lib/analytics/visitor-funnel-availability";
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

function shouldWaitForCompletion(request: NextRequest): boolean {
  const wait = new URL(request.url).searchParams.get("wait")?.trim().toLowerCase();
  return wait === "1" || wait === "true";
}

async function executeCronSync(input: {
  startedAt: string;
  ownerUserId: string | null;
  userIds: string[];
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const { startedAt, ownerUserId, userIds } = input;

  if (userIds.length === 0) {
    return {
      status: 200,
      body: {
        ok: true,
        startedAt,
        finishedAt: new Date().toISOString(),
        ownerUserId,
        message: "No connected integrations found — nothing to sync",
      },
    };
  }

  try {
    // Only run ownership migration when an explicit owner is configured.
    const [connectionsMigration, rulesMigration] = ownerUserId
      ? await Promise.all([
          bestEffortMigrateConnectionsToOwner(ownerUserId),
          bestEffortMigrateRulesToOwner(ownerUserId),
        ])
      : [{ copied: 0, skipped: 0 }, { copied: 0, skipped: 0 }];

    const funnelPrisma = getVisitorFunnelPrisma(prisma);
    let visitorFunnelEnrichment: Awaited<
      ReturnType<typeof runVisitorFunnelEnrichmentSyncs>
    >;
    let visitorFunnelEnrichmentStatus: Awaited<
      ReturnType<typeof buildVisitorFunnelEnrichmentStatus>
    > = [];
    let visitorFunnelEnrichmentAlerts = [] as ReturnType<
      typeof instrumentVisitorFunnelEnrichmentAlerts
    >["alerts"];
    let visitorFunnelEnrichmentNotifications: Awaited<
      ReturnType<typeof enqueueVisitorFunnelEnrichmentAlertNotifications>
    > = {
      enabled: false,
      ownerUserId: ownerUserId ?? userIds[0],
      slackChannelId: null,
      minIntervalHours: 24,
      bucketStart: null,
      enqueued: 0,
      skippedReason: VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON,
    };
    const failures: string[] = [];

    if (funnelPrisma) {
      visitorFunnelEnrichment = await runVisitorFunnelEnrichmentSyncs({
        prisma,
      });
      visitorFunnelEnrichmentStatus = await buildVisitorFunnelEnrichmentStatus(funnelPrisma);
      const visitorFunnelEnrichmentTelemetry = instrumentVisitorFunnelEnrichmentAlerts(
        visitorFunnelEnrichmentStatus,
      );
      visitorFunnelEnrichmentAlerts = visitorFunnelEnrichmentTelemetry.alerts;

      const visitorFunnelFailures = visitorFunnelEnrichment
        .filter((result) => !result.ok)
        .map((result) => `${result.provider}: ${result.reason ?? "unknown error"}`);
      failures.push(...visitorFunnelFailures);

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

      visitorFunnelEnrichmentNotifications =
        await enqueueVisitorFunnelEnrichmentAlertNotifications({
          alerts: visitorFunnelEnrichmentAlerts,
        }).catch((error) => {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to enqueue visitor funnel enrichment alert notifications.";
          failures.push(`visitor-funnel-alerts: ${message}`);
          console.error("POST /api/cron/sync visitor funnel alert enqueue failed:", error);
          return {
            enabled: false,
            ownerUserId: ownerUserId ?? userIds[0],
            slackChannelId: null,
            minIntervalHours: 24,
            bucketStart: null,
            enqueued: 0,
            skippedReason: message,
          };
        });
    } else {
      console.warn(
        "POST /api/cron/sync visitor funnel integration skipped:",
        VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON,
      );
      visitorFunnelEnrichment = [
        {
          provider: "unify" as const,
          mode: "pull" as const,
          ok: true,
          skipped: true,
          reason: VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON,
          pulled: 0,
          stored: 0,
          accepted: 0,
          updatedAfter: null,
        },
        {
          provider: "clay" as const,
          mode: "push_only" as const,
          ok: true,
          skipped: true,
          reason: VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON,
          pulled: 0,
          stored: 0,
          accepted: 0,
          updatedAfter: null,
        },
        {
          provider: "rb2b" as const,
          mode: "push_only" as const,
          ok: true,
          skipped: true,
          reason: VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON,
          pulled: 0,
          stored: 0,
          accepted: 0,
          updatedAfter: null,
        },
      ];
      visitorFunnelEnrichmentStatus = [];
    }

    const [analyticsResult, rulesResult, healthResult, pruningResult] = await Promise.allSettled([
      runAnalyticsRefresh({ userIds, rangePresets: ["7d", "30d"] }),
      runRules({
        mode: "incremental",
        dryRun: false,
        userIds,
        startedAt,
      }),
      // Health checks run per-user; run for all discovered users.
      Promise.all(userIds.map((uid) => runIntegrationHealthChecks({ userId: uid }))),
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

    return {
      status: 200,
      body: {
        ok: failures.length === 0,
        startedAt,
        finishedAt: new Date().toISOString(),
        ownerUserId,
        userIds,
        migrations: {
          connections: connectionsMigration,
          rules: rulesMigration,
        },
        visitorFunnelEnrichment,
        visitorFunnelEnrichmentHealth: {
          alerts: visitorFunnelEnrichmentAlerts,
          providers: visitorFunnelEnrichmentStatus,
        },
        visitorFunnelEnrichmentNotifications,
        ...settled,
        ...(failures.length > 0 ? { failures } : {}),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron sync failed";
    console.error("POST /api/cron/sync error:", error);
    return { status: 500, body: { error: message } };
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const ownerUserId = process.env.INTEGRATION_OWNER_USER_ID?.trim() || null;

  // Discover user IDs: prefer the explicit owner, otherwise query the DB for
  // all users that have at least one connected integration.
  const userIds: string[] = ownerUserId
    ? [ownerUserId]
    : (
        await prisma.integrationConnection.findMany({
          distinct: ["userId"],
          where: { status: "CONNECTED" },
          select: { userId: true },
        })
      ).map((row) => row.userId);

  if (userIds.length === 0) {
    return NextResponse.json({
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      ownerUserId,
      message: "No connected integrations found — nothing to sync",
    });
  }

  if (shouldWaitForCompletion(request)) {
    const result = await executeCronSync({ startedAt, ownerUserId, userIds });
    return NextResponse.json(result.body, { status: result.status });
  }

  after(async () => {
    const result = await executeCronSync({ startedAt, ownerUserId, userIds });
    if (result.status >= 400) {
      console.error("POST /api/cron/sync background error:", result.body);
    }
  });

  return NextResponse.json(
    {
      ok: true,
      queued: true,
      mode: "background",
      startedAt,
      ownerUserId,
      userIds,
    },
    { status: 202 }
  );
}
