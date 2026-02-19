import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationProvider } from "@/generated/prisma/client";
import { runRules } from "@/lib/integrations/orchestrator";
import { prisma } from "@/lib/prisma";
import { runGmailCapture } from "@/lib/integrations/google-gmail-capture";
import { runGoogleDriveCommentEscalation } from "@/lib/integrations/google-drive-comment-escalation";
import { runGoogleCalendarPrepFollowup } from "@/lib/integrations/google-calendar-followup";
import { runProviderMetricsRule } from "@/lib/integrations/provider-metrics-sync";

vi.mock("@/lib/integrations/google-gmail-capture", () => ({
  runGmailCapture: vi.fn(),
}));
vi.mock("@/lib/integrations/google-drive-comment-escalation", () => ({
  runGoogleDriveCommentEscalation: vi.fn(),
}));
vi.mock("@/lib/integrations/google-calendar-followup", () => ({
  runGoogleCalendarPrepFollowup: vi.fn(),
}));
vi.mock("@/lib/integrations/hubspot-stage-checklist", () => ({
  runHubSpotStageChecklist: vi.fn(),
}));
vi.mock("@/lib/integrations/hubspot-customer-signals", () => ({
  runHubSpotCustomerSignalAutomation: vi.fn(),
}));
vi.mock("@/lib/integrations/hubspot-risk-intervention", () => ({
  runHubSpotRiskIntervention: vi.fn(),
}));
vi.mock("@/lib/integrations/hubspot-bidirectional-sync", () => ({
  runHubSpotBidirectionalSync: vi.fn(),
}));
vi.mock("@/lib/integrations/slack-status-sync", () => ({
  runSlackStatusSync: vi.fn(),
}));
vi.mock("@/lib/integrations/slack-unanswered-requests", () => ({
  runSlackUnansweredDetector: vi.fn(),
}));
vi.mock("@/lib/integrations/coda-row-sync", () => ({
  runCodaRowSync: vi.fn(),
}));
vi.mock("@/lib/integrations/coda-dependency-gates", () => ({
  runCodaDependencyGateAutomation: vi.fn(),
}));
vi.mock("@/lib/integrations/coda-decision-actions", () => ({
  runCodaDecisionActionConverter: vi.fn(),
}));
vi.mock("@/lib/integrations/provider-metrics-sync", async () => {
  const actual = await vi.importActual<object>("@/lib/integrations/provider-metrics-sync");
  return {
    ...actual,
    runProviderMetricsRule: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    integrationConnection: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    integrationRule: {
      updateMany: vi.fn(),
    },
  },
}));

describe("integrations orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(prisma.integrationConnection.findMany).mockResolvedValue([
      { userId: "user_1" },
    ] as unknown as Awaited<ReturnType<typeof prisma.integrationConnection.findMany>>);
    vi.mocked(prisma.integrationConnection.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.integrationRule.updateMany).mockResolvedValue({ count: 1 });

    vi.mocked(prisma.$queryRaw).mockImplementation(
      ((query: unknown, ...values: unknown[]) => {
        const sql = Array.isArray(query) ? query.join(" ") : String(query);
        if (sql.includes("pg_try_advisory_lock")) {
          return Promise.resolve([{ acquired: true }]);
        }
        if (sql.includes("pg_advisory_unlock")) {
          return Promise.resolve([{ unlocked: true }]);
        }
        return Promise.resolve([]);
      }) as typeof prisma.$queryRaw
    );

    vi.mocked(runGmailCapture).mockResolvedValue({
      ruleId: "gmail_rule",
      enabled: true,
      scannedThreads: 0,
      createdTasks: 0,
      dedupedThreads: 0,
      failedThreads: 0,
      cursor: {},
      tasks: [],
      errors: [],
    });
    vi.mocked(runGoogleDriveCommentEscalation).mockResolvedValue({
      ruleId: "drive_rule",
      enabled: true,
      scannedFiles: 0,
      scannedComments: 0,
      createdTasks: 0,
      reopenedTasks: 0,
      dedupedTasks: 0,
      failedTasks: 0,
      cursor: {},
      tasks: [],
      errors: [],
    });
    vi.mocked(runGoogleCalendarPrepFollowup).mockResolvedValue({
      ruleId: "calendar_rule",
      enabled: true,
      scannedEvents: 0,
      createdTasks: 0,
      dedupedTasks: 0,
      failedTasks: 0,
      cursor: {},
      tasks: [],
      errors: [],
    });
    vi.mocked(runProviderMetricsRule).mockResolvedValue({
      ruleId: "provider_rule",
      ruleKey: "google_ads_metrics_pull",
      provider: IntegrationProvider.GOOGLE_ADS,
      snapshotKey: "googleAds",
      dryRun: true,
      rangePreset: "30d",
      from: "2026-01-20",
      to: "2026-02-18",
      capturedAt: "2026-02-18T00:00:00.000Z",
    });
  });

  it("runs provider-filtered rules", async () => {
    const result = await runRules({
      mode: "incremental",
      providers: [IntegrationProvider.GOOGLE_ADS],
      dryRun: true,
      startedAt: "2026-02-18T00:00:00.000Z",
    });

    expect(result.executedRules).toBe(1);
    expect(runProviderMetricsRule).toHaveBeenCalledWith({
      userId: "user_1",
      ruleKey: "google_ads_metrics_pull",
      dryRun: true,
    });
  });

  it("respects pageBudget limits", async () => {
    const result = await runRules({
      mode: "incremental",
      providers: [IntegrationProvider.GOOGLE_WORKSPACE],
      dryRun: false,
      pageBudget: 2,
      startedAt: "2026-02-18T00:00:00.000Z",
    });

    expect(result.executedRules).toBe(2);
    expect(runGmailCapture).toHaveBeenCalledTimes(1);
    expect(runGoogleDriveCommentEscalation).toHaveBeenCalledTimes(1);
    expect(runGoogleCalendarPrepFollowup).not.toHaveBeenCalled();
  });

  it("skips execution when a rule advisory lock is unavailable", async () => {
    vi.mocked(prisma.$queryRaw).mockImplementation(
      ((query: unknown, ...values: unknown[]) => {
        const sql = Array.isArray(query) ? query.join(" ") : String(query);
        if (sql.includes("pg_try_advisory_lock")) {
          const lockKey = String(values[0] ?? "");
          if (lockKey.includes("google_ads_metrics_pull")) {
            return Promise.resolve([{ acquired: false }]);
          }
          return Promise.resolve([{ acquired: true }]);
        }
        if (sql.includes("pg_advisory_unlock")) {
          return Promise.resolve([{ unlocked: true }]);
        }
        return Promise.resolve([]);
      }) as typeof prisma.$queryRaw
    );

    const result = await runRules({
      mode: "incremental",
      providers: [IntegrationProvider.GOOGLE_ADS],
      dryRun: false,
      startedAt: "2026-02-18T00:00:00.000Z",
    });

    expect(result.executedRules).toBe(0);
    expect(runProviderMetricsRule).not.toHaveBeenCalled();
  });

  it("marks auth failures as connection errors", async () => {
    vi.mocked(runProviderMetricsRule).mockRejectedValueOnce(new Error("Token expired"));

    const result = await runRules({
      mode: "incremental",
      providers: [IntegrationProvider.GOOGLE_ADS],
      dryRun: false,
      startedAt: "2026-02-18T00:00:00.000Z",
    });

    expect(result.executedRules).toBe(1);
    expect(prisma.integrationConnection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ provider: IntegrationProvider.GOOGLE_ADS }),
        data: expect.objectContaining({ status: "ERROR" }),
      })
    );
  });
});
