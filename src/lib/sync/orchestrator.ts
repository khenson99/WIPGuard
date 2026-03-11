/**
 * Sync orchestrator — the central entry point for all integration sync operations.
 *
 * This module is imported by both:
 *   1. The standalone worker process (worker/sync-runner.ts)
 *   2. The legacy cron endpoint (/api/cron/sync) as a fallback
 *
 * It coordinates running sync modules (HubSpot, Slack, Coda, Google, analytics,
 * health checks) and can be configured to skip specific modules.
 *
 * TODO: Wire in actual sync logic from the existing cron endpoint.
 *       This is a scaffold that existing sync code should be moved into.
 */

import type { PrismaClientType } from '@/lib/prisma';
import {
  dispatchAutomationAiJobs,
  dispatchWorkflowTriggerEvents,
  pollAutomationAiJobs,
} from '@/lib/automations/runtime';

export interface SyncModules {
  hubspot: boolean;
  slack: boolean;
  coda: boolean;
  google: boolean;
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
 * Run all enabled sync modules.
 *
 * @param prisma - PrismaClient instance (can be web server's or worker's dedicated instance)
 * @param modules - Which sync modules to run
 * @returns Array of results for each module
 */
export async function runSync(
  prisma: PrismaClientType,
  modules: SyncModules
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  const syncSteps: Array<{ name: string; enabled: boolean; fn: () => Promise<void> }> = [
    {
      name: 'hubspot',
      enabled: modules.hubspot,
      fn: async () => {
        // TODO: Move HubSpot sync logic here from cron endpoint
        // e.g., await syncHubSpot(prisma);
      },
    },
    {
      name: 'slack',
      enabled: modules.slack,
      fn: async () => {
        // TODO: Move Slack sync logic here
        // e.g., await syncSlack(prisma);
      },
    },
    {
      name: 'coda',
      enabled: modules.coda,
      fn: async () => {
        // TODO: Move Coda sync logic here
        // e.g., await syncCoda(prisma);
      },
    },
    {
      name: 'google',
      enabled: modules.google,
      fn: async () => {
        // TODO: Move Google sync logic here
        // e.g., await syncGoogle(prisma);
      },
    },
    {
      name: 'analytics',
      enabled: modules.analytics,
      fn: async () => {
        // TODO: Move analytics snapshot logic here
        // e.g., await runAnalyticsSnapshot(prisma);
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
        // TODO: Move health check logic here
        // e.g., await runHealthChecks(prisma);
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
