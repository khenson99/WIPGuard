import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runRules } from "@/lib/integrations/orchestrator";
import { runSync } from "@/lib/sync/orchestrator";

const mockUserFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $name: "route-prisma",
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/integrations/orchestrator", () => ({
  runRules: vi.fn(),
}));

vi.mock("@/lib/sync/orchestrator", () => ({
  runSync: vi.fn(),
}));

describe("POST /api/integrations/sync", () => {
  const originalSecret = process.env.INTEGRATION_SYNC_SECRET;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    mockUserFindUnique.mockResolvedValue({ organizationId: "org_1" });
    process.env.INTEGRATION_SYNC_SECRET = "sync-secret";
  });

  afterEach(() => {
    if (originalSecret == null) {
      delete process.env.INTEGRATION_SYNC_SECRET;
    } else {
      process.env.INTEGRATION_SYNC_SECRET = originalSecret;
    }
  });

  it("surfaces degraded aggregate sync results when provider rules fail", async () => {
    vi.mocked(runRules).mockResolvedValueOnce({
      mode: "incremental",
      dryRun: false,
      startedAt: "2026-06-01T12:00:00.000Z",
      finishedAt: "2026-06-01T12:00:05.000Z",
      providers: ["STRIPE"],
      userIds: ["owner_1"],
      pageBudget: null,
      executedRules: 1,
      skippedLegacyTaskRules: 0,
      bootstrappedProviderRules: 0,
      failedUserRuns: 0,
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

    const { POST } = await import("@/app/api/integrations/sync/route");
    const response = await POST(
      new Request("http://localhost/api/integrations/sync", {
        method: "POST",
        headers: { "x-integration-sync-secret": "sync-secret" },
        body: JSON.stringify({
          mode: "incremental",
          providers: ["stripe"],
          userIds: ["owner_1"],
        }),
      }) as never,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: false,
      degraded: true,
      executedRules: 1,
      failedRules: 1,
      failedUserRuns: 0,
      failures: ["stripe_revenue_sync: Stripe API timed out"],
    });
  });

  it("runs the full sync orchestrator for unfiltered manual syncs", async () => {
    vi.mocked(runSync).mockResolvedValueOnce([
      { module: "providerRules", success: true, durationMs: 12 },
      { module: "visitorFunnelEnrichment", success: true, durationMs: 8 },
      { module: "analytics", success: true, durationMs: 20 },
      { module: "healthChecks", success: true, durationMs: 5 },
    ]);

    const { POST } = await import("@/app/api/integrations/sync/route");
    const response = await POST(
      new Request("http://localhost/api/integrations/sync", {
        method: "POST",
        headers: { "x-integration-sync-secret": "sync-secret" },
        body: JSON.stringify({
          userIds: ["owner_1", "owner_1"],
        }),
      }) as never,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      degraded: false,
      failures: [],
      modules: [
        { module: "providerRules", success: true },
        { module: "visitorFunnelEnrichment", success: true },
        { module: "analytics", success: true },
        { module: "healthChecks", success: true },
      ],
    });
    expect(runRules).not.toHaveBeenCalled();
    expect(runSync).toHaveBeenCalledWith(
      {
        $name: "route-prisma",
        user: {
          findUnique: expect.any(Function),
        },
      },
      {
        hubspot: false,
        slack: false,
        coda: false,
        google: false,
        providerRules: true,
        visitorFunnelEnrichment: true,
        analytics: true,
        automations: true,
        healthChecks: true,
      },
      {
        userIds: ["owner_1"],
        imladrisContext: {
          userId: "owner_1",
          organizationId: "org_1",
        },
      },
    );
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: "owner_1" },
      select: { organizationId: true },
    });
  });

  it("rejects invalid provider filters instead of widening the sync run", async () => {
    const { POST } = await import("@/app/api/integrations/sync/route");
    const response = await POST(
      new Request("http://localhost/api/integrations/sync", {
        method: "POST",
        headers: { "x-integration-sync-secret": "sync-secret" },
        body: JSON.stringify({
          providers: ["stripe", "definitely-not-a-provider"],
        }),
      }) as never,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "Invalid provider filter",
      invalidProviders: ["definitely-not-a-provider"],
    });
    expect(runRules).not.toHaveBeenCalled();
  });
});
