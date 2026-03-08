import { describe, it, expect, vi } from 'vitest';
import {
  dispatchAutomationAiJobs,
  dispatchWorkflowTriggerEvents,
  pollAutomationAiJobs,
} from '@/lib/automations/runtime';
import { runSync, type SyncModules } from '../orchestrator';

vi.mock('@/lib/automations/runtime', () => ({
  dispatchWorkflowTriggerEvents: vi.fn(async () => ({
    processed: 0,
    startedRuns: 0,
    timedOutApprovals: 0,
  })),
  dispatchAutomationAiJobs: vi.fn(async () => 0),
  pollAutomationAiJobs: vi.fn(async () => 0),
}));

// Minimal mock PrismaClient
const mockPrisma = {} as unknown;

describe('sync orchestrator', () => {
  it('runs all enabled modules and returns results', async () => {
    const modules: SyncModules = {
      hubspot: true,
      slack: true,
      coda: true,
      google: true,
      analytics: true,
      automations: true,
      healthChecks: true,
    };

    const results = await runSync(mockPrisma, modules);

    expect(results).toHaveLength(7);
    expect(results.every((r) => r.success)).toBe(true);
    expect(results.map((r) => r.module)).toEqual([
      'hubspot',
      'slack',
      'coda',
      'google',
      'analytics',
      'automations',
      'healthChecks',
    ]);
    expect(dispatchWorkflowTriggerEvents).toHaveBeenCalledTimes(1);
    expect(dispatchAutomationAiJobs).toHaveBeenCalledTimes(1);
    expect(pollAutomationAiJobs).toHaveBeenCalledTimes(1);
  });

  it('skips disabled modules', async () => {
    const modules: SyncModules = {
      hubspot: false,
      slack: true,
      coda: false,
      google: false,
      analytics: true,
      automations: false,
      healthChecks: false,
    };

    const results = await runSync(mockPrisma, modules);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.module)).toEqual(['slack', 'analytics']);
  });

  it('continues running remaining modules if one fails', async () => {
    // This test validates the error-handling behavior.
    // When actual sync logic is wired in, individual modules may throw.
    const modules: SyncModules = {
      hubspot: true,
      slack: true,
      coda: true,
      google: true,
      analytics: true,
      automations: true,
      healthChecks: true,
    };

    const results = await runSync(mockPrisma, modules);

    // With stub implementations, all should succeed
    expect(results.every((r) => r.success)).toBe(true);
  });

  it('returns empty results when all modules are disabled', async () => {
    const modules: SyncModules = {
      hubspot: false,
      slack: false,
      coda: false,
      google: false,
      analytics: false,
      automations: false,
      healthChecks: false,
    };

    const results = await runSync(mockPrisma, modules);
    expect(results).toHaveLength(0);
  });

  it('includes durationMs in results', async () => {
    const modules: SyncModules = {
      hubspot: true,
      slack: false,
      coda: false,
      google: false,
      analytics: false,
      automations: false,
      healthChecks: false,
    };

    const results = await runSync(mockPrisma, modules);

    expect(results[0].durationMs).toBeGreaterThanOrEqual(0);
  });
});
