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

describe("integrations orchestrator (no-op)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns metadata with executedRules = 0", async () => {
    const result = await runRules({
      mode: "incremental",
      providers: [IntegrationProvider.GOOGLE_ADS],
      userIds: ["user_1"],
      dryRun: true,
      pageBudget: 3,
      startedAt: "2026-02-18T00:00:00.000Z",
    });

    expect(result).toEqual(
      expect.objectContaining({
        mode: "incremental",
        dryRun: true,
        startedAt: "2026-02-18T00:00:00.000Z",
        providers: [IntegrationProvider.GOOGLE_ADS],
        userIds: ["user_1"],
        pageBudget: 3,
        executedRules: 0,
      })
    );
    expect(result.finishedAt).toEqual(expect.any(String));
  });

  it("does not run rule engines or touch integration state", async () => {
    await runRules({
      mode: "incremental",
      providers: [IntegrationProvider.GOOGLE_ADS],
      dryRun: false,
      startedAt: "2026-02-18T00:00:00.000Z",
    });

    expect(runGmailCapture).not.toHaveBeenCalled();
    expect(runGoogleDriveCommentEscalation).not.toHaveBeenCalled();
    expect(runGoogleCalendarPrepFollowup).not.toHaveBeenCalled();
    expect(runProviderMetricsRule).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.integrationConnection.findMany).not.toHaveBeenCalled();
    expect(prisma.integrationConnection.updateMany).not.toHaveBeenCalled();
    expect(prisma.integrationRule.updateMany).not.toHaveBeenCalled();
  });
});
