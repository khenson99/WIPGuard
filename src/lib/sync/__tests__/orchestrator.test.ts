import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
  dispatchAutomationAiJobs,
  dispatchWorkflowTriggerEvents,
  pollAutomationAiJobs,
} from '@/lib/automations/runtime';
import { runAnalyticsSync } from '../analytics';
import { runHealthChecksSync } from '../health-checks';
import { runSync, type SyncModules } from '../orchestrator';
import { runRules } from '@/lib/integrations/orchestrator';
import { runVisitorFunnelEnrichmentSyncs } from '@/lib/analytics/provider-enrichment-sync';

vi.mock('@/lib/automations/runtime', () => ({
  dispatchWorkflowTriggerEvents: vi.fn(async () => ({
    processed: 0,
    startedRuns: 0,
    timedOutApprovals: 0,
  })),
  dispatchAutomationAiJobs: vi.fn(async () => 0),
  pollAutomationAiJobs: vi.fn(async () => 0),
}));

vi.mock('../analytics', () => ({
  runAnalyticsSync: vi.fn(async () => ({
    refresh: { usersProcessed: 0, refreshCount: 0, failureCount: 0, completedAt: 'mock' },
    pruning: { deleted: 0, cutoff: 'mock' },
  })),
}));

vi.mock('../health-checks', () => ({
  runHealthChecksSync: vi.fn(async () => []),
}));

vi.mock('@/lib/integrations/orchestrator', () => ({
  runRules: vi.fn(async () => ({
    executedRules: 0,
    skippedLegacyTaskRules: 0,
    bootstrappedProviderRules: 0,
  })),
}));

vi.mock('@/lib/analytics/provider-enrichment-sync', () => ({
  runVisitorFunnelEnrichmentSyncs: vi.fn(async () => [
    {
      provider: 'unify',
      mode: 'pull',
      ok: true,
      skipped: false,
      reason: null,
      pulled: 1,
      stored: 1,
      accepted: 1,
      updatedAfter: '2026-06-01T00:00:00.000Z',
    },
  ]),
}));

const mockIntegrationConnectionFindMany = vi.fn();
const mockUserFindUnique = vi.fn();

// Minimal mock PrismaClient
const mockPrisma = {
  integrationConnection: {
    findMany: (...args: unknown[]) => mockIntegrationConnectionFindMany(...args),
  },
  user: {
    findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
  },
} as never;

describe('sync orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runAnalyticsSync).mockResolvedValue({
      refresh: { usersProcessed: 0, refreshCount: 0, failureCount: 0, completedAt: 'mock' },
      pruning: { deleted: 0, cutoff: 'mock' },
      imladris: [],
    } as never);
    vi.mocked(runHealthChecksSync).mockResolvedValue([]);
    vi.mocked(runRules).mockResolvedValue({
      executedRules: 0,
      skippedLegacyTaskRules: 0,
      bootstrappedProviderRules: 0,
      failedUserRuns: 0,
    } as never);
    vi.mocked(runVisitorFunnelEnrichmentSyncs).mockResolvedValue([
      {
        provider: 'unify',
        mode: 'pull',
        ok: true,
        skipped: false,
        reason: null,
        pulled: 1,
        stored: 1,
        accepted: 1,
        updatedAfter: '2026-06-01T00:00:00.000Z',
      },
    ] as never);
    mockIntegrationConnectionFindMany.mockResolvedValue([{ userId: 'owner_1' }]);
    mockUserFindUnique.mockResolvedValue({ organizationId: 'org_1' });
  });

  it('runs wired provider modules and ignores retired Coda requests', async () => {
    const modules: SyncModules = {
      hubspot: true,
      slack: true,
      coda: true,
      google: true,
      providerRules: true,
      visitorFunnelEnrichment: true,
      analytics: true,
      automations: true,
      healthChecks: true,
    };

    const results = await runSync(mockPrisma, modules);

    expect(results).toHaveLength(8);
    expect(results.map((r) => r.module)).toEqual([
      'hubspot',
      'slack',
      'google',
      'providerRules',
      'visitorFunnelEnrichment',
      'analytics',
      'automations',
      'healthChecks',
    ]);
    expect(results.find((r) => r.module === 'coda')).toBeUndefined();

    // providerRules, visitorFunnelEnrichment, automations, analytics, and healthChecks are wired modules — they must succeed
    const hubspotResult = results.find((r) => r.module === 'hubspot');
    expect(hubspotResult?.success).toBe(true);
    const providerRulesResult = results.find((r) => r.module === 'providerRules');
    expect(providerRulesResult?.success).toBe(true);
    const slackResult = results.find((r) => r.module === 'slack');
    expect(slackResult?.success).toBe(true);
    const googleResult = results.find((r) => r.module === 'google');
    expect(googleResult?.success).toBe(true);
    const visitorFunnelResult = results.find((r) => r.module === 'visitorFunnelEnrichment');
    expect(visitorFunnelResult?.success).toBe(true);
    const automationsResult = results.find((r) => r.module === 'automations');
    expect(automationsResult?.success).toBe(true);
    const analyticsResult = results.find((r) => r.module === 'analytics');
    expect(analyticsResult?.success).toBe(true);
    const healthChecksResult = results.find((r) => r.module === 'healthChecks');
    expect(healthChecksResult?.success).toBe(true);

    expect(dispatchWorkflowTriggerEvents).toHaveBeenCalledTimes(1);
    expect(dispatchAutomationAiJobs).toHaveBeenCalledTimes(1);
    expect(pollAutomationAiJobs).toHaveBeenCalledTimes(1);
    expect(runRules).toHaveBeenCalledTimes(4);
    expect(runRules).toHaveBeenCalledWith({
      mode: 'incremental',
      dryRun: false,
      userIds: undefined,
      providers: ['HUBSPOT'],
      startedAt: expect.any(String),
    });
    expect(runRules).toHaveBeenCalledWith({
      mode: 'incremental',
      dryRun: false,
      userIds: undefined,
      providers: ['SLACK'],
      startedAt: expect.any(String),
    });
    expect(runRules).toHaveBeenCalledWith({
      mode: 'incremental',
      dryRun: false,
      userIds: undefined,
      providers: ['GOOGLE_WORKSPACE'],
      startedAt: expect.any(String),
    });
    expect(runVisitorFunnelEnrichmentSyncs).toHaveBeenCalledTimes(1);
    expect(runAnalyticsSync).toHaveBeenCalledTimes(1);
    expect(runHealthChecksSync).toHaveBeenCalledTimes(1);
  });

  it('skips disabled modules', async () => {
    const modules: SyncModules = {
      hubspot: false,
      slack: true,
      coda: false,
      google: false,
      providerRules: false,
      visitorFunnelEnrichment: false,
      analytics: true,
      automations: false,
      healthChecks: false,
    };

    const results = await runSync(mockPrisma, modules);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.module)).toEqual(['slack', 'analytics']);
  });

  it('continues running remaining modules if one fails', async () => {
    const modules: SyncModules = {
      hubspot: true,
      slack: true,
      coda: true,
      google: true,
      providerRules: true,
      visitorFunnelEnrichment: true,
      analytics: true,
      automations: true,
      healthChecks: true,
    };

    const results = await runSync(mockPrisma, modules);

    expect(results).toHaveLength(8);
    const automationsResult = results.find((r) => r.module === 'automations');
    expect(automationsResult?.success).toBe(true);
  });

  it('ignores retired Coda sync module requests instead of failing the worker cycle', async () => {
    const modules: SyncModules = {
      hubspot: false,
      slack: false,
      coda: true,
      google: false,
      providerRules: true,
      visitorFunnelEnrichment: false,
      analytics: false,
      automations: false,
      healthChecks: false,
    };

    const results = await runSync(mockPrisma, modules);

    expect(results.map((result) => result.module)).toEqual(['providerRules']);
    expect(results).not.toEqual([
      expect.objectContaining({
        module: 'coda',
      }),
    ]);
  });

  it('returns empty results when all modules are disabled', async () => {
    const modules: SyncModules = {
      hubspot: false,
      slack: false,
      coda: false,
      google: false,
      providerRules: false,
      visitorFunnelEnrichment: false,
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
      providerRules: false,
      visitorFunnelEnrichment: false,
      analytics: false,
      automations: false,
      healthChecks: false,
    };

    const results = await runSync(mockPrisma, modules);

    expect(results[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('runs provider metrics rules as a first-class worker module', async () => {
    const modules: SyncModules = {
      hubspot: false,
      slack: false,
      coda: false,
      google: false,
      providerRules: true,
      visitorFunnelEnrichment: false,
      analytics: false,
      automations: false,
      healthChecks: false,
    };

    const results = await runSync(mockPrisma, modules, {
      userIds: ['owner_1'],
    });

    expect(results).toEqual([
      expect.objectContaining({
        module: 'providerRules',
        success: true,
      }),
    ]);
    expect(runRules).toHaveBeenCalledWith({
      mode: 'incremental',
      dryRun: false,
      userIds: ['owner_1'],
      startedAt: expect.any(String),
    });
  });

  it('runs Slack provider metrics rules as the Slack worker module', async () => {
    const modules: SyncModules = {
      hubspot: false,
      slack: true,
      coda: false,
      google: false,
      providerRules: false,
      visitorFunnelEnrichment: false,
      analytics: false,
      automations: false,
      healthChecks: false,
    };

    const results = await runSync(mockPrisma, modules, {
      userIds: ['owner_1'],
    });

    expect(results).toEqual([
      expect.objectContaining({
        module: 'slack',
        success: true,
      }),
    ]);
    expect(runRules).toHaveBeenCalledWith({
      mode: 'incremental',
      dryRun: false,
      userIds: ['owner_1'],
      providers: ['SLACK'],
      startedAt: expect.any(String),
    });
  });

  it('runs Google Workspace provider metrics rules as the Google worker module', async () => {
    const modules: SyncModules = {
      hubspot: false,
      slack: false,
      coda: false,
      google: true,
      providerRules: false,
      visitorFunnelEnrichment: false,
      analytics: false,
      automations: false,
      healthChecks: false,
    };

    const results = await runSync(mockPrisma, modules, {
      userIds: ['owner_1'],
    });

    expect(results).toEqual([
      expect.objectContaining({
        module: 'google',
        success: true,
      }),
    ]);
    expect(runRules).toHaveBeenCalledWith({
      mode: 'incremental',
      dryRun: false,
      userIds: ['owner_1'],
      providers: ['GOOGLE_WORKSPACE'],
      startedAt: expect.any(String),
    });
  });

  it('runs HubSpot provider metrics rules as the HubSpot worker module', async () => {
    const modules: SyncModules = {
      hubspot: true,
      slack: false,
      coda: false,
      google: false,
      providerRules: false,
      visitorFunnelEnrichment: false,
      analytics: false,
      automations: false,
      healthChecks: false,
    };

    const results = await runSync(mockPrisma, modules, {
      userIds: ['owner_1'],
    });

    expect(results).toEqual([
      expect.objectContaining({
        module: 'hubspot',
        success: true,
      }),
    ]);
    expect(runRules).toHaveBeenCalledWith({
      mode: 'incremental',
      dryRun: false,
      userIds: ['owner_1'],
      providers: ['HUBSPOT'],
      startedAt: expect.any(String),
    });
  });

  it('runs visitor funnel enrichment as a first-class worker module', async () => {
    const modules: SyncModules = {
      hubspot: false,
      slack: false,
      coda: false,
      google: false,
      providerRules: false,
      visitorFunnelEnrichment: true,
      analytics: false,
      automations: false,
      healthChecks: false,
    };

    const results = await runSync(mockPrisma, modules, {
      imladrisContext: {
        userId: 'owner_1',
        organizationId: 'org_1',
      },
    });

    expect(results).toEqual([
      expect.objectContaining({
        module: 'visitorFunnelEnrichment',
        success: true,
      }),
    ]);
    expect(runVisitorFunnelEnrichmentSyncs).toHaveBeenCalledWith({
      prisma: mockPrisma,
      imladrisContext: {
        userId: 'owner_1',
        organizationId: 'org_1',
      },
    });
  });

  it('derives visitor funnel Imladris context for worker syncs when no context is supplied', async () => {
    const modules: SyncModules = {
      hubspot: false,
      slack: false,
      coda: false,
      google: false,
      providerRules: false,
      visitorFunnelEnrichment: true,
      analytics: false,
      automations: false,
      healthChecks: false,
    };

    const results = await runSync(mockPrisma, modules);

    expect(results).toEqual([
      expect.objectContaining({
        module: 'visitorFunnelEnrichment',
        success: true,
      }),
    ]);
    expect(mockIntegrationConnectionFindMany).toHaveBeenCalledWith({
      distinct: ['userId'],
      where: { status: { in: ['CONNECTED', 'ERROR'] } },
      select: { userId: true },
    });
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: 'owner_1' },
      select: { organizationId: true },
    });
    expect(runVisitorFunnelEnrichmentSyncs).toHaveBeenCalledWith({
      prisma: mockPrisma,
      imladrisContext: {
        userId: 'owner_1',
        organizationId: 'org_1',
      },
    });
  });

  it('marks visitor funnel enrichment failed when a skipped pull is not ok', async () => {
    vi.mocked(runVisitorFunnelEnrichmentSyncs).mockResolvedValueOnce([
      {
        provider: 'unify',
        mode: 'pull',
        ok: false,
        skipped: true,
        reason: 'Missing UNIFY_DATA_API_KEY/UNIFY_API_KEY or UNIFY_FUNNEL_OBJECT_NAME.',
        pulled: 0,
        stored: 0,
        accepted: 0,
        updatedAfter: null,
      },
    ] as never);

    const results = await runSync(mockPrisma, {
      hubspot: false,
      slack: false,
      coda: false,
      google: false,
      providerRules: false,
      visitorFunnelEnrichment: true,
      analytics: false,
      automations: false,
      healthChecks: false,
    });

    expect(results).toEqual([
      expect.objectContaining({
        module: 'visitorFunnelEnrichment',
        success: false,
        error:
          'unify enrichment sync failed: Missing UNIFY_DATA_API_KEY/UNIFY_API_KEY or UNIFY_FUNNEL_OBJECT_NAME.',
      }),
    ]);
  });

  it('marks analytics module failed when refresh or materialization results are degraded', async () => {
    vi.mocked(runAnalyticsSync).mockResolvedValueOnce({
      refresh: {
        usersProcessed: 1,
        refreshCount: 4,
        failureCount: 2,
        completedAt: '2026-06-01T12:00:00.000Z',
      },
      pruning: { deleted: 0 },
      imladris: [
        {
          userId: 'owner_1',
          organizationId: 'org_1',
          periodStart: '2026-05-02T12:00:00.000Z',
          periodEnd: '2026-06-01T12:00:00.000Z',
          metrics: [],
          error: 'canonical write failed',
        },
      ],
    } as never);

    const results = await runSync(mockPrisma, {
      hubspot: false,
      slack: false,
      coda: false,
      google: false,
      providerRules: false,
      visitorFunnelEnrichment: false,
      analytics: true,
      automations: false,
      healthChecks: false,
    });

    expect(results).toEqual([
      expect.objectContaining({
        module: 'analytics',
        success: false,
        error: expect.stringContaining('analytics: 2 provider refresh failures'),
      }),
    ]);
    expect(results[0].error).toContain('imladris: 1 canonical materialization failure');
  });

  it('marks analytics module failed when growth-control pruning fails', async () => {
    vi.mocked(runAnalyticsSync).mockResolvedValueOnce({
      refresh: {
        usersProcessed: 1,
        refreshCount: 4,
        failureCount: 0,
        completedAt: '2026-06-10T12:00:00.000Z',
      },
      pruning: { deleted: 0 },
      imladris: [],
      lineagePruning: { error: 'lineage prune exploded' },
      outboxPruning: { error: 'outbox prune exploded' },
    } as never);

    const results = await runSync(mockPrisma, {
      hubspot: false,
      slack: false,
      coda: false,
      google: false,
      providerRules: false,
      visitorFunnelEnrichment: false,
      analytics: true,
      automations: false,
      healthChecks: false,
    });

    expect(results).toEqual([
      expect.objectContaining({
        module: 'analytics',
        success: false,
        error:
          'lineage_pruning: lineage prune exploded; outbox_pruning: outbox prune exploded',
      }),
    ]);
  });

  it('marks provider-rules module failed when user-level rule runs fail', async () => {
    vi.mocked(runRules).mockResolvedValueOnce({
      executedRules: 2,
      skippedLegacyTaskRules: 0,
      bootstrappedProviderRules: 0,
      failedUserRuns: 1,
    } as never);

    const results = await runSync(mockPrisma, {
      hubspot: false,
      slack: false,
      coda: false,
      google: false,
      providerRules: true,
      visitorFunnelEnrichment: false,
      analytics: false,
      automations: false,
      healthChecks: false,
    });

    expect(results).toEqual([
      expect.objectContaining({
        module: 'providerRules',
        success: false,
        error: 'rules: 1 user run failed',
      }),
    ]);
  });

  it('marks provider-rules module failed when individual provider rules fail', async () => {
    vi.mocked(runRules).mockResolvedValueOnce({
      executedRules: 2,
      skippedLegacyTaskRules: 0,
      bootstrappedProviderRules: 0,
      failedUserRuns: 0,
      failedRules: 1,
      failedRuleErrors: [
        {
          ruleId: 'rule_stripe',
          ruleKey: 'stripe_revenue_sync',
          provider: 'STRIPE',
          userId: 'owner_1',
          error: 'Stripe API timed out',
        },
      ],
    } as never);

    const results = await runSync(mockPrisma, {
      hubspot: false,
      slack: false,
      coda: false,
      google: false,
      providerRules: true,
      visitorFunnelEnrichment: false,
      analytics: false,
      automations: false,
      healthChecks: false,
    });

    expect(results).toEqual([
      expect.objectContaining({
        module: 'providerRules',
        success: false,
      }),
    ]);
    expect(results[0].error).toContain('rules: 1 provider rule failed');
    expect(results[0].error).toContain('stripe_revenue_sync: Stripe API timed out');
  });

  it('marks health-check module failed when per-user health checks are degraded', async () => {
    vi.mocked(runHealthChecksSync).mockResolvedValueOnce([
      {
        userId: 'owner_1',
        checked: 0,
        ok: 0,
        failed: 1,
        results: [],
        error: 'health database write failed',
      },
    ] as never);

    const results = await runSync(mockPrisma, {
      hubspot: false,
      slack: false,
      coda: false,
      google: false,
      providerRules: false,
      visitorFunnelEnrichment: false,
      analytics: false,
      automations: false,
      healthChecks: true,
    });

    expect(results).toEqual([
      expect.objectContaining({
        module: 'healthChecks',
        success: false,
        error: 'health: 1 user health check failed',
      }),
    ]);
  });
});
