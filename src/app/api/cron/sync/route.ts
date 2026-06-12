export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { runAnalyticsSync } from "@/lib/sync/analytics";
import { runHealthChecksSync } from "@/lib/sync/health-checks";
import { discoverConnectedUserIds } from "@/lib/sync/users";
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
  ensureIntegrationOwnerOrganizationId,
} from "@/lib/integrations/ownership";
import { prisma, resetPrismaClient } from "@/lib/prisma";
import { materializeRetentionCurrent } from "@/lib/retention/pipeline";

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



async function runRetentionMaterialization(input: {
  ownerUserId: string | null;
  userIds: string[];
}): Promise<{
  attempted: number;
  materialized: number;
  skipped: Array<{ userId: string; reason: string }>;
}> {
  const actorsByOrganizationId = new Map<string, { id: string; organizationId: string }>();
  const skipped: Array<{ userId: string; reason: string }> = [];

  for (const userId of input.userIds) {
    const organizationId =
      input.ownerUserId === userId
        ? await ensureIntegrationOwnerOrganizationId(userId)
        : (
            await prisma.user.findUnique({
              where: { id: userId },
              select: { organizationId: true },
            })
          )?.organizationId;

    if (!organizationId) {
      skipped.push({ userId, reason: "Missing organizationId" });
      continue;
    }

    if (!actorsByOrganizationId.has(organizationId)) {
      actorsByOrganizationId.set(organizationId, { id: userId, organizationId });
    }
  }

  for (const actor of actorsByOrganizationId.values()) {
    await materializeRetentionCurrent(actor);
  }

  return {
    attempted: input.userIds.length,
    materialized: actorsByOrganizationId.size,
    skipped,
  };
}

async function resolveImladrisSyncContext(input: {
  ownerUserId: string | null;
  userIds: string[];
}): Promise<{ userId: string | null; organizationId: string | null }> {
  const userId = input.ownerUserId ?? input.userIds[0] ?? null;
  if (!userId) {
    return { userId: null, organizationId: null };
  }

  const organizationId =
    input.ownerUserId === userId
      ? await ensureIntegrationOwnerOrganizationId(userId)
      : (
          await prisma.user.findUnique({
            where: { id: userId },
            select: { organizationId: true },
          })
        )?.organizationId ?? null;

  return { userId, organizationId };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function positiveNumberField(value: unknown, field: string): number {
  const record = asRecord(value);
  const raw = record?.[field];
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 0;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function collectAnalyticsPartialFailures(value: unknown): string[] {
  const record = asRecord(value);
  if (!record) return [];

  const failures: string[] = [];
  const refreshFailures = positiveNumberField(record.refresh, "failureCount");
  if (refreshFailures > 0) {
    failures.push(
      `analytics: ${refreshFailures} provider refresh ${pluralize(refreshFailures, "failure")}`,
    );
  }

  const imladris = Array.isArray(record.imladris) ? record.imladris : [];
  const materializationFailures = imladris.filter((entry) => {
    const entryRecord = asRecord(entry);
    return typeof entryRecord?.error === "string" && entryRecord.error.trim().length > 0;
  }).length;
  if (materializationFailures > 0) {
    failures.push(
      `imladris: ${materializationFailures} canonical materialization ${pluralize(
        materializationFailures,
        "failure",
      )}`,
    );
  }

  return failures;
}

function collectRulesPartialFailures(value: unknown): string[] {
  const failures: string[] = [];
  const failedUserRuns = positiveNumberField(value, "failedUserRuns");
  if (failedUserRuns > 0) {
    failures.push(
      `rules: ${failedUserRuns} user ${pluralize(failedUserRuns, "run")} failed`,
    );
  }

  const failedRules = positiveNumberField(value, "failedRules");
  if (failedRules > 0) {
    const record = asRecord(value);
    const failedRuleErrors = Array.isArray(record?.failedRuleErrors)
      ? record.failedRuleErrors
      : [];
    const details = failedRuleErrors
      .map((entry) => {
        const entryRecord = asRecord(entry);
        const ruleKey =
          typeof entryRecord?.ruleKey === "string" && entryRecord.ruleKey.trim()
            ? entryRecord.ruleKey
            : "unknown_rule";
        const error =
          typeof entryRecord?.error === "string" && entryRecord.error.trim()
            ? entryRecord.error
            : "failed without error detail";
        return `${ruleKey}: ${error}`;
      })
      .slice(0, 5);

    failures.push(
      `rules: ${failedRules} provider ${pluralize(failedRules, "rule")} failed${
        details.length > 0 ? ` (${details.join("; ")})` : ""
      }`,
    );
  }

  return failures;
}

function collectHealthPartialFailures(value: unknown): string[] {
  const results = Array.isArray(value) ? value : [];
  const failedUsers = results.filter((entry) => {
    const record = asRecord(entry);
    return (
      positiveNumberField(record, "failed") > 0 ||
      (typeof record?.error === "string" && record.error.trim().length > 0)
    );
  }).length;
  if (failedUsers === 0) return [];

  return [
    `health: ${failedUsers} user health ${pluralize(failedUsers, "check")} failed`,
  ];
}

function isDegradedSyncBody(value: unknown): boolean {
  const record = asRecord(value);
  return record?.ok === false;
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
        message: "No recoverable integrations found — nothing to sync",
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
        imladrisContext: await resolveImladrisSyncContext({ ownerUserId, userIds }),
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

    // Analytics refresh + retention pruning are now bundled in the shared
    // runAnalyticsSync() (src/lib/sync/analytics.ts) so the orchestrator
    // and this cron route stay in lockstep. We destructure the combined
    // result back into separate `analytics` and `pruning` response fields
    // to preserve the external response-body shape that monitoring depends on.
    //
    // NOTE: These operations run SEQUENTIALLY instead of via Promise.allSettled
    // to avoid holding all provider API payloads in memory simultaneously.
    // Running them in parallel caused RSS to spike to ~3.4 GB and OOM.
    // Sequential execution keeps peak memory bounded to a single operation's
    // footprint at a time. See memory leak investigation (Jun 2026).
    async function settleAsync<T>(fn: () => Promise<T>): Promise<PromiseSettledResult<T>> {
      try {
        return { status: "fulfilled", value: await fn() };
      } catch (reason) {
        return { status: "rejected", reason };
      }
    }

    function logMemory(label: string) {
      const mem = process.memoryUsage();
      console.error(`[cron-sync:mem] ${label}`, {
        rss: `${Math.round(mem.rss / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)} MB`,
        external: `${Math.round(mem.external / 1024 / 1024)} MB`,
        arrayBuffers: `${Math.round(mem.arrayBuffers / 1024 / 1024)} MB`,
      });
    }

    logMemory("before-analytics");
    let analyticsSyncResult = await settleAsync(() =>
      runAnalyticsSync({
        prisma,
        userIds,
        rangePresets: ["7d", "30d", "90d"],
        includeMonthlyFinancialHistory: true,
        pruneOlderThanDays: parseRetentionDays(),
      }),
    );

    // Force GC between phases to reclaim query result buffers.
    // Requires NODE_OPTIONS="--expose-gc --max-old-space-size=4096".
    (globalThis as unknown as { gc?: () => void }).gc?.();
    logMemory("after-analytics");
    let rulesResult = await settleAsync(() =>
      runRules({
        mode: "incremental",
        dryRun: false,
        userIds,
        startedAt,
      }),
    );

    (globalThis as unknown as { gc?: () => void }).gc?.();
    logMemory("after-rules");
    // Health checks run per-user; shared with the orchestrator —
    // see src/lib/sync/health-checks.ts. The returned array preserves
    // the cron route's prior `settled.health` shape.
    let healthResult = await settleAsync(() =>
      runHealthChecksSync({ prisma, userIds }),
    );

    (globalThis as unknown as { gc?: () => void }).gc?.();
    logMemory("after-health");
    let retentionResult = await settleAsync(() =>
      runRetentionMaterialization({ ownerUserId, userIds }),
    );
    logMemory("after-retention");

    const settled = {
      analytics: null as unknown,
      rules: null as unknown,
      health: null as unknown,
      pruning: null as unknown,
      retention: null as unknown,
    };

    if (analyticsSyncResult.status === "fulfilled") {
      // Split bundled result back into `analytics` (refresh) and `pruning`
      // top-level fields — external monitors read these separately.
      settled.analytics = analyticsSyncResult.value.refresh;
      settled.pruning = analyticsSyncResult.value.pruning;
      failures.push(...collectAnalyticsPartialFailures(analyticsSyncResult.value));
    } else {
      const msg = analyticsSyncResult.reason instanceof Error ? analyticsSyncResult.reason.message : String(analyticsSyncResult.reason);
      failures.push(`analytics: ${msg}`);
      console.error("POST /api/cron/sync analytics failed:", analyticsSyncResult.reason);
    }
    // Release the full analytics result (contains all Imladris materialization
    // data). We've already extracted refresh + pruning into `settled`.
    analyticsSyncResult = null as unknown as typeof analyticsSyncResult;
    if (rulesResult.status === "fulfilled") {
      settled.rules = rulesResult.value;
      failures.push(...collectRulesPartialFailures(rulesResult.value));
    } else {
      const msg = rulesResult.reason instanceof Error ? rulesResult.reason.message : String(rulesResult.reason);
      failures.push(`rules: ${msg}`);
      console.error("POST /api/cron/sync rules failed:", rulesResult.reason);
    }
    rulesResult = null as unknown as typeof rulesResult;
    if (healthResult.status === "fulfilled") {
      settled.health = healthResult.value;
      failures.push(...collectHealthPartialFailures(healthResult.value));
    } else {
      const msg = healthResult.reason instanceof Error ? healthResult.reason.message : String(healthResult.reason);
      failures.push(`health: ${msg}`);
      console.error("POST /api/cron/sync health failed:", healthResult.reason);
    }
    healthResult = null as unknown as typeof healthResult;
    if (retentionResult.status === "fulfilled") {
      settled.retention = retentionResult.value;
    } else {
      const msg = retentionResult.reason instanceof Error ? retentionResult.reason.message : String(retentionResult.reason);
      failures.push(`retention: ${msg}`);
      console.error("POST /api/cron/sync retention materialization failed:", retentionResult.reason);
    }
    retentionResult = null as unknown as typeof retentionResult;

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
  // all users that have at least one recoverable integration.
  const userIds: string[] = ownerUserId
    ? [ownerUserId]
    : await discoverConnectedUserIds(prisma);

  if (userIds.length === 0) {
    return NextResponse.json({
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      ownerUserId,
      message: "No recoverable integrations found — nothing to sync",
    });
  }

  after(async () => {
    const result = await executeCronSync({ startedAt, ownerUserId, userIds });
    if (result.status >= 400) {
      console.error("POST /api/cron/sync background error:", {
        status: result.status,
        error: (result.body as Record<string, unknown>).error ?? "unknown",
      });
    } else if (isDegradedSyncBody(result.body)) {
      console.error("POST /api/cron/sync background degraded:", {
        failures: (result.body as Record<string, unknown>).failures ?? [],
      });
    }

    // Reset the Prisma client to release accumulated adapter state
    // (prepared statements, result buffers, query plan caches) that
    // grows by ~475 MB per cycle. The next query will lazily create
    // a fresh client and connection pool.
    await resetPrismaClient();
    (globalThis as unknown as { gc?: () => void }).gc?.();
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
