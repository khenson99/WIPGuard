import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const afterCallbacks: Array<() => void | Promise<void>> = [];

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((callback: () => void | Promise<void>) => {
      afterCallbacks.push(callback);
    }),
  };
});

vi.mock("@/lib/analytics/refresh-runner", () => ({
  runAnalyticsRefresh: vi.fn(),
}));

vi.mock("@/lib/analytics/snapshots", () => ({
  pruneAnalyticsSnapshots: vi.fn(),
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

vi.mock("@/lib/integrations/health-checks", () => ({
  runIntegrationHealthChecks: vi.fn(),
}));

vi.mock("@/lib/retention/pipeline", () => ({
  materializeRetentionCurrent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

describe("POST /api/cron/sync", () => {
  const originalCronSecret = process.env.CRON_SYNC_SECRET;
  const originalIntegrationOwner = process.env.INTEGRATION_OWNER_USER_ID;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    afterCallbacks.length = 0;
    process.env.CRON_SYNC_SECRET = "cron-secret";
    process.env.INTEGRATION_OWNER_USER_ID = "owner_1";
  });

  it("skips visitor funnel work when the funnel Prisma models are unavailable", async () => {
    const { runAnalyticsRefresh } = await import("@/lib/analytics/refresh-runner");
    const { pruneAnalyticsSnapshots } = await import("@/lib/analytics/snapshots");
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
    const { runIntegrationHealthChecks } = await import(
      "@/lib/integrations/health-checks"
    );
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
    vi.mocked(runAnalyticsRefresh).mockResolvedValue({ ok: true } as never);
    vi.mocked(runRules).mockResolvedValue({ ok: true } as never);
    vi.mocked(runIntegrationHealthChecks).mockResolvedValue({ ok: true } as never);
    vi.mocked(pruneAnalyticsSnapshots).mockResolvedValue({ deleted: 0 } as never);
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
    expect(body.retention).toMatchObject({ attempted: 1, materialized: 1 });
    expect(materializeRetentionCurrent).toHaveBeenCalledWith({
      id: "owner_1",
      organizationId: "org_1",
    });
  });

  it("queues heavy sync work in the background by default", async () => {
    const { runAnalyticsRefresh } = await import("@/lib/analytics/refresh-runner");
    const { pruneAnalyticsSnapshots } = await import("@/lib/analytics/snapshots");
    const { getVisitorFunnelPrisma } = await import(
      "@/lib/analytics/visitor-funnel-availability"
    );
    const { runRules } = await import("@/lib/integrations/orchestrator");
    const {
      bestEffortMigrateConnectionsToOwner,
      bestEffortMigrateRulesToOwner,
      ensureIntegrationOwnerOrganizationId,
    } = await import("@/lib/integrations/ownership");
    const { runIntegrationHealthChecks } = await import(
      "@/lib/integrations/health-checks"
    );
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
    vi.mocked(runAnalyticsRefresh).mockResolvedValue({ ok: true } as never);
    vi.mocked(runRules).mockResolvedValue({ ok: true } as never);
    vi.mocked(runIntegrationHealthChecks).mockResolvedValue({ ok: true } as never);
    vi.mocked(pruneAnalyticsSnapshots).mockResolvedValue({ deleted: 0 } as never);
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
    expect(runAnalyticsRefresh).not.toHaveBeenCalled();
    expect(runRules).not.toHaveBeenCalled();
    expect(runIntegrationHealthChecks).not.toHaveBeenCalled();
    expect(pruneAnalyticsSnapshots).not.toHaveBeenCalled();

    await afterCallbacks[0]();

    expect(runAnalyticsRefresh).toHaveBeenCalledOnce();
    expect(runRules).toHaveBeenCalledOnce();
    expect(runIntegrationHealthChecks).toHaveBeenCalledOnce();
    expect(pruneAnalyticsSnapshots).toHaveBeenCalledOnce();
    expect(materializeRetentionCurrent).toHaveBeenCalledOnce();
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
