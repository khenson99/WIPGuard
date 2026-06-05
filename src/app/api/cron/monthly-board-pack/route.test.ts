import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/ceo/service", () => ({
  createMonthlyInvestorReportRun: vi.fn(),
}));

vi.mock("@/lib/integrations/ownership", () => ({
  ensureIntegrationOwnerOrganizationId: vi.fn(),
}));

describe("POST /api/cron/monthly-board-pack", () => {
  const originalCronSecret = process.env.CRON_SYNC_SECRET;
  const originalIntegrationSecret = process.env.INTEGRATION_SYNC_SECRET;
  const originalOwnerUserId = process.env.INTEGRATION_OWNER_USER_ID;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.CRON_SYNC_SECRET = "cron-secret";
    process.env.INTEGRATION_SYNC_SECRET = "";
    process.env.INTEGRATION_OWNER_USER_ID = "owner-1";
  });

  afterEach(() => {
    process.env.CRON_SYNC_SECRET = originalCronSecret;
    process.env.INTEGRATION_SYNC_SECRET = originalIntegrationSecret;
    process.env.INTEGRATION_OWNER_USER_ID = originalOwnerUserId;
  });

  it("requires the cron secret", async () => {
    const { createMonthlyInvestorReportRun } = await import("@/lib/ceo/service");
    const { POST } = await import("@/app/api/cron/monthly-board-pack/route");

    const response = await POST(
      new NextRequest("http://localhost/api/cron/monthly-board-pack", { method: "POST" }),
    );

    expect(response.status).toBe(401);
    expect(createMonthlyInvestorReportRun).not.toHaveBeenCalled();
  });

  it("creates or reuses the monthly investor update without approving it", async () => {
    const { createMonthlyInvestorReportRun } = await import("@/lib/ceo/service");
    const { ensureIntegrationOwnerOrganizationId } = await import("@/lib/integrations/ownership");
    const { POST } = await import("@/app/api/cron/monthly-board-pack/route");

    vi.mocked(ensureIntegrationOwnerOrganizationId).mockResolvedValue("org-1" as never);
    vi.mocked(createMonthlyInvestorReportRun).mockResolvedValue({
      created: true,
      periodStart: "2026-06-01T00:00:00.000Z",
      periodEnd: "2026-07-01T00:00:00.000Z",
      run: {
        id: "run-1",
        packSlug: "investor-update",
        packName: "Investor Update",
        generatedAt: "2026-06-15T09:00:00.000Z",
        metrics: [],
        deterministicNotes: [],
        markdown: "# Investor Update",
        csv: "Metric,Value",
        slideJson: {
          title: "Investor Update",
          generatedAt: "2026-06-15T09:00:00.000Z",
          readiness: {
            status: "not_board_final",
            ready: false,
            summary: "Not board-final: 1 readiness gate is failing.",
            failingGates: [],
          },
          sections: [],
          notes: [],
        },
        boardFinal: null,
      },
    } as never);

    const response = await POST(
      new NextRequest("http://localhost/api/cron/monthly-board-pack", {
        method: "POST",
        headers: { "x-cron-secret": "cron-secret" },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(ensureIntegrationOwnerOrganizationId).toHaveBeenCalledWith("owner-1");
    expect(createMonthlyInvestorReportRun).toHaveBeenCalledWith({
      userId: "owner-1",
      organizationId: "org-1",
    });
    expect(payload).toMatchObject({
      ok: true,
      created: true,
      run: {
        id: "run-1",
        packSlug: "investor-update",
        readiness: { status: "not_board_final" },
        boardFinal: null,
      },
    });
    expect(payload.run.metrics).toBeUndefined();
    expect(payload.run.markdown).toBeUndefined();
  });
});
