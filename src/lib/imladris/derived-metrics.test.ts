import { describe, expect, it, vi } from "vitest";
import {
  buildDerivedImladrisMetricRows,
  deriveArpa,
  deriveArrGrowthRate,
  deriveBurnMultiple,
  deriveHealthyArrGrowthScore,
  deriveNetNewArr,
  extractImladrisScalar,
  type DerivedMetricInput,
} from "@/lib/imladris/derived-metrics";
import { IMLADRIS_DERIVED_CALCULATION_VERSION } from "@/lib/imladris/catalog";
import { buildImladrisMetrics } from "@/lib/imladris/service";

describe("derived metric calculators", () => {
  it("computes net-new ARR as the period-over-period ARR delta", () => {
    expect(deriveNetNewArr(1_200_000, 1_000_000)).toBe(200_000);
    expect(deriveNetNewArr(900_000, 1_000_000)).toBe(-100_000);
    expect(deriveNetNewArr(1_200_000, null)).toBeNull();
    expect(deriveNetNewArr(null, 1_000_000)).toBeNull();
  });

  it("computes MoM ARR growth rate and refuses a non-positive base", () => {
    expect(deriveArrGrowthRate(1_100_000, 1_000_000)).toBe(10);
    expect(deriveArrGrowthRate(1_000_000, 0)).toBeNull();
    expect(deriveArrGrowthRate(1_000_000, -5)).toBeNull();
    expect(deriveArrGrowthRate(null, 1_000_000)).toBeNull();
  });

  it("computes burn multiple only when net-new ARR is positive", () => {
    expect(deriveBurnMultiple(300_000, 200_000)).toBe(1.5);
    // cash-flow positive: best possible efficiency
    expect(deriveBurnMultiple(-50_000, 200_000)).toBe(0);
    // shrinking or flat ARR: the ratio is undefined, not negative
    expect(deriveBurnMultiple(300_000, 0)).toBeNull();
    expect(deriveBurnMultiple(300_000, -100_000)).toBeNull();
    expect(deriveBurnMultiple(null, 200_000)).toBeNull();
  });

  it("computes ARPA from MRR and customer count", () => {
    expect(deriveArpa(100_000, 40)).toBe(2_500);
    expect(deriveArpa(100_000, 0)).toBeNull();
    expect(deriveArpa(null, 40)).toBeNull();
  });

  it("scores Healthy ARR Growth with deterministic clamped bands", () => {
    // growth 20% (capped at 15% → 40) + burn 1.5x (20.83) + NRR 110 (14.29) + runway 12mo (9)
    expect(
      deriveHealthyArrGrowthScore({
        arrGrowthRatePct: 20,
        netNewArr: 200_000,
        burnMultiple: 1.5,
        nrrPct: 110,
        runwayMonths: 12,
      }),
    ).toBe(84.12);

    // perfect score caps at 100
    expect(
      deriveHealthyArrGrowthScore({
        arrGrowthRatePct: 25,
        netNewArr: 500_000,
        burnMultiple: 0.5,
        nrrPct: 130,
        runwayMonths: 24,
      }),
    ).toBe(100);

    // shrinking ARR zeroes the growth and efficiency components
    expect(
      deriveHealthyArrGrowthScore({
        arrGrowthRatePct: -5,
        netNewArr: -50_000,
        burnMultiple: null,
        nrrPct: 85,
        runwayMonths: 3,
      }),
    ).toBe(0);

    // missing inputs make the score undefined rather than misleading
    expect(
      deriveHealthyArrGrowthScore({
        arrGrowthRatePct: 10,
        netNewArr: 100_000,
        burnMultiple: null,
        nrrPct: 110,
        runwayMonths: 12,
      }),
    ).toBeNull();
    expect(
      deriveHealthyArrGrowthScore({
        arrGrowthRatePct: null,
        netNewArr: null,
        burnMultiple: null,
        nrrPct: 110,
        runwayMonths: 12,
      }),
    ).toBeNull();
  });

  it("extracts scalars from canonical value payload shapes", () => {
    expect(extractImladrisScalar(42)).toBe(42);
    expect(extractImladrisScalar({ amount: 1200 })).toBe(1200);
    expect(extractImladrisScalar({ data: { value: "1.2m" } })).toBe(1_200_000);
    expect(extractImladrisScalar(null)).toBeNull();
    expect(extractImladrisScalar({ unrelated: true })).toBeNull();
  });
});

function input(partial: Partial<DerivedMetricInput> & { key: string }): DerivedMetricInput {
  return {
    status: "ready",
    confidence: 0.9,
    value: null,
    previousValue: null,
    periodStart: "2026-05-01T00:00:00.000Z",
    periodEnd: "2026-05-31T00:00:00.000Z",
    computedAt: "2026-06-01T00:00:00.000Z",
    ...partial,
  };
}

function inputsByKey(inputs: DerivedMetricInput[]): Map<string, DerivedMetricInput> {
  return new Map(inputs.map((metric) => [metric.key, metric]));
}

describe("buildDerivedImladrisMetricRows", () => {
  const healthySources = new Map<string, string>([
    ["stripe", "connected"],
    ["hubspot", "connected"],
    ["mercury", "connected"],
  ]);

  it("builds ready derived rows with values, formula, and lineage from healthy inputs", () => {
    const rows = buildDerivedImladrisMetricRows({
      inputsByKey: inputsByKey([
        input({ key: "revenue.arr", value: 1_200_000, previousValue: 1_000_000, confidence: 0.95 }),
        input({ key: "finance.net_burn", value: 300_000, confidence: 0.9 }),
        input({ key: "revenue.mrr", value: 100_000 }),
        input({ key: "revenue.customer_count", value: 40 }),
        input({ key: "customer_success.retention_rate", value: 110 }),
        input({ key: "finance.cash_runway_months", value: 12 }),
      ]),
      sourceStatuses: healthySources,
    });
    const byKey = new Map(rows.map((row) => [row.key, row]));

    const netNew = byKey.get("revenue.net_new_arr")!;
    expect(netNew.value).toBe(200_000);
    expect(netNew.status).toBe("ready");
    expect(netNew.confidence).toBe(0.95);
    expect(netNew.calculationVersion).toBe(IMLADRIS_DERIVED_CALCULATION_VERSION);
    expect(netNew.derivedFrom).toEqual(["revenue.arr"]);
    expect(netNew.formula).toContain("ARR");
    expect(netNew.periodEnd).toBe("2026-05-31T00:00:00.000Z");
    expect(netNew.sourceLineage).toEqual([
      { sourceKey: "stripe", status: "connected" },
      { sourceKey: "hubspot", status: "connected" },
    ]);

    expect(byKey.get("revenue.arr_growth_rate")!.value).toBe(20);
    // burn multiple confidence degrades to the weakest input (net burn at 0.9)
    expect(byKey.get("finance.burn_multiple")!.value).toBe(1.5);
    expect(byKey.get("finance.burn_multiple")!.confidence).toBe(0.9);
    expect(byKey.get("revenue.arpa")!.value).toBe(2_500);
    expect(byKey.get("company.healthy_arr_growth")!.value).toBe(84.12);
  });

  it("degrades status and confidence from unhealthy inputs with explicit warnings", () => {
    const rows = buildDerivedImladrisMetricRows({
      inputsByKey: inputsByKey([
        input({ key: "revenue.arr", value: 1_200_000, previousValue: 1_000_000, status: "stale", confidence: 0.5 }),
        input({ key: "finance.net_burn", value: 300_000 }),
      ]),
      sourceStatuses: new Map(),
    });
    const byKey = new Map(rows.map((row) => [row.key, row]));

    const netNew = byKey.get("revenue.net_new_arr")!;
    expect(netNew.value).toBe(200_000);
    expect(netNew.status).toBe("stale");
    expect(netNew.confidence).toBe(0.5);
    expect(netNew.warnings).toEqual(["Input metric ARR is stale."]);

    // the stale ARR input degrades every metric derived from it
    const burnMultiple = byKey.get("finance.burn_multiple")!;
    expect(burnMultiple.status).toBe("stale");

    // a fully absent input leaves the derived metric missing, not fabricated
    const arpa = byKey.get("revenue.arpa")!;
    expect(arpa.value).toBeNull();
    expect(arpa.status).toBe("missing");
    expect(arpa.confidence).toBe(0);
  });

  it("reports undefined values with a reason instead of fabricating them", () => {
    const rows = buildDerivedImladrisMetricRows({
      inputsByKey: inputsByKey([
        // ARR shrank: burn multiple is undefined this period
        input({ key: "revenue.arr", value: 900_000, previousValue: 1_000_000 }),
        input({ key: "finance.net_burn", value: 300_000 }),
      ]),
      sourceStatuses: healthySources,
    });
    const byKey = new Map(rows.map((row) => [row.key, row]));

    const burnMultiple = byKey.get("finance.burn_multiple")!;
    expect(burnMultiple.value).toBeNull();
    expect(burnMultiple.status).toBe("missing");
    expect(burnMultiple.warnings).toContain(
      "Net-new ARR was not positive this period, so burn multiple is undefined.",
    );

    // net-new ARR itself still reports the (negative) truth
    expect(byKey.get("revenue.net_new_arr")!.value).toBe(-100_000);
  });

  it("flags a missing prior period instead of inventing a delta", () => {
    const rows = buildDerivedImladrisMetricRows({
      inputsByKey: inputsByKey([
        input({ key: "revenue.arr", value: 1_200_000, previousValue: null }),
      ]),
      sourceStatuses: healthySources,
    });
    const netNew = rows.find((row) => row.key === "revenue.net_new_arr")!;

    expect(netNew.value).toBeNull();
    expect(netNew.status).toBe("missing");
    expect(netNew.warnings).toContain(
      "No ARR value exists for the previous period, so the period-over-period delta is undefined.",
    );
  });
});

describe("buildImladrisMetrics derived integration", () => {
  function monthStart(monthsAgo: number): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  }

  function canonicalRow(metricKey: string, value: number, monthsAgo: number) {
    const periodEnd = monthStart(monthsAgo);
    return {
      metricKey,
      department: "finance",
      unit: "currency",
      value: { amount: value },
      periodStart: new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000),
      periodEnd,
      status: "READY",
      confidence: 0.9,
      warnings: [],
      calculationVersion: `${metricKey}.v1`,
      computedAt: new Date(periodEnd.getTime() + 60_000),
      userId: "user_1",
      organizationId: "org_1",
      lineage: [],
    };
  }

  it("appends derived metrics computed from current and prior-month canonical rows", async () => {
    const prisma = {
      integrationConnection: { findMany: vi.fn(async () => []) },
      analyticsSnapshot: { findMany: vi.fn(async () => []) },
      imladrisSourceSyncRun: { findMany: vi.fn(async () => []) },
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          canonicalRow("revenue.arr", 1_200_000, 0),
          canonicalRow("revenue.arr", 1_000_000, 1),
          canonicalRow("finance.net_burn", 300_000, 0),
          canonicalRow("revenue.mrr", 100_000, 0),
          canonicalRow("revenue.customer_count", 40, 0),
          canonicalRow("customer_success.retention_rate", 110, 0),
          canonicalRow("finance.cash_runway_months", 12, 0),
        ]),
      },
    } as never;

    const metrics = await buildImladrisMetrics({
      prisma,
      context: { userId: "user_1", organizationId: "org_1" },
    });
    const byKey = new Map(metrics.map((metric) => [metric.key, metric]));

    expect(byKey.get("revenue.net_new_arr")?.value).toBe(200_000);
    expect(byKey.get("revenue.arr_growth_rate")?.value).toBe(20);
    expect(byKey.get("finance.burn_multiple")?.value).toBe(1.5);
    expect(byKey.get("revenue.arpa")?.value).toBe(2_500);
    expect(byKey.get("company.healthy_arr_growth")?.value).toBe(84.12);

    // no provider evidence exists in this fixture, so the derived metrics
    // degrade with their inputs instead of claiming to be board-ready
    expect(byKey.get("revenue.net_new_arr")?.status).toBe("missing");
    expect(byKey.get("revenue.net_new_arr")?.calculationVersion).toBe(
      IMLADRIS_DERIVED_CALCULATION_VERSION,
    );
  });
});
