import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  ceoReportRun: {
    findFirst: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

describe("loadInvestorBoardPack", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns a safe empty state when no approved investor report exists", async () => {
    const { loadInvestorBoardPack } = await import("@/lib/investor/board-pack");
    prismaMock.ceoReportRun.findFirst.mockResolvedValue(null);

    const payload = await loadInvestorBoardPack({
      userId: "investor-1",
      organizationId: "org-1",
    });

    expect(prismaMock.ceoReportRun.findFirst).toHaveBeenCalledWith({
      where: {
        packSlug: "investor-update",
        boardFinalAt: { not: null },
        organizationId: "org-1",
      },
      orderBy: [{ boardFinalAt: "desc" }, { generatedAt: "desc" }],
      select: expect.any(Object),
    });
    expect(payload).toEqual({
      status: "empty",
      emptyState: {
        title: "No approved investor pack is available yet.",
        description: "An Arda admin must approve a board-final monthly pack before investors can view it.",
      },
      pack: null,
    });
  });

  it("returns a redacted approved investor pack", async () => {
    const { loadInvestorBoardPack } = await import("@/lib/investor/board-pack");
    prismaMock.ceoReportRun.findFirst.mockResolvedValue({
      id: "run-1",
      packSlug: "investor-update",
      packName: "Investor Update",
      generatedAt: new Date("2026-06-01T12:00:00.000Z"),
      deterministicNotes: ["MRR increased from approved canonical metrics."],
      markdown: "# Investor Update",
      csv: "Metric,Value",
      slideJson: {
        title: "Investor Update",
        generatedAt: null,
        readiness: {},
        sections: [
          {
            title: "Traction",
            metrics: [
              {
                key: "revenue.mrr",
                label: "MRR",
                value: 10000,
                priorValue: 9000,
                delta: 1000,
                unit: "currency",
                trust: "fresh",
                asOf: "2026-05-31T00:00:00.000Z",
                warnings: [],
                sourceLineage: [
                  {
                    sourceKey: "stripe",
                    rawRecordId: "raw_stripe_subscription_internal",
                  },
                  {
                    sourceKey: "hubspot",
                    rawRecordId: "raw_hubspot_deal_internal",
                  },
                  {
                    sourceKey: "stripe",
                    rawRecordId: "raw_stripe_subscription_internal_2",
                  },
                ],
              },
              {
                key: "revenue.arr",
                label: "ARR",
                value: 120000,
                priorValue: 108000,
                delta: 12000,
                unit: "currency",
                trust: "fresh",
                asOf: "2026-05-31T00:00:00.000Z",
                warnings: [],
              },
            ],
          },
        ],
        notes: [],
      },
      boardFinalAt: new Date("2026-06-01T13:00:00.000Z"),
      boardFinalApprovedById: "admin-1",
      boardFinalOverrideReason: null,
      metricPayload: [{ raw: "must not leak" }],
      aiDraft: "must not leak",
    });

    const payload = await loadInvestorBoardPack({
      userId: "investor-1",
      organizationId: "org-1",
    });

    expect(payload.status).toBe("ready");
    expect(payload.emptyState).toBeNull();
    expect(payload.pack).toEqual({
      id: "run-1",
      packSlug: "investor-update",
      packName: "Investor Update",
      generatedAt: "2026-06-01T12:00:00.000Z",
      deterministicNotes: ["MRR increased from approved canonical metrics."],
      healthyArrGrowth: {
        label: "Healthy ARR Growth",
        status: "watch",
        currentArr: 120000,
        currentMrr: 10000,
        netNewArr: 12000,
        summary:
          "Approved ARR/MRR growth interpreted through runway, burn, pipeline, activation, retention risk, and trust labels.",
        drivers: [
          { id: "runway", label: "Runway", value: null, unit: "months", status: "missing" },
          { id: "net_burn", label: "Net Burn", value: null, unit: "currency", status: "missing" },
          { id: "pipeline", label: "Pipeline", value: null, unit: "currency", status: "missing" },
          { id: "activation", label: "Activation", value: null, unit: "percent", status: "missing" },
          { id: "retention_risk", label: "Retention Risk", value: null, unit: "score", status: "missing" },
        ],
      },
      metrics: [
        {
          key: "revenue.mrr",
          label: "MRR",
          value: 10000,
          priorValue: 9000,
          delta: 1000,
          unit: "currency",
          trust: "fresh",
          asOf: "2026-05-31T00:00:00.000Z",
          warnings: [],
          sourceLineageKeys: ["stripe", "hubspot"],
        },
        {
          key: "revenue.arr",
          label: "ARR",
          value: 120000,
          priorValue: 108000,
          delta: 12000,
          unit: "currency",
          trust: "fresh",
          asOf: "2026-05-31T00:00:00.000Z",
          warnings: [],
        },
      ],
      markdown: "# Investor Update",
      csv: "Metric,Value",
      slideJson: {
        title: "Investor Update",
        generatedAt: null,
        readiness: {},
        sections: [
          {
            title: "Traction",
            metrics: [
              {
                key: "revenue.mrr",
                label: "MRR",
                value: 10000,
                priorValue: 9000,
                delta: 1000,
                unit: "currency",
                trust: "fresh",
                asOf: "2026-05-31T00:00:00.000Z",
                warnings: [],
                sourceLineageKeys: ["stripe", "hubspot"],
              },
              {
                key: "revenue.arr",
                label: "ARR",
                value: 120000,
                priorValue: 108000,
                delta: 12000,
                unit: "currency",
                trust: "fresh",
                asOf: "2026-05-31T00:00:00.000Z",
                warnings: [],
              },
            ],
          },
        ],
        notes: [],
      },
      boardFinal: {
        approvedAt: "2026-06-01T13:00:00.000Z",
        overrideReason: null,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("must not leak");
    expect(JSON.stringify(payload)).not.toContain("admin-1");
    expect(JSON.stringify(payload)).not.toContain("raw_stripe_subscription_internal");
  });
});
