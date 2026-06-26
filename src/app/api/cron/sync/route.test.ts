import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const afterCallbacks: Array<() => void | Promise<void>> = [];
const mockIntegrationConnectionFindMany = vi.fn();
const mockUserFindUnique = vi.fn();

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((callback: () => void | Promise<void>) => {
      afterCallbacks.push(callback);
    }),
  };
});

vi.mock("@/lib/sync/analytics", () => ({
  runAnalyticsSync: vi.fn(),
}));

vi.mock("@/lib/sync/health-checks", () => ({
  runHealthChecksSync: vi.fn(),
}));

vi.mock("@/lib/analytics/provider-enrichment-sync", () => ({
  runVisitorFunnelEnrichmentSyncs: vi.fn(),
}));

vi.mock("@/lib/analytics/visitor-funnel", () => ({
  buildVisitorFunnelEnrichmentStatus: vi.fn(),
}));

vi.mock("@/lib/analytics/visitor-funnel-enrichment-alert-delivery", () => ({
  enqueueVisitorFunnelEnrichmentAlertNotifications: vi.fn(),
}));

vi.mock("@/lib/analytics/visitor-funnel-enrichment-alerts", () => ({
  instrumentVisitorFunnelEnrichmentAlerts: vi.fn(),
}));

vi.mock("@/lib/analytics/visitor-funnel-availability", () => ({
  getVisitorFunnelPrisma: vi.fn(),
  VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON:
    "Visitor funnel Prisma models are unavailable in this deployment.",
}));

vi.mock("@/lib/integrations/orchestrator", () => ({
  runRules: vi.fn(),
}));

vi.mock("@/lib/integrations/ownership", () => ({
  bestEffortMigrateConnectionsToOwner: vi.fn(),
  bestEffortMigrateRulesToOwner: vi.fn(),
  ensureIntegrationOwnerOrganizationId: vi.fn(),
}));

vi.mock("@/lib/retention/pipeline", () => ({
  materializeRetentionCurrent: vi.fn(),
}));

// The advisory lock is exercised directly in src/lib/sync/__tests__/sync-lock.test.ts.
// Here it is a transparent pass-through so these tests cover the route's sync
// behaviour without needing a real pg pool.
vi.mock("@/lib/sync/sync-lock", () => ({
  withSyncAdvisoryLock: async (fn: () => Promise<unknown>) => ({
    ran: true,
    result: await fn(),
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      findMany: (...args: unknown[]) => mockIntegrationConnectionFindMany(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
  },
}));

describe("POST /api/cron/sync", () => {
  const originalCronSecret = process.env.CRON_SYNC_SECRET;
  const originalIntegrationOwner = process.env.INTEGRATION_OWNER_USER_ID;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    afterCallbacks.length = 0;
    mockIntegrationConnectionFindMany.mockResolvedValue([]);
    mockUserFindUnique.mockResolvedValue({ organizationId: "org_1" });
    process.env.CRON_SYNC_SECRET = "cron-secret";
    process.env.INTEGRATION_OWNER_USER_ID = "owner_1";
  });

  it("skips visitor funnel work when the funnel Prisma models are unavailable", async () => {
    const { runAnalyticsSync } = await import("@/lib/sync/analytics");
    const { runVisitorFunnelEnrichmentSyncs } = await import(
      "@/lib/analytics/provider-enrichment-sync"
    );
    const { buildVisitorFunnelEnrichmentStatus } = await import(
      "@/lib/analytics/visitor-funnel"
    );
    const { enqueueVisitorFunnelEnrichmentAlertNotifications } = await import(
      "@/lib/analytics/visitor-funnel-enrichment-alert-delivery"
    );
    const { getVisitorFunnelPrisma } = await import(
      "@/lib/analytics/visitor-funnel-availability"
    );
    const { runRules } = await import("@/lib/integrations/orchestrator");
    const {
      bestEffortMigrateConnectionsToOwner,
      bestEffortMigrateRulesToOwner,
      ensureIntegrationOwnerOrganizationId,
    } = await import("@/lib/integrations/ownership");
    const { runHealthChecksSync } = await import("@/lib/sync/health-checks");
    const { materializeRetentionCurrent } = await import("@/lib/retention/pipeline");

    vi.mocked(getVisitorFunnelPrisma).mockReturnValue(null);
    vi.mocked(bestEffortMigrateConnectionsToOwner).mockResolvedValue({
      migrated: 0,
      skipped: 0,
    } as never);
    vi.mocked(bestEffortMigrateRulesToOwner).mockResolvedValue({
      migrated: 0,
      skipped: 0,
    } as never);
    vi.mocked(runAnalyticsSync).mockResolvedValue({
      refresh: { ok: true },
      pruning: { deleted: 0 },
    } as never);
    vi.mocked(runRules).mockResolvedValue({ ok: true } as never);
    vi.mocked(runHealthChecksSync).mockResolvedValue([{ ok: true }] as never);
    vi.mocked(ensureIntegrationOwnerOrganizationId).mockResolvedValue("org_1" as never);
    vi.mocked(materializeRetentionCurrent).mockResolvedValue(undefined as never);

    const { POST } = await import("@/app/api/cron/sync/route");
    const request = new Request("http://localhost/api/cron/sync?wait=1", {
      method: "POST",
      headers: { "x-cron-secret": "cron-secret" },
    }) as unknown as NextRequest;

    const response = await POST(request);
    const body = (await response.json()) as {
      ok: boolean;
      visitorFunnelEnrichment: Array<{ skipped: boolean; reason: string | null }>;
      visitorFunnelEnrichmentHealth: { alerts: unknown[]; providers: unknown[] };
      visitorFunnelEnrichmentNotifications: { skippedReason: string | null };
      retention: { attempted: number; materialized: number };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.visitorFunnelEnrichment).toHaveLength(3);
    expect(body.visitorFunnelEnrichment.every((result) => result.skipped)).toBe(true);
    expect(body.visitorFunnelEnrichmentNotifications.skippedReason).toBe(
      "Visitor funnel Prisma models are unavailable in this deployment.",
    );
    expect(body.visitorFunnelEnrichmentHealth).toEqual({
      alerts: [],
      providers: [],
    });
    expect(runVisitorFunnelEnrichmentSyncs).not.toHaveBeenCalled();
    expect(buildVisitorFunnelEnrichmentStatus).not.toHaveBeenCalled();
    expect(enqueueVisitorFunnelEnrichmentAlertNotifications).not.toHaveBeenCalled();
    expect(runAnalyticsSync).toHaveBeenCalledWith(
      expect.objectContaining({
        rangePresets: ["7d", "30d", "90d"],
      })
    );
    expect(body.retention).toMatchObject({ attempted: 1, materialized: 1 });
    expect(materializeRetentionCurrent).toHaveBeenCalledWith({
      id: "owner_1",
      organizationId: "org_1",
    });
  });

  it("queues heavy sync work in the background by default", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { runAnalyticsSync } = await import("@/lib/sync/analytics");
    const { getVisitorFunnelPrisma } = await import(
      "@/lib/analytics/visitor-funnel-availability"
    );
    const { runRules } = await import("@/lib/integrations/orchestrator");
    const {
      bestEffortMigrateConnectionsToOwner,
      bestEffortMigrateRulesToOwner,
      ensureIntegrationOwnerOrganizationId,
    } = await import("@/lib/integrations/ownership");
    const { runHealthChecksSync } = await import("@/lib/sync/health-checks");
    const { materializeRetentionCurrent } = await import("@/lib/retention/pipeline");

    vi.mocked(getVisitorFunnelPrisma).mockReturnValue(null);
    vi.mocked(bestEffortMigrateConnectionsToOwner).mockResolvedValue({
      migrated: 0,
      skipped: 0,
    } as never);
    vi.mocked(bestEffortMigrateRulesToOwner).mockResolvedValue({
      migrated: 0,
      skipped: 0,
    } as never);
    vi.mocked(runAnalyticsSync).mockResolvedValue({
      refresh: { ok: true },
      pruning: { deleted: 0 },
    } as never);
    vi.mocked(runRules).mockResolvedValue({ ok: true } as never);
    vi.mocked(runHealthChecksSync).mockResolvedValue([
      {
        userId: "owner_1",
        checked: 0,
        ok: 0,
        failed: 1,
        results: [],
        error: "health database write failed",
      },
    ] as never);
    vi.mocked(ensureIntegrationOwnerOrganizationId).mockResolvedValue("org_1" as never);
    vi.mocked(materializeRetentionCurrent).mockResolvedValue(undefined as never);

    const { POST } = await import("@/app/api/cron/sync/route");
    const request = new Request("http://localhost/api/cron/sync", {
      method: "POST",
      headers: { "x-cron-secret": "cron-secret" },
    }) as unknown as NextRequest;

    const response = await POST(request);
    const body = (await response.json()) as {
      ok: boolean;
      queued: boolean;
      mode: string;
      userIds: string[];
    };

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      ok: true,
      queued: true,
      mode: "background",
      userIds: ["owner_1"],
    });
    expect(afterCallbacks).toHaveLength(1);
    expect(runAnalyticsSync).not.toHaveBeenCalled();
    expect(runRules).not.toHaveBeenCalled();
    expect(runHealthChecksSync).not.toHaveBeenCalled();

    await afterCallbacks[0]();

    expect(runAnalyticsSync).toHaveBeenCalledOnce();
    expect(runRules).toHaveBeenCalledOnce();
    expect(runHealthChecksSync).toHaveBeenCalledOnce();
    expect(materializeRetentionCurrent).toHaveBeenCalledOnce();
    expect(vi.mocked(runRules).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(runAnalyticsSync).mock.invocationCallOrder[0],
    );
    expect(vi.mocked(runHealthChecksSync).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(runRules).mock.invocationCallOrder[0],
    );
    expect(vi.mocked(materializeRetentionCurrent).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(runHealthChecksSync).mock.invocationCallOrder[0],
    );
    expect(consoleError).toHaveBeenCalledWith(
      "POST /api/cron/sync background degraded:",
      {
        failures: ["health: 1 user health check failed"],
      },
    );
    consoleError.mockRestore();
  });

  it("passes owner context to visitor funnel enrichment for Imladris raw records", async () => {
    const { runAnalyticsSync } = await import("@/lib/sync/analytics");
    const { runVisitorFunnelEnrichmentSyncs } = await import(
      "@/lib/analytics/provider-enrichment-sync"
    );
    const { buildVisitorFunnelEnrichmentStatus } = await import(
      "@/lib/analytics/visitor-funnel"
    );
    const { enqueueVisitorFunnelEnrichmentAlertNotifications } = await import(
      "@/lib/analytics/visitor-funnel-enrichment-alert-delivery"
    );
    const { instrumentVisitorFunnelEnrichmentAlerts } = await import(
      "@/lib/analytics/visitor-funnel-enrichment-alerts"
    );
    const { getVisitorFunnelPrisma } = await import(
      "@/lib/analytics/visitor-funnel-availability"
    );
    const { runRules } = await import("@/lib/integrations/orchestrator");
    const {
      bestEffortMigrateConnectionsToOwner,
      bestEffortMigrateRulesToOwner,
      ensureIntegrationOwnerOrganizationId,
    } = await import("@/lib/integrations/ownership");
    const { runHealthChecksSync } = await import("@/lib/sync/health-checks");
    const { materializeRetentionCurrent } = await import("@/lib/retention/pipeline");

    const funnelPrisma = { funnelEnrichmentSignal: { findMany: vi.fn() } };
    vi.mocked(getVisitorFunnelPrisma).mockReturnValue(funnelPrisma as never);
    vi.mocked(runVisitorFunnelEnrichmentSyncs).mockResolvedValue([
      {
        provider: "unify",
        mode: "pull",
        ok: true,
        skipped: false,
        reason: null,
        pulled: 1,
        stored: 1,
        accepted: 1,
        updatedAfter: "2026-03-08T09:30:00.000Z",
      },
    ] as never);
    vi.mocked(buildVisitorFunnelEnrichmentStatus).mockResolvedValue([] as never);
    vi.mocked(instrumentVisitorFunnelEnrichmentAlerts).mockReturnValue({
      alerts: [],
      logs: [],
      metrics: [],
    } as never);
    vi.mocked(enqueueVisitorFunnelEnrichmentAlertNotifications).mockResolvedValue({
      enabled: false,
      ownerUserId: "owner_1",
      slackChannelId: null,
      minIntervalHours: 24,
      bucketStart: null,
      enqueued: 0,
      skippedReason: "disabled",
    } as never);
    vi.mocked(bestEffortMigrateConnectionsToOwner).mockResolvedValue({
      migrated: 0,
      skipped: 0,
    } as never);
    vi.mocked(bestEffortMigrateRulesToOwner).mockResolvedValue({
      migrated: 0,
      skipped: 0,
    } as never);
    vi.mocked(ensureIntegrationOwnerOrganizationId).mockResolvedValue("org_1" as never);
    vi.mocked(runAnalyticsSync).mockResolvedValue({
      refresh: { ok: true },
      pruning: { deleted: 0 },
    } as never);
    vi.mocked(runRules).mockResolvedValue({ ok: true } as never);
    vi.mocked(runHealthChecksSync).mockResolvedValue([{ ok: true }] as never);
    vi.mocked(materializeRetentionCurrent).mockResolvedValue(undefined as never);

    const { POST } = await import("@/app/api/cron/sync/route");
    const request = new Request("http://localhost/api/cron/sync?wait=1", {
      method: "POST",
      headers: { "x-cron-secret": "cron-secret" },
    }) as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(runVisitorFunnelEnrichmentSyncs).toHaveBeenCalledWith({
      prisma: expect.any(Object),
      imladrisContext: {
        userId: "owner_1",
        organizationId: "org_1",
      },
    });
  });

  it("surfaces fulfilled partial sync failures in the cron response", async () => {
    const { runAnalyticsSync } = await import("@/lib/sync/analytics");
    const { getVisitorFunnelPrisma } = await import(
      "@/lib/analytics/visitor-funnel-availability"
    );
    const { runRules } = await import("@/lib/integrations/orchestrator");
    const {
      bestEffortMigrateConnectionsToOwner,
      bestEffortMigrateRulesToOwner,
      ensureIntegrationOwnerOrganizationId,
    } = await import("@/lib/integrations/ownership");
    const { runHealthChecksSync } = await import("@/lib/sync/health-checks");
    const { materializeRetentionCurrent } = await import("@/lib/retention/pipeline");

    vi.mocked(getVisitorFunnelPrisma).mockReturnValue(null);
    vi.mocked(bestEffortMigrateConnectionsToOwner).mockResolvedValue({
      migrated: 0,
      skipped: 0,
    } as never);
    vi.mocked(bestEffortMigrateRulesToOwner).mockResolvedValue({
      migrated: 0,
      skipped: 0,
    } as never);
    vi.mocked(ensureIntegrationOwnerOrganizationId).mockResolvedValue("org_1" as never);
    vi.mocked(runAnalyticsSync).mockResolvedValue({
      refresh: {
        usersProcessed: 1,
        refreshCount: 4,
        failureCount: 2,
        completedAt: "2026-06-01T12:00:00.000Z",
      },
      pruning: { deleted: 0 },
      imladris: [
        {
          userId: "owner_1",
          organizationId: "org_1",
          periodStart: "2026-05-02T12:00:00.000Z",
          periodEnd: "2026-06-01T12:00:00.000Z",
          metrics: [],
          error: "canonical write failed",
        },
      ],
    } as never);
    vi.mocked(runRules).mockResolvedValue({
      mode: "incremental",
      dryRun: false,
      startedAt: "2026-06-01T12:00:00.000Z",
      finishedAt: "2026-06-01T12:00:01.000Z",
      providers: [],
      userIds: ["owner_1"],
      pageBudget: null,
      executedRules: 2,
      skippedLegacyTaskRules: 0,
      bootstrappedProviderRules: 0,
      failedUserRuns: 1,
      failedRules: 1,
      failedRuleErrors: [
        {
          ruleId: "rule_stripe",
          ruleKey: "stripe_revenue_sync",
          provider: "STRIPE",
          userId: "owner_1",
          error: "Stripe API timed out",
        },
      ],
    } as never);
    vi.mocked(runHealthChecksSync).mockResolvedValue([
      {
        userId: "owner_1",
        checked: 0,
        ok: 0,
        failed: 1,
        results: [],
        error: "health database write failed",
      },
    ] as never);
    vi.mocked(materializeRetentionCurrent).mockResolvedValue(undefined as never);

    const { POST } = await import("@/app/api/cron/sync/route");
    const request = new Request("http://localhost/api/cron/sync?wait=1", {
      method: "POST",
      headers: { "x-cron-secret": "cron-secret" },
    }) as unknown as NextRequest;

    const response = await POST(request);
    const body = (await response.json()) as {
      ok: boolean;
      failures: string[];
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.failures).toEqual(
      expect.arrayContaining([
        "analytics: 2 provider refresh failures",
        "imladris: 1 canonical materialization failure",
        "rules: 1 user run failed",
        "rules: 1 provider rule failed (stripe_revenue_sync: Stripe API timed out)",
        "health: 1 user health check failed",
      ]),
    );
  });

  it("runs scheduled health recovery for users with only ERROR integration rows", async () => {
    delete process.env.INTEGRATION_OWNER_USER_ID;

    const { runAnalyticsSync } = await import("@/lib/sync/analytics");
    const { getVisitorFunnelPrisma } = await import(
      "@/lib/analytics/visitor-funnel-availability"
    );
    const { runRules } = await import("@/lib/integrations/orchestrator");
    const { runHealthChecksSync } = await import("@/lib/sync/health-checks");
    const { materializeRetentionCurrent } = await import("@/lib/retention/pipeline");

    mockIntegrationConnectionFindMany.mockImplementation(async (args: {
      where?: { status?: string | { in?: string[] } };
    }) => {
      const status = args.where?.status;
      const allowed = typeof status === "string" ? [status] : status?.in ?? [];
      return allowed.includes("ERROR") ? [{ userId: "recovering_user" }] : [];
    });
    vi.mocked(getVisitorFunnelPrisma).mockReturnValue(null);
    vi.mocked(runAnalyticsSync).mockResolvedValue({
      refresh: { ok: true },
      pruning: { deleted: 0 },
      imladris: [],
    } as never);
    vi.mocked(runRules).mockResolvedValue({ ok: true } as never);
    vi.mocked(runHealthChecksSync).mockResolvedValue([
      {
        userId: "recovering_user",
        checked: 1,
        ok: 1,
        failed: 0,
        results: [],
      },
    ] as never);
    vi.mocked(materializeRetentionCurrent).mockResolvedValue(undefined as never);

    const { POST } = await import("@/app/api/cron/sync/route");
    const request = new Request("http://localhost/api/cron/sync?wait=1", {
      method: "POST",
      headers: { "x-cron-secret": "cron-secret" },
    }) as unknown as NextRequest;

    const response = await POST(request);
    const body = (await response.json()) as {
      ok: boolean;
      userIds?: string[];
      message?: string;
    };

    expect(response.status).toBe(200);
    expect(body.message).toBeUndefined();
    expect(body.userIds).toEqual(["recovering_user"]);
    expect(mockIntegrationConnectionFindMany).toHaveBeenCalledWith({
      distinct: ["userId"],
      where: { status: { in: ["CONNECTED", "ERROR"] } },
      select: { userId: true },
    });
    expect(runHealthChecksSync).toHaveBeenCalledWith({
      prisma: expect.any(Object),
      userIds: ["recovering_user"],
    });
  });

  afterEach(() => {
    if (originalCronSecret == null) {
      delete process.env.CRON_SYNC_SECRET;
    } else {
      process.env.CRON_SYNC_SECRET = originalCronSecret;
    }

    if (originalIntegrationOwner == null) {
      delete process.env.INTEGRATION_OWNER_USER_ID;
    } else {
      process.env.INTEGRATION_OWNER_USER_ID = originalIntegrationOwner;
    }
  });
});
