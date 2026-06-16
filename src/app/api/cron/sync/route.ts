export const dynamic = "force-dynamic";

import { after, NextRequest, NextResponse } from "next/server";
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
import { prisma } from "@/lib/prisma";
import { materializeRetentionCurrent } from "@/lib/retention/pipeline";
import { withSyncAdvisoryLock } from "@/lib/sync/sync-lock";

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
    const [analyticsSyncResult, rulesResult, healthResult, retentionResult] = await Promise.allSettled([
      runAnalyticsSync({
        prisma,
        userIds,
        rangePresets: ["7d", "30d", "90d"],
        includeMonthlyFinancialHistory: true,
        pruneOlderThanDays: parseRetentionDays(),
      }),
      runRules({
        mode: "incremental",
        dryRun: false,
        userIds,
        startedAt,
      }),
      // Health checks run per-user; shared with the orchestrator —
      // see src/lib/sync/health-checks.ts. The returned array preserves
      // the cron route's prior `settled.health` shape.
      runHealthChecksSync({ prisma, userIds }),
      runRetentionMaterialization({ ownerUserId, userIds }),
    ]);

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
    if (rulesResult.status === "fulfilled") {
      settled.rules = rulesResult.value;
      failures.push(...collectRulesPartialFailures(rulesResult.value));
    } else {
      const msg = rulesResult.reason instanceof Error ? rulesResult.reason.message : String(rulesResult.reason);
      failures.push(`rules: ${msg}`);
      console.error("POST /api/cron/sync rules failed:", rulesResult.reason);
    }
    if (healthResult.status === "fulfilled") {
      settled.health = healthResult.value;
      failures.push(...collectHealthPartialFailures(healthResult.value));
    } else {
      const msg = healthResult.reason instanceof Error ? healthResult.reason.message : String(healthResult.reason);
      failures.push(`health: ${msg}`);
      console.error("POST /api/cron/sync health failed:", healthResult.reason);
    }
    if (retentionResult.status === "fulfilled") {
      settled.retention = retentionResult.value;
    } else {
      const msg = retentionResult.reason instanceof Error ? retentionResult.reason.message : String(retentionResult.reason);
      failures.push(`retention: ${msg}`);
      console.error("POST /api/cron/sync retention materialization failed:", retentionResult.reason);
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

/**
 * Run the cron sync under the global advisory lock so overlapping cycles are
 * skipped rather than stacked. Stacked cycles each load large raw-record sets
 * and were the cause of the WIPGuard-app OOM crash loop — see
 * src/lib/sync/sync-lock.ts.
 */
async function executeCronSyncGuarded(input: {
  startedAt: string;
  ownerUserId: string | null;
  userIds: string[];
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const outcome = await withSyncAdvisoryLock(() => executeCronSync(input));
  if (outcome.ran) {
    return outcome.result;
  }
  console.warn("POST /api/cron/sync skipped:", outcome.reason);
  return {
    status: 200,
    body: {
      ok: true,
      skipped: true,
      reason: outcome.reason,
      startedAt: input.startedAt,
      finishedAt: new Date().toISOString(),
      ownerUserId: input.ownerUserId,
    },
  };
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

  if (shouldWaitForCompletion(request)) {
    const result = await executeCronSyncGuarded({ startedAt, ownerUserId, userIds });
    return NextResponse.json(result.body, { status: result.status });
  }

  after(async () => {
    const result = await executeCronSyncGuarded({ startedAt, ownerUserId, userIds });
    if (result.status >= 400) {
      console.error("POST /api/cron/sync background error:", result.body);
      return;
    }
    if (isDegradedSyncBody(result.body)) {
      console.error("POST /api/cron/sync background degraded:", result.body);
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
