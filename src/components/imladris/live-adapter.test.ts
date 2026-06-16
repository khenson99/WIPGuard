import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadImladrisData, num } from "./live-adapter";

type FetchResponder = (url: string) => { ok: boolean; status?: number; json: unknown };

function installFetch(responder: FetchResponder) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const r = responder(url);
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: async () => r.json,
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const METRICS_OK = {
  generatedAt: "2026-03-01T00:00:00.000Z",
  metrics: [
    {
      key: "revenue.arr",
      value: { amount: 5_000_000 },
      status: "ready",
      confidence: 0.91,
      // Production route returns `sourceLineage` (not `lineage`).
      sourceLineage: [
        { sourceKey: "STRIPE", sourceType: "stripe" },
        { sourceKey: "HUBSPOT", sourceType: "hubspot" },
      ],
    },
    {
      key: "finance.net_burn",
      value: { amount: 300_000 },
      status: "stale",
      confidence: 80, // percent form should clamp to 0.8
    },
  ],
};

function respondAllOk(url: string) {
  if (url.includes("/api/imladris/metrics/history")) return { ok: true, json: { months: [], metrics: [] } };
  if (url.includes("/api/imladris/metrics")) return { ok: true, json: METRICS_OK };
  if (url.includes("/api/imladris/sources")) {
    return {
      ok: true,
      json: {
        sources: [
          { key: "stripe", status: "connected", lastSyncedAt: "2026-03-01T00:00:00.000Z", latestSyncRun: { recordCount: 4321 } },
          { key: "semrush", status: "stale", lastError: "Last sync 4 days ago." },
        ],
      },
    };
  }
  if (url.includes("/api/financial-planning/monthly-history")) return { ok: true, json: { months: [] } };
  if (url.includes("/api/imladris/dashboards/company")) return { ok: true, json: {} };
  return { ok: false, status: 404, json: {} };
}

describe("num()", () => {
  it("extracts the first present numeric field from a canonical value object", () => {
    expect(num({ amount: 1234 })).toBe(1234);
    expect(num({ months: 19.4 })).toBe(19.4);
    expect(num({ rate: 3.2 })).toBe(3.2);
    expect(num("  $1,234.5 ")).toBeCloseTo(1234.5);
    expect(num(null)).toBeNull();
    expect(num({})).toBeNull();
  });
});

describe("loadImladrisData — live-or-error gating", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("errors when /metrics is unreachable (no silent sample fallback)", async () => {
    installFetch((url) => {
      if (url.includes("/api/imladris/metrics") && !url.includes("history")) return { ok: false, status: 500, json: {} };
      return respondAllOk(url);
    });
    const result = await loadImladrisData();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.url).toContain("/api/imladris/metrics");
  });

  it("errors when /metrics matches zero canonical metrics", async () => {
    installFetch((url) => {
      if (url.includes("/api/imladris/metrics") && !url.includes("history")) {
        return { ok: true, json: { metrics: [{ key: "not.a.real.metric", value: { amount: 1 } }] } };
      }
      return respondAllOk(url);
    });
    const result = await loadImladrisData();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no recognized canonical metrics/i);
  });

  it("succeeds and overlays live values + status + clamped confidence onto the model", async () => {
    installFetch(respondAllOk);
    const result = await loadImladrisData();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { data } = result;
    expect(data.mode).toBe("live");
    expect(result.generatedAt).toBe("2026-03-01T00:00:00.000Z");
    expect(data.metricByKey["revenue.arr"].value).toBe(5_000_000);
    expect(data.metricByKey["finance.net_burn"].status).toBe("stale");
    // 80 (percent) clamps to 0.8
    expect(data.metricByKey["finance.net_burn"].confidence).toBeCloseTo(0.8);
  });

  it("maps lineage from `sourceLineage` (production key) to provider source keys", async () => {
    installFetch(respondAllOk);
    const result = await loadImladrisData();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.metricByKey["revenue.arr"].sources).toEqual(["stripe", "hubspot"]);
  });

  it("reads source record counts from latestSyncRun.recordCount and marks degraded state", async () => {
    installFetch(respondAllOk);
    const result = await loadImladrisData();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.providers.stripe.records).toBe(4321);
    expect(result.data.providers.semrush.state).toBe("stale");
  });
});

describe("loadImladrisData — no seeded sample values leak in live mode", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("clears the seeded value when the API returns a metric without a value (renders empty, not a demo number)", async () => {
    installFetch((url) => {
      if (url.includes("/api/imladris/metrics") && !url.includes("history")) {
        return {
          ok: true,
          json: {
            metrics: [
              { key: "revenue.arr", value: { amount: 5_000_000 }, status: "ready" },
              // Matched canonical metric, but the source errored so there's no value.
              { key: "revenue.mrr", value: null, status: "error" },
            ],
          },
        };
      }
      return respondAllOk(url);
    });
    const result = await loadImladrisData();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const mrr = result.data.metricByKey["revenue.mrr"];
    // NOT the seeded 353_000 — an honest empty state instead of a fabricated number.
    expect(mrr.value).toBeNull();
    expect(mrr.history).toEqual([]);
    expect(mrr.status).toBe("error");
  });

  it("does not surface seeded values for metrics absent from the live /metrics payload", async () => {
    installFetch(respondAllOk); // payload only carries revenue.arr + finance.net_burn
    const result = await loadImladrisData();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const mrr = result.data.metricByKey["revenue.mrr"];
    expect(mrr.value).toBeNull();
    expect(mrr.history).toEqual([]);
  });
});

describe("loadImladrisData — trend gating (live-or-error for sparklines)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("marks trends unavailable when neither history nor P&L provides a usable series", async () => {
    installFetch(respondAllOk); // both history and trends are empty
    const result = await loadImladrisData();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.trendsAvailable).toBe(false);
    expect(result.data.metricByKey["revenue.arr"].liveTrend).toBe(false);
    // collapses history to the single current period
    expect(result.data.metricByKey["revenue.arr"].history).toEqual([5_000_000]);
    expect(result.data.months.length).toBe(1);
  });

  it("uses the per-metric history endpoint as the primary trend source", async () => {
    const months = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03"];
    installFetch((url) => {
      if (url.includes("/api/imladris/metrics/history")) {
        return {
          ok: true,
          json: {
            months,
            metrics: [
              { key: "revenue.arr", points: months.map((m, i) => ({ month: m, value: 4_000_000 + i * 250_000 })) },
            ],
          },
        };
      }
      return respondAllOk(url);
    });
    const result = await loadImladrisData();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.trendsAvailable).toBe(true);
    expect(result.data.months).toEqual(months);
    const arr = result.data.metricByKey["revenue.arr"];
    expect(arr.liveTrend).toBe(true);
    expect(arr.history).toHaveLength(months.length);
    expect(arr.value).toBe(arr.history[arr.history.length - 1]);
  });
});

describe("loadImladrisData — cohorts/breakdowns render only from /dashboards/company", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("strips scaffold breakdowns and renders only live benchmark segments", async () => {
    installFetch((url) => {
      if (url.includes("/api/imladris/dashboards/company")) {
        return {
          ok: true,
          json: {
            summary: { currency: "USD", subscriptionRevenue: 300_000, servicesRevenue: 30_000 },
            benchmarkContext: {
              cohorts: [
                { id: "ent", label: "Enterprise", value: 128, unit: "percent", status: "strong", detail: "NRR", sourceMetricKeys: ["customer_success.retention_rate"] },
              ],
            },
          },
        };
      }
      return respondAllOk(url);
    });
    const result = await loadImladrisData();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { data } = result;
    expect(data.hasLiveCohorts).toBe(true);
    // demo cohorts are stripped in live mode
    expect(data.metricByKey["revenue.arr"].cohorts).toBeUndefined();
    // live segment attached to its source metric
    expect(data.metricByKey["customer_success.retention_rate"].liveSegments).toHaveLength(1);
    // summary breakdown applied
    expect(data.metricByKey["revenue.total_revenue"].breakdown?.parts).toEqual([
      { label: "Subscription", value: 300_000 },
      { label: "Services", value: 30_000 },
    ]);
  });
});
