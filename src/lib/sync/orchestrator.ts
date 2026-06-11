/**
 * Sync orchestrator — the central entry point for all integration sync operations.
 *
 * This module is imported by both:
 *   1. The standalone worker process (worker/sync-runner.ts)
 *   2. The legacy cron endpoint (/api/cron/sync) as a fallback
 *
 * It coordinates running sync modules (HubSpot, Slack, Google, analytics,
 * health checks) and can be configured to skip specific modules.
 */

import type { PrismaClientType } from '@/lib/prisma';
import { IntegrationProvider } from '@/generated/prisma/client';
import {
  dispatchAutomationAiJobs,
  dispatchWorkflowTriggerEvents,
  pollAutomationAiJobs,
} from '@/lib/automations/runtime';
import { runVisitorFunnelEnrichmentSyncs } from '@/lib/analytics/provider-enrichment-sync';
import { runRules } from '@/lib/integrations/orchestrator';
import { runAnalyticsSync } from './analytics';
import { runHealthChecksSync } from './health-checks';
import { discoverConnectedUserIds } from './users';

export interface SyncModules {
  hubspot: boolean;
  slack: boolean;
  /** Retired with task/WIP tooling. Kept for stale worker config compatibility. */
  coda: boolean;
  google: boolean;
  providerRules: boolean;
  visitorFunnelEnrichment: boolean;
  analytics: boolean;
  automations: boolean;
  healthChecks: boolean;
}

export interface SyncResult {
  module: string;
  success: boolean;
  durationMs: number;
  error?: string;
}

/**
 * Optional context passed to runSync(). Lets callers pre-supply work that
 * multiple modules need (e.g. discovered user IDs), instead of each module
 * re-deriving it.
 *
 * NOTE: As more modules are migrated out of /api/cron/sync, additional
 * fields will be added here (e.g. ownerUserId for ownership migrations,
 * shared startedAt for `runRules`). For now only analytics uses this.
 */
export interface SyncOptions {
  /**
   * Pre-discovered user IDs to operate on. When omitted, modules that
   * need this will discover users with at least one recoverable integration
   * connection.
   */
  userIds?: string[];
  imladrisContext?: {
    userId: string | null;
    organizationId: string | null;
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function positiveNumberField(value: unknown, field: string): number {
  const record = asRecord(value);
  const raw = record?.[field];
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function collectAnalyticsPartialFailures(value: unknown): string[] {
  const record = asRecord(value);
  if (!record) return [];

  const failures: string[] = [];
  const refreshFailures = positiveNumberField(record.refresh, 'failureCount');
  if (refreshFailures > 0) {
    failures.push(
      `analytics: ${refreshFailures} provider refresh ${pluralize(refreshFailures, 'failure')}`,
    );
  }

  const imladris = Array.isArray(record.imladris) ? record.imladris : [];
  const materializationFailures = imladris.filter((entry) => {
    const entryRecord = asRecord(entry);
    return typeof entryRecord?.error === 'string' && entryRecord.error.trim().length > 0;
  }).length;
  if (materializationFailures > 0) {
    failures.push(
      `imladris: ${materializationFailures} canonical materialization ${pluralize(
        materializationFailures,
        'failure',
      )}`,
    );
  }

  // Growth-control pruning failures (see src/lib/sync/analytics.ts). These
  // must stay loud: an unnoticed retention failure is how ImladrisMetricLineage
  // filled the database volume on 2026-06-10.
  for (const [field, label] of [
    ['lineagePruning', 'lineage_pruning'],
    ['outboxPruning', 'outbox_pruning'],
  ] as const) {
    const outcome = asRecord(record[field]);
    if (typeof outcome?.error === 'string' && outcome.error.trim().length > 0) {
      failures.push(`${label}: ${outcome.error}`);
    }
  }

  return failures;
}

function collectRulesPartialFailures(value: unknown): string[] {
  const failures: string[] = [];
  const failedUserRuns = positiveNumberField(value, 'failedUserRuns');
  if (failedUserRuns > 0) {
    failures.push(
      `rules: ${failedUserRuns} user ${pluralize(failedUserRuns, 'run')} failed`,
    );
  }

  const failedRules = positiveNumberField(value, 'failedRules');
  if (failedRules > 0) {
    const record = asRecord(value);
    const failedRuleErrors = Array.isArray(record?.failedRuleErrors)
      ? record.failedRuleErrors
      : [];
    const details = failedRuleErrors
      .map((entry) => {
        const entryRecord = asRecord(entry);
        const ruleKey =
          typeof entryRecord?.ruleKey === 'string' && entryRecord.ruleKey.trim()
            ? entryRecord.ruleKey
            : 'unknown_rule';
        const error =
          typeof entryRecord?.error === 'string' && entryRecord.error.trim()
            ? entryRecord.error
            : 'failed without error detail';
        return `${ruleKey}: ${error}`;
      })
      .slice(0, 5);

    failures.push(
      `rules: ${failedRules} provider ${pluralize(failedRules, 'rule')} failed${
        details.length > 0 ? ` (${details.join('; ')})` : ''
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
      positiveNumberField(record, 'failed') > 0 ||
      (typeof record?.error === 'string' && record.error.trim().length > 0)
    );
  }).length;
  if (failedUsers === 0) return [];

  return [
    `health: ${failedUsers} user health ${pluralize(failedUsers, 'check')} failed`,
  ];
}

function assertNoPartialFailures(failures: string[]): void {
  if (failures.length > 0) {
    throw new Error(failures.join('; '));
  }
}

async function resolveImladrisContext(
  prisma: PrismaClientType,
  options: SyncOptions,
): Promise<SyncOptions['imladrisContext']> {
  if (options.imladrisContext) {
    return options.imladrisContext;
  }

  const userIds =
    options.userIds && options.userIds.length > 0
      ? options.userIds
      : await discoverConnectedUserIds(prisma);
  const userId = userIds[0] ?? null;
  if (!userId) {
    return undefined;
  }

  const organizationId =
    (
      await prisma.user.findUnique({
        where: { id: userId },
        select: { organizationId: true },
      })
    )?.organizationId ?? null;

  return { userId, organizationId };
}

/**
 * Run all enabled sync modules.
 *
 * @param prisma - PrismaClient instance (can be web server's or worker's dedicated instance)
 * @param modules - Which sync modules to run
 * @param options - Optional pre-discovered context (userIds, etc.)
 * @returns Array of results for each module
 */
export async function runSync(
  prisma: PrismaClientType,
  modules: SyncModules,
  options: SyncOptions = {}
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  const syncSteps: Array<{ name: string; enabled: boolean; fn: () => Promise<void> }> = [
    {
      name: 'hubspot',
      enabled: modules.hubspot,
      fn: async () => {
        const result = await runRules({
          mode: 'incremental',
          dryRun: false,
          userIds: options.userIds,
          providers: [IntegrationProvider.HUBSPOT],
          startedAt: new Date().toISOString(),
        });
        assertNoPartialFailures(collectRulesPartialFailures(result));
      },
    },
    {
      name: 'slack',
      enabled: modules.slack,
      fn: async () => {
        const result = await runRules({
          mode: 'incremental',
          dryRun: false,
          userIds: options.userIds,
          providers: [IntegrationProvider.SLACK],
          startedAt: new Date().toISOString(),
        });
        assertNoPartialFailures(collectRulesPartialFailures(result));
      },
    },
    {
      name: 'google',
      enabled: modules.google,
      fn: async () => {
        const result = await runRules({
          mode: 'incremental',
          dryRun: false,
          userIds: options.userIds,
          providers: [IntegrationProvider.GOOGLE_WORKSPACE],
          startedAt: new Date().toISOString(),
        });
        assertNoPartialFailures(collectRulesPartialFailures(result));
      },
    },
    {
      name: 'providerRules',
      enabled: modules.providerRules,
      fn: async () => {
        const result = await runRules({
          mode: 'incremental',
          dryRun: false,
          userIds: options.userIds,
          startedAt: new Date().toISOString(),
        });
        assertNoPartialFailures(collectRulesPartialFailures(result));
      },
    },
    {
      name: 'visitorFunnelEnrichment',
      enabled: modules.visitorFunnelEnrichment,
      fn: async () => {
        const results = await runVisitorFunnelEnrichmentSyncs({
          prisma,
          imladrisContext: await resolveImladrisContext(prisma, options),
        });
        const failed = results.find((result) => !result.ok);
        if (failed) {
          throw new Error(
            `${failed.provider} enrichment sync failed: ${failed.reason ?? 'unknown error'}`,
          );
        }
      },
    },
    {
      name: 'analytics',
      enabled: modules.analytics,
      fn: async () => {
        // Shared with the cron route — see src/lib/sync/analytics.ts.
        // Auto-discovers recoverable integration users when options.userIds
        // is not supplied.
        const result = await runAnalyticsSync({
          prisma,
          userIds: options.userIds,
        });
        assertNoPartialFailures(collectAnalyticsPartialFailures(result));
      },
    },
    {
      name: 'automations',
      enabled: modules.automations,
      fn: async () => {
        await dispatchWorkflowTriggerEvents(25);
        await dispatchAutomationAiJobs(10);
        await pollAutomationAiJobs(20);
      },
    },
    {
      name: 'healthChecks',
      enabled: modules.healthChecks,
      fn: async () => {
        // Shared with the cron route — see src/lib/sync/health-checks.ts.
        // Auto-discovers recoverable integration users when options.userIds
        // is not supplied (mirrors the analytics module's fallback).
        const result = await runHealthChecksSync({
          prisma,
          userIds: options.userIds,
        });
        assertNoPartialFailures(collectHealthPartialFailures(result));
      },
    },
  ];

  for (const step of syncSteps) {
    if (!step.enabled) {
      continue;
    }

    const startTime = Date.now();
    try {
      await step.fn();
      results.push({
        module: step.name,
        success: true,
        durationMs: Date.now() - startTime,
      });
    } catch (err) {
      results.push({
        module: step.name,
        success: false,
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
      });
      // Continue with remaining modules even if one fails
    }
  }

  return results;
}
