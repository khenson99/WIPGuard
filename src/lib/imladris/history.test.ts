import { describe, expect, it, vi } from "vitest";
import { buildImladrisMetricHistory } from "@/lib/imladris/history";
import {
  IMLADRIS_DERIVED_METRIC_DEFINITIONS,
  IMLADRIS_METRIC_DEFINITIONS,
} from "@/lib/imladris/catalog";

const CONTEXT = {
  userId: "user_1",
  organizationId: "org_1",
};

// Use real catalog metric keys so the returned series line up 1:1 with definitions.
const METRIC_KEY = IMLADRIS_METRIC_DEFINITIONS[0]!.key;

// Anchor fixtures to the current month like buildImladrisMetricHistory does (axis ends "now").
// Use the 1st of the target month so the current-month fixture stays <= now (the lib filters
// out periodEnd/computedAt that fall after the real "now"); end-of-month would be in the future.
function periodEndFor(monthsAgo: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1, 0, 0, 0, 0));
}

function monthKeyFor(monthsAgo: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function metricRow(input: {
  metricKey?: string;
  value: unknown;
  status?: string;
  confidence?: number;
  periodEnd: Date;
  computedAt?: Date;
  userId?: string | null;
  organizationId?: string | null;
}) {
  return {
    metricKey: input.metricKey ?? METRIC_KEY,
    value: input.value,
    status: input.status ?? "READY",
    confidence: input.confidence ?? 0.92,
    periodEnd: input.periodEnd,
    computedAt: input.computedAt ?? new Date(input.periodEnd.getTime() + 60_000),
    // NOTE: default computedAt is periodEnd + 60s; keep periodEnd in the past (periodEndFor)
    // so computedAt also stays <= now for the current-month bucket.
    calculationVersion: `${input.metricKey ?? METRIC_KEY}-v1`,
    userId: input.userId ?? null,
    organizationId: input.organizationId ?? null,
  };
}

function prismaMock(rows: unknown[]) {
  return {
    imladrisCanonicalMetricValue: {
      findMany: vi.fn(async () => rows),
    },
  } as never;
}

describe("buildImladrisMetricHistory", () => {
  it("returns an aligned monthly axis of the requested length", async () => {
    const prisma = prismaMock([]);

    const history = await buildImladrisMetricHistory({ prisma, context: CONTEXT, months: 13 });

    expect(history.months).toHaveLength(13);
    // axis is ascending and ends at the current month
    expect(history.months[history.months.length - 1]).toBe(monthKeyFor(0));
    expect(history.months[0]).toBe(monthKeyFor(12));
    // every metric's points align 1:1 with the axis
    for (const metric of history.metrics) {
      expect(metric.points).toHaveLength(history.months.length);
      expect(metric.points.map((p) => p.month)).toEqual(history.months);
    }
    // one series per catalog definition, plus the derived metric series
    expect(history.metrics).toHaveLength(
      IMLADRIS_METRIC_DEFINITIONS.length + IMLADRIS_DERIVED_METRIC_DEFINITIONS.length,
    );
  });

  it("computes derived series (net-new ARR, growth, burn multiple) from base series", async () => {
    const prisma = prismaMock([
      metricRow({ metricKey: "revenue.arr", value: { amount: 1_200_000 }, periodEnd: periodEndFor(0) }),
      metricRow({ metricKey: "revenue.arr", value: { amount: 1_100_000 }, status: "STALE", confidence: 0.6, periodEnd: periodEndFor(1) }),
      metricRow({ metricKey: "finance.net_burn", value: { amount: 150_000 }, periodEnd: periodEndFor(0) }),
    ]);

    const history = await buildImladrisMetricHistory({ prisma, context: CONTEXT, months: 13 });
    const currentMonth = monthKeyFor(0);

    const netNew = history.metrics.find((m) => m.key === "revenue.net_new_arr")!;
    const netNewPoint = netNew.points.find((p) => p.month === currentMonth)!;
    expect(netNewPoint.value).toBe(100_000);
    // status degrades to the worst input (prior-month ARR is stale)
    expect(netNewPoint.status).toBe("STALE");
    expect(netNewPoint.confidence).toBe(0.6);
    // months without a prior ARR value have no derived point
    expect(netNew.points.find((p) => p.month === monthKeyFor(1))!.value).toBeNull();

    const growth = history.metrics.find((m) => m.key === "revenue.arr_growth_rate")!;
    expect(growth.points.find((p) => p.month === currentMonth)!.value).toBeCloseTo(9.09, 2);

    const burnMultiple = history.metrics.find((m) => m.key === "finance.burn_multiple")!;
    expect(burnMultiple.points.find((p) => p.month === currentMonth)!.value).toBe(1.5);
  });

  it("maps a metric's rows into the correct month buckets with value, status, and confidence", async () => {
    const prisma = prismaMock([
      metricRow({ value: { amount: 1000 }, status: "READY", confidence: 0.81, periodEnd: periodEndFor(0) }),
      metricRow({ value: { amount: 800 }, status: "STALE", confidence: 0.6, periodEnd: periodEndFor(2) }),
    ]);

    const history = await buildImladrisMetricHistory({ prisma, context: CONTEXT, months: 13 });

    const series = history.metrics.find((m) => m.key === METRIC_KEY);
    expect(series).toBeDefined();
    const byMonth = new Map(series!.points.map((p) => [p.month, p]));

    const current = byMonth.get(monthKeyFor(0));
    expect(current).toEqual({ month: monthKeyFor(0), value: 1000, status: "READY", confidence: 0.81 });

    const twoAgo = byMonth.get(monthKeyFor(2));
    expect(twoAgo).toEqual({ month: monthKeyFor(2), value: 800, status: "STALE", confidence: 0.6 });
  });

  it("returns a null point for months with no row", async () => {
    const prisma = prismaMock([
      metricRow({ value: { amount: 500 }, periodEnd: periodEndFor(1) }),
    ]);

    const history = await buildImladrisMetricHistory({ prisma, context: CONTEXT, months: 13 });
    const series = history.metrics.find((m) => m.key === METRIC_KEY)!;
    const byMonth = new Map(series.points.map((p) => [p.month, p]));

    // month with no row -> fully null point
    expect(byMonth.get(monthKeyFor(0))).toEqual({
      month: monthKeyFor(0),
      value: null,
      status: null,
      confidence: null,
    });
    // the populated month is present
    expect(byMonth.get(monthKeyFor(1))?.value).toBe(500);
  });

  it("picks the best-scoped, freshest row per bucket when duplicates exist", async () => {
    const periodEnd = periodEndFor(0);
    const prisma = prismaMock([
      // fully org+user scoped, but older computedAt -> highest specificity should still win
      metricRow({
        value: { amount: 4242 },
        status: "READY",
        confidence: 0.99,
        periodEnd,
        computedAt: new Date(periodEnd.getTime() - 10 * 60_000),
        userId: "user_1",
        organizationId: "org_1",
      }),
      // org-only scope (lower specificity), fresher computedAt -> should lose to the scoped row
      metricRow({
        value: { amount: 1 },
        status: "STALE",
        confidence: 0.2,
        periodEnd,
        computedAt: new Date(periodEnd.getTime() + 10 * 60_000),
        userId: null,
        organizationId: "org_1",
      }),
      // global fallback (lowest specificity) -> ignored
      metricRow({
        value: { amount: 9 },
        periodEnd,
        userId: null,
        organizationId: null,
      }),
    ]);

    const history = await buildImladrisMetricHistory({ prisma, context: CONTEXT, months: 13 });
    const series = history.metrics.find((m) => m.key === METRIC_KEY)!;
    const current = series.points.find((p) => p.month === monthKeyFor(0));

    expect(current).toEqual({ month: monthKeyFor(0), value: 4242, status: "READY", confidence: 0.99 });
  });

  it("breaks specificity ties by the freshest computedAt", async () => {
    const periodEnd = periodEndFor(0);
    const prisma = prismaMock([
      metricRow({
        value: { amount: 100 },
        periodEnd,
        computedAt: new Date(periodEnd.getTime() + 1_000),
        userId: "user_1",
        organizationId: "org_1",
      }),
      metricRow({
        value: { amount: 200 },
        periodEnd,
        computedAt: new Date(periodEnd.getTime() + 5 * 60_000),
        userId: "user_1",
        organizationId: "org_1",
      }),
    ]);

    const history = await buildImladrisMetricHistory({ prisma, context: CONTEXT, months: 13 });
    const series = history.metrics.find((m) => m.key === METRIC_KEY)!;
    const current = series.points.find((p) => p.month === monthKeyFor(0));

    expect(current?.value).toBe(200);
  });
});
