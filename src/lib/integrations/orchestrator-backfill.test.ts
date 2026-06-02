import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationProvider } from "@/generated/prisma/client";

const prismaMock = vi.hoisted(() => ({
  integrationRule: {
    findMany: vi.fn(),
  },
  integrationConnection: {
    findMany: vi.fn(),
  },
}));

const runProviderMetricsRuleMock = vi.hoisted(() => vi.fn());
const ensureProviderMetricsRulesForConnectedProvidersMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/request-context", () => ({
  runWithContextAsync: vi.fn(async (_context, callback) => callback()),
}));

vi.mock("@/lib/integrations/ownership", () => ({
  resolveIntegrationOwnerUserId: (userId: string) => userId,
  resolveIntegrationOrganizationId: vi.fn(async () => "org_1"),
}));

vi.mock("@/lib/integrations/provider-metrics-sync", () => ({
  CODA_DOC_SYNC_RULE_KEY: "coda_doc_sync",
  GITHUB_PULL_REQUESTS_SYNC_RULE_KEY: "github_pull_requests_sync",
  GOOGLE_SEARCH_CONSOLE_SYNC_RULE_KEY: "google_search_console_sync",
  GOOGLE_WORKSPACE_ACTIVITY_SYNC_RULE_KEY: "google_workspace_activity_sync",
  GOOGLE_ANALYTICS_TRAFFIC_SYNC_RULE_KEY: "google_analytics_traffic_sync",
  GOOGLE_ADS_METRICS_RULE_KEY: "google_ads_metrics_pull",
  HUBSPOT_PIPELINE_SYNC_RULE_KEY: "hubspot_pipeline_sync",
  LINEAR_ISSUES_SYNC_RULE_KEY: "linear_issues_sync",
  META_ADS_METRICS_RULE_KEY: "meta_ads_metrics_pull",
  META_INSTAGRAM_METRICS_RULE_KEY: "meta_instagram_metrics_pull",
  META_PAGE_METRICS_RULE_KEY: "meta_page_metrics_pull",
  MERCURY_CASHFLOW_SYNC_RULE_KEY: "mercury_cashflow_sync",
  POSTHOG_PRODUCT_EVENTS_SYNC_RULE_KEY: "posthog_product_events_sync",
  PYLON_CONVERSATION_SYNC_RULE_KEY: "pylon_conversation_sync",
  REDDIT_ADS_METRICS_RULE_KEY: "reddit_ads_metrics_pull",
  SEMRUSH_DOMAIN_SYNC_RULE_KEY: "semrush_domain_sync",
  SLACK_ACTIVITY_SYNC_RULE_KEY: "slack_activity_sync",
  STRIPE_REVENUE_SYNC_RULE_KEY: "stripe_revenue_sync",
  WEBFLOW_SITE_SYNC_RULE_KEY: "webflow_site_sync",
  ensureProviderMetricsRulesForConnectedProviders: ensureProviderMetricsRulesForConnectedProvidersMock,
  runProviderMetricsRule: runProviderMetricsRuleMock,
}));

describe("integration orchestrator backfill mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.integrationConnection.findMany.mockResolvedValue([]);
    ensureProviderMetricsRulesForConnectedProvidersMock.mockResolvedValue({ created: 0 });
  });

  it("passes backfill mode through to provider metrics rules", async () => {
    prismaMock.integrationRule.findMany.mockResolvedValue([
      {
        id: "rule_1",
        key: "stripe_revenue_sync",
        provider: IntegrationProvider.STRIPE,
        enabled: true,
        userId: "user_1",
      },
    ]);
    runProviderMetricsRuleMock.mockResolvedValue({ ok: true });

    const { runRules } = await import("@/lib/integrations/orchestrator");

    const result = await runRules({
      mode: "backfill",
      providers: [IntegrationProvider.STRIPE],
      userIds: ["user_1"],
      dryRun: false,
      startedAt: "2026-06-01T12:00:00.000Z",
    });

    expect(result.executedRules).toBe(1);
    expect(runProviderMetricsRuleMock).toHaveBeenCalledWith({
      userId: "user_1",
      ruleKey: "stripe_revenue_sync",
      dryRun: false,
      mode: "backfill",
    });
  });

  it("reports individual provider rule failures without hiding the degraded sync", async () => {
    prismaMock.integrationRule.findMany.mockResolvedValue([
      {
        id: "rule_stripe",
        key: "stripe_revenue_sync",
        provider: IntegrationProvider.STRIPE,
        enabled: true,
        userId: "user_1",
      },
    ]);
    runProviderMetricsRuleMock.mockRejectedValue(new Error("Stripe API timed out"));

    const { runRules } = await import("@/lib/integrations/orchestrator");

    const result = await runRules({
      mode: "incremental",
      providers: [IntegrationProvider.STRIPE],
      userIds: ["user_1"],
      dryRun: false,
      startedAt: "2026-06-01T12:00:00.000Z",
    });

    expect(result.executedRules).toBe(1);
    expect(result.failedRules).toBe(1);
    expect(result.failedRuleErrors).toEqual([
      {
        ruleId: "rule_stripe",
        ruleKey: "stripe_revenue_sync",
        provider: IntegrationProvider.STRIPE,
        userId: "user_1",
        error: "Stripe API timed out",
      },
    ]);
  });

  it("reports provider rules as degraded when raw Imladris ingestion only accepts some records", async () => {
    prismaMock.integrationRule.findMany.mockResolvedValue([
      {
        id: "rule_stripe",
        key: "stripe_revenue_sync",
        provider: IntegrationProvider.STRIPE,
        enabled: true,
        userId: "user_1",
      },
    ]);
    runProviderMetricsRuleMock.mockResolvedValue({
      rawRecordCount: 3,
      acceptedRawRecordCount: 2,
    });

    const { runRules } = await import("@/lib/integrations/orchestrator");

    const result = await runRules({
      mode: "incremental",
      providers: [IntegrationProvider.STRIPE],
      userIds: ["user_1"],
      dryRun: false,
      startedAt: "2026-06-01T12:00:00.000Z",
    });

    expect(result.executedRules).toBe(1);
    expect(result.failedRules).toBe(1);
    expect(result.failedRuleErrors).toEqual([
      {
        ruleId: "rule_stripe",
        ruleKey: "stripe_revenue_sync",
        provider: IntegrationProvider.STRIPE,
        userId: "user_1",
        error: "Imladris raw ingestion accepted 2/3 records",
      },
    ]);
  });

  it("reports provider rules as degraded when success metadata persistence fails", async () => {
    prismaMock.integrationRule.findMany.mockResolvedValue([
      {
        id: "rule_stripe",
        key: "stripe_revenue_sync",
        provider: IntegrationProvider.STRIPE,
        enabled: true,
        userId: "user_1",
      },
    ]);
    runProviderMetricsRuleMock.mockResolvedValue({
      rawRecordCount: 3,
      acceptedRawRecordCount: 3,
      statusPersistenceErrors: [
        "integrationConnection status persistence failed: connection lastSyncedAt write failed",
      ],
    });

    const { runRules } = await import("@/lib/integrations/orchestrator");

    const result = await runRules({
      mode: "incremental",
      providers: [IntegrationProvider.STRIPE],
      userIds: ["user_1"],
      dryRun: false,
      startedAt: "2026-06-01T12:00:00.000Z",
    });

    expect(result.executedRules).toBe(1);
    expect(result.failedRules).toBe(1);
    expect(result.failedRuleErrors).toEqual([
      {
        ruleId: "rule_stripe",
        ruleKey: "stripe_revenue_sync",
        provider: IntegrationProvider.STRIPE,
        userId: "user_1",
        error: "integrationConnection status persistence failed: connection lastSyncedAt write failed",
      },
    ]);
  });

  it("executes Imladris development provider metric rules", async () => {
    prismaMock.integrationRule.findMany.mockResolvedValue([
      {
        id: "rule_posthog",
        key: "posthog_product_events_sync",
        provider: IntegrationProvider.POSTHOG,
        enabled: true,
        userId: "user_1",
      },
      {
        id: "rule_linear",
        key: "linear_issues_sync",
        provider: IntegrationProvider.LINEAR,
        enabled: true,
        userId: "user_1",
      },
      {
        id: "rule_github",
        key: "github_pull_requests_sync",
        provider: IntegrationProvider.GITHUB,
        enabled: true,
        userId: "user_1",
      },
    ]);
    runProviderMetricsRuleMock.mockResolvedValue({ ok: true });

    const { runRules } = await import("@/lib/integrations/orchestrator");

    const result = await runRules({
      mode: "incremental",
      providers: [
        IntegrationProvider.POSTHOG,
        IntegrationProvider.LINEAR,
        IntegrationProvider.GITHUB,
      ],
      userIds: ["user_1"],
      dryRun: false,
      startedAt: "2026-06-01T12:00:00.000Z",
    });

    expect(result.executedRules).toBe(3);
    for (const ruleKey of [
      "posthog_product_events_sync",
      "linear_issues_sync",
      "github_pull_requests_sync",
    ]) {
      expect(runProviderMetricsRuleMock).toHaveBeenCalledWith({
        userId: "user_1",
        ruleKey,
        dryRun: false,
        mode: "incremental",
      });
    }
  });

  it("executes SEMrush provider metric rules", async () => {
    prismaMock.integrationRule.findMany.mockResolvedValue([
      {
        id: "rule_semrush",
        key: "semrush_domain_sync",
        provider: IntegrationProvider.SEMRUSH,
        enabled: true,
        userId: "user_1",
      },
    ]);
    runProviderMetricsRuleMock.mockResolvedValue({ ok: true });

    const { runRules } = await import("@/lib/integrations/orchestrator");

    const result = await runRules({
      mode: "incremental",
      providers: [IntegrationProvider.SEMRUSH],
      userIds: ["user_1"],
      dryRun: false,
      startedAt: "2026-06-01T12:00:00.000Z",
    });

    expect(result.executedRules).toBe(1);
    expect(runProviderMetricsRuleMock).toHaveBeenCalledWith({
      userId: "user_1",
      ruleKey: "semrush_domain_sync",
      dryRun: false,
      mode: "incremental",
    });
  });

  it("executes Google Analytics provider metric rules", async () => {
    prismaMock.integrationRule.findMany.mockResolvedValue([
      {
        id: "rule_ga",
        key: "google_analytics_traffic_sync",
        provider: IntegrationProvider.GOOGLE_ANALYTICS,
        enabled: true,
        userId: "user_1",
      },
    ]);
    runProviderMetricsRuleMock.mockResolvedValue({ ok: true });

    const { runRules } = await import("@/lib/integrations/orchestrator");

    const result = await runRules({
      mode: "incremental",
      providers: [IntegrationProvider.GOOGLE_ANALYTICS],
      userIds: ["user_1"],
      dryRun: false,
      startedAt: "2026-06-01T12:00:00.000Z",
    });

    expect(result.executedRules).toBe(1);
    expect(runProviderMetricsRuleMock).toHaveBeenCalledWith({
      userId: "user_1",
      ruleKey: "google_analytics_traffic_sync",
      dryRun: false,
      mode: "incremental",
    });
  });

  it("executes Google Search Console provider metric rules", async () => {
    prismaMock.integrationRule.findMany.mockResolvedValue([
      {
        id: "rule_gsc",
        key: "google_search_console_sync",
        provider: IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
        enabled: true,
        userId: "user_1",
      },
    ]);
    runProviderMetricsRuleMock.mockResolvedValue({ ok: true });

    const { runRules } = await import("@/lib/integrations/orchestrator");

    const result = await runRules({
      mode: "incremental",
      providers: [IntegrationProvider.GOOGLE_SEARCH_CONSOLE],
      userIds: ["user_1"],
      dryRun: false,
      startedAt: "2026-06-01T12:00:00.000Z",
    });

    expect(result.executedRules).toBe(1);
    expect(runProviderMetricsRuleMock).toHaveBeenCalledWith({
      userId: "user_1",
      ruleKey: "google_search_console_sync",
      dryRun: false,
      mode: "incremental",
    });
  });

  it("executes HubSpot provider metric rules", async () => {
    prismaMock.integrationRule.findMany.mockResolvedValue([
      {
        id: "rule_hubspot",
        key: "hubspot_pipeline_sync",
        provider: IntegrationProvider.HUBSPOT,
        enabled: true,
        userId: "user_1",
      },
    ]);
    runProviderMetricsRuleMock.mockResolvedValue({ ok: true });

    const { runRules } = await import("@/lib/integrations/orchestrator");

    const result = await runRules({
      mode: "incremental",
      providers: [IntegrationProvider.HUBSPOT],
      userIds: ["user_1"],
      dryRun: false,
      startedAt: "2026-06-01T12:00:00.000Z",
    });

    expect(result.executedRules).toBe(1);
    expect(runProviderMetricsRuleMock).toHaveBeenCalledWith({
      userId: "user_1",
      ruleKey: "hubspot_pipeline_sync",
      dryRun: false,
      mode: "incremental",
    });
  });

  it("executes Slack provider metric rules", async () => {
    prismaMock.integrationRule.findMany.mockResolvedValue([
      {
        id: "rule_slack",
        key: "slack_activity_sync",
        provider: IntegrationProvider.SLACK,
        enabled: true,
        userId: "user_1",
      },
    ]);
    runProviderMetricsRuleMock.mockResolvedValue({ ok: true });

    const { runRules } = await import("@/lib/integrations/orchestrator");

    const result = await runRules({
      mode: "incremental",
      providers: [IntegrationProvider.SLACK],
      userIds: ["user_1"],
      dryRun: false,
      startedAt: "2026-06-01T12:00:00.000Z",
    });

    expect(result.executedRules).toBe(1);
    expect(runProviderMetricsRuleMock).toHaveBeenCalledWith({
      userId: "user_1",
      ruleKey: "slack_activity_sync",
      dryRun: false,
      mode: "incremental",
    });
  });

  it("executes Google Workspace provider metric rules", async () => {
    prismaMock.integrationRule.findMany.mockResolvedValue([
      {
        id: "rule_google_workspace",
        key: "google_workspace_activity_sync",
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
        enabled: true,
        userId: "user_1",
      },
    ]);
    runProviderMetricsRuleMock.mockResolvedValue({ ok: true });

    const { runRules } = await import("@/lib/integrations/orchestrator");

    const result = await runRules({
      mode: "incremental",
      providers: [IntegrationProvider.GOOGLE_WORKSPACE],
      userIds: ["user_1"],
      dryRun: false,
      startedAt: "2026-06-01T12:00:00.000Z",
    });

    expect(result.executedRules).toBe(1);
    expect(runProviderMetricsRuleMock).toHaveBeenCalledWith({
      userId: "user_1",
      ruleKey: "google_workspace_activity_sync",
      dryRun: false,
      mode: "incremental",
    });
  });

  it("executes Webflow provider metric rules", async () => {
    prismaMock.integrationRule.findMany.mockResolvedValue([
      {
        id: "rule_webflow",
        key: "webflow_site_sync",
        provider: IntegrationProvider.WEBFLOW,
        enabled: true,
        userId: "user_1",
      },
    ]);
    runProviderMetricsRuleMock.mockResolvedValue({ ok: true });

    const { runRules } = await import("@/lib/integrations/orchestrator");

    const result = await runRules({
      mode: "incremental",
      providers: [IntegrationProvider.WEBFLOW],
      userIds: ["user_1"],
      dryRun: false,
      startedAt: "2026-06-01T12:00:00.000Z",
    });

    expect(result.executedRules).toBe(1);
    expect(runProviderMetricsRuleMock).toHaveBeenCalledWith({
      userId: "user_1",
      ruleKey: "webflow_site_sync",
      dryRun: false,
      mode: "incremental",
    });
  });

  it("discovers recoverable users and bootstraps provider metric rules before scheduled runs", async () => {
    prismaMock.integrationConnection.findMany.mockResolvedValue([{ userId: "user_1" }]);
    prismaMock.integrationRule.findMany.mockResolvedValueOnce([
      {
        id: "rule_1",
        key: "stripe_revenue_sync",
        provider: IntegrationProvider.STRIPE,
        enabled: true,
        userId: "user_1",
      },
    ]);
    ensureProviderMetricsRulesForConnectedProvidersMock.mockResolvedValue({ created: 1 });
    runProviderMetricsRuleMock.mockResolvedValue({ ok: true });

    const { runRules } = await import("@/lib/integrations/orchestrator");

    const result = await runRules({
      mode: "incremental",
      providers: [IntegrationProvider.STRIPE],
      dryRun: false,
      startedAt: "2026-06-01T12:00:00.000Z",
    });

    expect(prismaMock.integrationConnection.findMany).toHaveBeenCalledWith({
      distinct: ["userId"],
      where: { status: { in: ["CONNECTED", "ERROR"] } },
      select: { userId: true },
    });
    expect(ensureProviderMetricsRulesForConnectedProvidersMock).toHaveBeenCalledWith({
      userId: "user_1",
      providers: [IntegrationProvider.STRIPE],
    });
    expect(runProviderMetricsRuleMock).toHaveBeenCalledWith({
      userId: "user_1",
      ruleKey: "stripe_revenue_sync",
      dryRun: false,
      mode: "incremental",
    });
    expect(result.executedRules).toBe(1);
    expect(result.bootstrappedProviderRules).toBe(1);
  });

  it("bootstraps newly connected providers even when other enabled provider rules already exist", async () => {
    prismaMock.integrationConnection.findMany.mockResolvedValue([{ userId: "user_1" }]);
    prismaMock.integrationRule.findMany
      .mockResolvedValueOnce([
        {
          provider: IntegrationProvider.STRIPE,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "rule_stripe",
          key: "stripe_revenue_sync",
          provider: IntegrationProvider.STRIPE,
          enabled: true,
          userId: "user_1",
        },
        {
          id: "rule_linear",
          key: "linear_issues_sync",
          provider: IntegrationProvider.LINEAR,
          enabled: true,
          userId: "user_1",
        },
      ]);
    ensureProviderMetricsRulesForConnectedProvidersMock.mockResolvedValue({ created: 1 });
    runProviderMetricsRuleMock.mockResolvedValue({ ok: true });

    const { runRules } = await import("@/lib/integrations/orchestrator");

    const result = await runRules({
      mode: "incremental",
      dryRun: false,
      startedAt: "2026-06-01T12:00:00.000Z",
    });

    expect(ensureProviderMetricsRulesForConnectedProvidersMock).toHaveBeenCalledWith({
      userId: "user_1",
    });
    expect(prismaMock.integrationRule.findMany).toHaveBeenLastCalledWith({
      where: {
        userId: "user_1",
        enabled: true,
      },
      orderBy: [{ updatedAt: "desc" }],
    });
    expect(runProviderMetricsRuleMock).toHaveBeenCalledWith({
      userId: "user_1",
      ruleKey: "linear_issues_sync",
      dryRun: false,
      mode: "incremental",
    });
    expect(result.executedRules).toBe(2);
    expect(result.bootstrappedProviderRules).toBe(1);
  });

  it("continues processing later users when one user's provider bootstrap fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    ensureProviderMetricsRulesForConnectedProvidersMock
      .mockRejectedValueOnce(new Error("provider rule bootstrap failed"))
      .mockResolvedValueOnce({ created: 0 });
    prismaMock.integrationRule.findMany.mockResolvedValueOnce([
      {
        id: "rule_user_2",
        key: "stripe_revenue_sync",
        provider: IntegrationProvider.STRIPE,
        enabled: true,
        userId: "user_2",
      },
    ]);
    runProviderMetricsRuleMock.mockResolvedValue({ ok: true });

    const { runRules } = await import("@/lib/integrations/orchestrator");

    const result = await runRules({
      mode: "incremental",
      providers: [IntegrationProvider.STRIPE],
      userIds: ["user_1", "user_2"],
      dryRun: false,
      startedAt: "2026-06-01T12:00:00.000Z",
    });

    expect(result.failedUserRuns).toBe(1);
    expect(result.executedRules).toBe(1);
    expect(ensureProviderMetricsRulesForConnectedProvidersMock).toHaveBeenCalledTimes(2);
    expect(runProviderMetricsRuleMock).toHaveBeenCalledWith({
      userId: "user_2",
      ruleKey: "stripe_revenue_sync",
      dryRun: false,
      mode: "incremental",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "integration.orchestrator.user_failed",
      expect.objectContaining({
        userId: "user_1",
        providers: [IntegrationProvider.STRIPE],
        error: "provider rule bootstrap failed",
      }),
    );
    consoleError.mockRestore();
  });
});
