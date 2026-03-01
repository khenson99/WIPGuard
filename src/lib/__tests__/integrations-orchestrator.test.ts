import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationProvider } from "@/generated/prisma/client";
import { runRules } from "@/lib/integrations/orchestrator";
import { runGmailCapture } from "@/lib/integrations/google-gmail-capture";
import { runGoogleDriveCommentEscalation } from "@/lib/integrations/google-drive-comment-escalation";
import { runGoogleCalendarPrepFollowup } from "@/lib/integrations/google-calendar-followup";
import { runProviderMetricsRule } from "@/lib/integrations/provider-metrics-sync";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/integrations/google-gmail-capture", () => ({
  runGmailCapture: vi.fn(),
}));
vi.mock("@/lib/integrations/google-drive-comment-escalation", () => ({
  runGoogleDriveCommentEscalation: vi.fn(),
}));
vi.mock("@/lib/integrations/google-calendar-followup", () => ({
  runGoogleCalendarPrepFollowup: vi.fn(),
}));
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

describe("integrations orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs enabled rules for the requested provider/user", async () => {
    vi.mocked(prisma.integrationRule.findMany).mockResolvedValueOnce([
      {
        id: "r1",
        userId: "user_1",
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
        key: "gmail_commitment_capture",
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

    const result = await runRules({
      mode: "incremental",
      userIds: ["user_1"],
      providers: [
        IntegrationProvider.GOOGLE_WORKSPACE,
        IntegrationProvider.GOOGLE_ADS,
      ],
      dryRun: true,
      pageBudget: 3,
      startedAt: "2026-02-18T00:00:00.000Z",
    });

    expect(result).toEqual(
      expect.objectContaining({
        mode: "incremental",
        dryRun: true,
        startedAt: "2026-02-18T00:00:00.000Z",
        providers: [
          IntegrationProvider.GOOGLE_WORKSPACE,
          IntegrationProvider.GOOGLE_ADS,
        ],
        userIds: ["user_1"],
        pageBudget: 3,
        executedRules: 2,
      })
    );
    expect(result.finishedAt).toEqual(expect.any(String));

    expect(runGmailCapture).toHaveBeenCalledWith({
      userId: "user_1",
      dryRun: true,
    });
    expect(runProviderMetricsRule).toHaveBeenCalledWith({
      userId: "user_1",
      ruleKey: "google_ads_metrics_pull",
      dryRun: true,
    });
  });

  it("respects pageBudget", async () => {
    vi.mocked(prisma.integrationRule.findMany).mockResolvedValueOnce([
      {
        id: "r1",
        userId: "user_1",
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
        key: "gmail_commitment_capture",
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
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
        key: "google_drive_comment_escalation",
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

    expect(runGmailCapture).toHaveBeenCalledTimes(1);
    expect(runGoogleDriveCommentEscalation).toHaveBeenCalledTimes(0);
    expect(runGoogleCalendarPrepFollowup).toHaveBeenCalledTimes(0);
  });
});
