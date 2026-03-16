import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationProvider } from "@/generated/prisma/client";
import { runRules } from "@/lib/integrations/orchestrator";
import { resolveIntegrationOrganizationId } from "@/lib/integrations/ownership";
import { runProviderMetricsRule } from "@/lib/integrations/provider-metrics-sync";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/integrations/provider-metrics-sync", async () => {
  const actual = await vi.importActual<object>(
    "@/lib/integrations/provider-metrics-sync"
  );
  return {
    ...actual,
    runProviderMetricsRule: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationRule: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/integrations/ownership", () => ({
  resolveIntegrationOwnerUserId: vi.fn((userId: string) => userId),
  resolveIntegrationOrganizationId: vi.fn(),
}));

describe("integrations orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs enabled rules for the requested provider/user", async () => {
    vi.mocked(resolveIntegrationOrganizationId).mockResolvedValue("org_1");
    vi.mocked(prisma.integrationRule.findMany).mockResolvedValueOnce([
      {
        id: "r1",
        userId: "user_1",
        provider: IntegrationProvider.GOOGLE_ADS,
        key: "google_ads_metrics_pull",
        enabled: true,
        statusOverride: null,
        config: {},
        checkpoint: {},
        lastObservedAt: null,
        lastRunAt: null,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "r2",
        userId: "user_1",
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
        key: "legacy_workflow_rule",
        enabled: true,
        statusOverride: null,
        config: {},
        checkpoint: {},
        lastObservedAt: null,
        lastRunAt: null,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await runRules({
      mode: "incremental",
      userIds: ["user_1"],
      providers: [IntegrationProvider.GOOGLE_WORKSPACE, IntegrationProvider.GOOGLE_ADS],
      dryRun: true,
      pageBudget: 3,
      startedAt: "2026-02-18T00:00:00.000Z",
    });

    expect(result).toEqual(
      expect.objectContaining({
        mode: "incremental",
        dryRun: true,
        startedAt: "2026-02-18T00:00:00.000Z",
        providers: [IntegrationProvider.GOOGLE_WORKSPACE, IntegrationProvider.GOOGLE_ADS],
        userIds: ["user_1"],
        pageBudget: 3,
        executedRules: 1,
      })
    );
    expect(result.finishedAt).toEqual(expect.any(String));

    expect(runProviderMetricsRule).toHaveBeenCalledWith({
      userId: "user_1",
      ruleKey: "google_ads_metrics_pull",
      dryRun: true,
    });
  });

  it("skips retired workflow rules when enforcing pageBudget", async () => {
    vi.mocked(resolveIntegrationOrganizationId).mockResolvedValue("org_1");
    vi.mocked(prisma.integrationRule.findMany).mockResolvedValueOnce([
      {
        id: "r1",
        userId: "user_1",
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
        key: "legacy_workflow_rule",
        enabled: true,
        statusOverride: null,
        config: {},
        checkpoint: {},
        lastObservedAt: null,
        lastRunAt: null,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "r3",
        userId: "user_1",
        provider: IntegrationProvider.GOOGLE_ADS,
        key: "google_ads_metrics_pull",
        enabled: true,
        statusOverride: null,
        config: {},
        checkpoint: {},
        lastObservedAt: null,
        lastRunAt: null,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await runRules({
      mode: "incremental",
      providers: [IntegrationProvider.GOOGLE_WORKSPACE],
      dryRun: false,
      userIds: ["user_1"],
      pageBudget: 1,
      startedAt: "2026-02-18T00:00:00.000Z",
    });

    expect(runProviderMetricsRule).toHaveBeenCalledTimes(1);
    expect(runProviderMetricsRule).toHaveBeenCalledWith({
      userId: "user_1",
      ruleKey: "google_ads_metrics_pull",
      dryRun: false,
    });
  });

  it("skips users that do not have an organization context", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(resolveIntegrationOrganizationId).mockResolvedValue(null);

    const result = await runRules({
      mode: "incremental",
      providers: [IntegrationProvider.GOOGLE_WORKSPACE],
      dryRun: false,
      userIds: ["user_1"],
      startedAt: "2026-02-18T00:00:00.000Z",
    });

    expect(result.executedRules).toBe(0);
    expect(prisma.integrationRule.findMany).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "integration.orchestrator.user_skipped",
      expect.objectContaining({
        userId: "user_1",
        error: "Missing organizationId for integration run context",
      })
    );

    errorSpy.mockRestore();
  });
});
