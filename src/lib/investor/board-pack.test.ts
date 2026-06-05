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
                    capturedAt: "2026-05-31T18:00:00.000Z",
                  },
                  {
                    sourceKey: "hubspot",
                    rawRecordId: "raw_hubspot_deal_internal",
                    capturedAt: "2026-05-31T17:00:00.000Z",
                  },
                  {
                    sourceKey: "stripe",
                    rawRecordId: "raw_stripe_subscription_internal_2",
                    capturedAt: "2026-06-01T08:00:00.000Z",
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
          sourceLineageCount: 3,
          latestSourceCapturedAt: "2026-06-01T08:00:00.000Z",
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
                sourceLineageCount: 3,
                latestSourceCapturedAt: "2026-06-01T08:00:00.000Z",
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

  it("surfaces the full operating driver set for investor ARR quality review", async () => {
    const { loadInvestorBoardPack } = await import("@/lib/investor/board-pack");
    const metric = (key: string, label: string, value: number, unit: string) => ({
      key,
      label,
      value,
      priorValue: null,
      delta: null,
      unit,
      trust: "fresh",
      asOf: "2026-05-31T00:00:00.000Z",
      warnings: [],
    });

    prismaMock.ceoReportRun.findFirst.mockResolvedValue({
      id: "run-operating-drivers",
      packSlug: "investor-update",
      packName: "Investor Update",
      generatedAt: new Date("2026-06-01T12:00:00.000Z"),
      deterministicNotes: [],
      markdown: "# Investor Update",
      csv: "Metric,Value",
      slideJson: {
        title: "Investor Update",
        sections: [
          {
            title: "Operating Metrics",
            metrics: [
              metric("revenue.mrr", "MRR", 10000, "currency"),
              metric("revenue.arr", "ARR", 120000, "currency"),
              metric("revenue.subscription_revenue", "Subscription Revenue", 9500, "currency"),
              metric("revenue.services_revenue", "Services Revenue", 3200, "currency"),
              metric("revenue.active_subscriptions", "Active Subscriptions", 21, "count"),
              metric("revenue.customer_count", "Customers", 18, "count"),
              metric("finance.cash_balance", "Cash Balance", 800000, "currency"),
              metric("finance.cash_runway_months", "Runway", 14.2, "months"),
              metric("finance.net_burn", "Net Burn", 57000, "currency"),
              metric("finance.expenses", "Expenses", 82000, "currency"),
              metric("finance.gross_margin", "Gross Margin", 71.4, "percent"),
              metric("sales.qualified_pipeline", "Pipeline", 450000, "currency"),
              metric("sales.demos", "Demos", 27, "count"),
              metric("marketing.website_traffic", "Website Traffic", 12400, "count"),
              metric("marketing.conversion_rate", "Conversion Rate", 3.8, "percent"),
              metric("marketing.pipeline_efficiency", "Pipeline Efficiency", 4.2, "ratio"),
              metric("product.activation_rate", "Activation Rate", 62, "percent"),
              metric("customer_success.customer_health", "Customer Health", 84, "score"),
              metric("customer_success.customer_activity", "Customer Activity", 133, "count"),
              metric("customer_success.churn_rate", "Churn Rate", 2.1, "percent"),
              metric("customer_success.retention_rate", "Retention Rate", 97.9, "percent"),
              metric("customer_success.retention_risk", "Retention Risk", 11, "score"),
            ],
          },
        ],
        notes: [],
      },
      boardFinalAt: new Date("2026-06-01T13:00:00.000Z"),
      boardFinalOverrideReason: null,
    });

    const payload = await loadInvestorBoardPack({
      userId: "investor-1",
      organizationId: "org-1",
    });

    expect(payload.pack?.healthyArrGrowth.drivers).toEqual([
      { id: "runway", label: "Runway", value: 14.2, unit: "months", status: "strong" },
      { id: "cash_balance", label: "Cash Balance", value: 800000, unit: "currency", status: "strong" },
      { id: "net_burn", label: "Net Burn", value: 57000, unit: "currency", status: "strong" },
      { id: "expenses", label: "Expenses", value: 82000, unit: "currency", status: "strong" },
      { id: "gross_margin", label: "Gross Margin", value: 71.4, unit: "percent", status: "strong" },
      {
        id: "subscription_revenue",
        label: "Subscription Revenue",
        value: 9500,
        unit: "currency",
        status: "strong",
      },
      { id: "services_revenue", label: "Services Revenue", value: 3200, unit: "currency", status: "strong" },
      { id: "active_subscriptions", label: "Active Subscriptions", value: 21, unit: "count", status: "strong" },
      { id: "customer_count", label: "Customers", value: 18, unit: "count", status: "strong" },
      { id: "pipeline", label: "Pipeline", value: 450000, unit: "currency", status: "strong" },
      { id: "demos", label: "Demos", value: 27, unit: "count", status: "strong" },
      { id: "website_traffic", label: "Website Traffic", value: 12400, unit: "count", status: "strong" },
      { id: "conversion_rate", label: "Conversion Rate", value: 3.8, unit: "percent", status: "strong" },
      { id: "pipeline_efficiency", label: "Pipeline Efficiency", value: 4.2, unit: "ratio", status: "strong" },
      { id: "activation", label: "Activation", value: 62, unit: "percent", status: "strong" },
      { id: "customer_health", label: "Customer Health", value: 84, unit: "score", status: "strong" },
      { id: "customer_activity", label: "Customer Activity", value: 133, unit: "count", status: "strong" },
      { id: "churn_rate", label: "Churn Rate", value: 2.1, unit: "percent", status: "strong" },
      { id: "retention_rate", label: "Retention Rate", value: 97.9, unit: "percent", status: "strong" },
      { id: "retention_risk", label: "Retention Risk", value: 11, unit: "score", status: "strong" },
    ]);
    expect(payload.pack?.healthyArrGrowth.summary).toContain("margin, revenue mix, acquisition, activation, retention");
  });
});
