import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

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
  hasVisitorFunnelPrismaModels: vi.fn(),
  VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON:
    "Visitor funnel Prisma models are unavailable in this deployment.",
}));

vi.mock("@/lib/integrations/orchestrator", () => ({
  runRules: vi.fn(),
}));

vi.mock("@/lib/integrations/ownership", () => ({
  bestEffortMigrateConnectionsToOwner: vi.fn(),
  bestEffortMigrateRulesToOwner: vi.fn(),
}));

vi.mock("@/lib/integrations/health-checks", () => ({
  runIntegrationHealthChecks: vi.fn(),
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
    const { hasVisitorFunnelPrismaModels } = await import(
      "@/lib/analytics/visitor-funnel-availability"
    );
    const { runRules } = await import("@/lib/integrations/orchestrator");
    const {
      bestEffortMigrateConnectionsToOwner,
      bestEffortMigrateRulesToOwner,
    } = await import("@/lib/integrations/ownership");
    const { runIntegrationHealthChecks } = await import(
      "@/lib/integrations/health-checks"
    );

    vi.mocked(hasVisitorFunnelPrismaModels).mockReturnValue(false);
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

    const { POST } = await import("@/app/api/cron/sync/route");
    const request = new Request("http://localhost/api/cron/sync", {
      method: "POST",
      headers: { "x-cron-secret": "cron-secret" },
    }) as unknown as NextRequest;

    const response = await POST(request);
    const body = (await response.json()) as {
      ok: boolean;
      visitorFunnelEnrichment: Array<{ skipped: boolean; reason: string | null }>;
      visitorFunnelEnrichmentHealth: { alerts: unknown[]; providers: unknown[] };
      visitorFunnelEnrichmentNotifications: { skippedReason: string | null };
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
