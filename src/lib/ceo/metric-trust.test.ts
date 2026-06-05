import { describe, expect, it } from "vitest";
import {
  buildDefaultCeoReportPacks,
  buildMetricReportRun,
  computeCeoReadiness,
  evaluateMetricTrust,
  getDefaultCeoMetricDefinitions,
  type CeoMetricValue,
} from "@/lib/ceo/metric-trust";
import { IMLADRIS_METRIC_DEFINITIONS } from "@/lib/imladris/catalog";

const AS_OF = new Date("2026-05-01T12:00:00.000Z");

describe("CEO metric trust layer", () => {
  it("marks metrics stale when the best source is older than its freshness SLA", () => {
    const trust = evaluateMetricTrust({
      asOf: AS_OF,
      freshnessSlaHours: 6,
      requiredSourceKeys: ["stripe"],
      sources: [
        {
          sourceKey: "stripe",
          status: "SUCCESS",
          capturedAt: "2026-05-01T00:00:00.000Z",
          expiresAt: "2026-05-01T01:00:00.000Z",
        },
      ],
    });

    expect(trust.status).toBe("stale");
    expect(trust.confidence).toBeLessThan(1);
    expect(trust.warnings.join(" ")).toContain("stale");
  });

  it("marks metrics partial when at least one required source is missing", () => {
    const trust = evaluateMetricTrust({
      asOf: AS_OF,
      freshnessSlaHours: 24,
      requiredSourceKeys: ["hubspot", "stripe"],
      sources: [
        {
          sourceKey: "hubspot",
          status: "SUCCESS",
          capturedAt: "2026-05-01T10:00:00.000Z",
          expiresAt: "2026-05-01T13:00:00.000Z",
        },
      ],
    });

    expect(trust.status).toBe("partial");
    expect(trust.warnings.join(" ")).toContain("stripe");
  });

  it("keeps metric trust fresh when an optional source errors but required sources are fresh", () => {
    const trust = evaluateMetricTrust({
      asOf: AS_OF,
      freshnessSlaHours: 24,
      requiredSourceKeys: ["googleAds", "metaAds"],
      optionalSourceKeys: ["redditAds"],
      sources: [
        {
          sourceKey: "googleAds",
          sourceId: "google-ads-snapshot",
          status: "SUCCESS",
          capturedAt: "2026-05-01T10:00:00.000Z",
          expiresAt: "2026-05-01T13:00:00.000Z",
        },
        {
          sourceKey: "metaAds",
          sourceId: "meta-ads-snapshot",
          status: "SUCCESS",
          capturedAt: "2026-05-01T10:00:00.000Z",
          expiresAt: "2026-05-01T13:00:00.000Z",
        },
        {
          sourceKey: "redditAds",
          sourceId: "reddit-ads-snapshot",
          status: "ERROR",
          capturedAt: "2026-05-01T10:00:00.000Z",
          expiresAt: "2026-05-01T13:00:00.000Z",
          lastError: "Request timed out after 10000ms",
        },
      ],
    });

    expect(trust.status).toBe("fresh");
    expect(trust.confidence).toBe(1);
    expect(trust.sourceStates.map((state) => state.sourceKey)).toEqual([
      "googleAds",
      "metaAds",
      "redditAds",
    ]);
    expect(trust.warnings.join(" ")).toContain("Optional source redditAds errored");
  });

  it("registers default metric definitions across every existing analytics domain", () => {
    const definitions = getDefaultCeoMetricDefinitions();
    const domains = new Set(definitions.map((definition) => definition.domain));
    const keys = definitions.map((definition) => definition.key);
    const marketingPipelineEfficiency = definitions.find((definition) => definition.key === "marketing.pipeline_efficiency");
    const socialDomainHealth = definitions.find((definition) => definition.key === "domain.social-media.health");
    const revenueDomainHealth = definitions.find((definition) => definition.key === "domain.revenue.health");

    expect(domains).toContain("finance");
    expect(domains).toContain("sales-pipeline");
    expect(domains).toContain("customer-success");
    expect(domains).toContain("process-analytics");
    expect(domains).toContain("website-traffic");
    expect(domains).toContain("social-media");
    expect(domains).toContain("revenue");
    expect(domains).toContain("development");
    expect(definitions.every((definition) => definition.sourceDependencies.length > 0)).toBe(true);
    expect(marketingPipelineEfficiency?.sourceDependencies).toEqual([
      "googleAnalytics",
      "googleSearchConsole",
      "googleAds",
      "metaAds",
      "semrush",
      "coda",
      "webflow",
      "unify",
      "hubspot",
    ]);
    expect(marketingPipelineEfficiency?.optionalSourceDependencies).toEqual(["redditAds"]);
    expect(socialDomainHealth?.sourceDependencies).toEqual(["googleAds", "metaAds"]);
    expect(socialDomainHealth?.optionalSourceDependencies).toEqual(["redditAds"]);
    expect(revenueDomainHealth?.sourceDependencies).toEqual(["hubspot", "stripe", "mercury"]);
    expect(keys).not.toContain("ceo.flow_reliability_score");
    expect(keys).not.toContain("ceo.throughput_30d");
    expect(keys).not.toContain("ceo.overdue_open_tasks");
    expect(definitions.find((definition) => definition.key === "development.delivery_health")).toMatchObject({
      sourceDependencies: ["linear", "github", "posthog"],
    });
  });

  it("uses canonical Imladris startup operating metrics in default report packs", () => {
    const canonicalKeys = new Set(IMLADRIS_METRIC_DEFINITIONS.map((definition) => definition.key));
    const legacyKeys = new Set([
      "finance.mrr",
      "sales.open_pipeline_value",
      "retention.at_risk_accounts",
      "customer_success.support_load",
      "website.sessions",
      "social.paid_spend",
    ]);
    const definitions = getDefaultCeoMetricDefinitions();
    const packs = buildDefaultCeoReportPacks(definitions);
    const packedMetricKeys = new Set(packs.flatMap((pack) => pack.metricKeys));

    expect([...packedMetricKeys].filter((key) => legacyKeys.has(key))).toEqual([]);
    for (const key of packedMetricKeys) {
      expect(canonicalKeys.has(key) || key.startsWith("domain.") || key.startsWith("source.")).toBe(true);
    }

    expect([...packedMetricKeys]).toEqual(
      expect.arrayContaining([
        "revenue.mrr",
        "revenue.arr",
        "revenue.active_subscriptions",
        "revenue.customer_count",
        "finance.cash_balance",
        "finance.net_burn",
        "finance.cash_runway_months",
        "sales.qualified_pipeline",
        "sales.demos",
        "marketing.website_traffic",
        "marketing.conversion_rate",
        "customer_success.customer_health",
        "customer_success.customer_activity",
        "customer_success.churn_rate",
        "customer_success.retention_rate",
      ]),
    );
  });

  it("builds investor and board report sections around canonical traction, efficiency, and retention metrics", () => {
    const definitions = getDefaultCeoMetricDefinitions();
    const packs = buildDefaultCeoReportPacks(definitions);
    const investorPack = packs.find((pack) => pack.slug === "investor-update")!;
    const boardPack = packs.find((pack) => pack.slug === "board-meeting")!;

    expect(investorPack.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Traction",
          metricKeys: expect.arrayContaining([
            "revenue.mrr",
            "revenue.arr",
            "revenue.customer_count",
            "sales.qualified_pipeline",
            "marketing.website_traffic",
          ]),
        }),
        expect.objectContaining({
          title: "Efficiency",
          metricKeys: expect.arrayContaining([
            "finance.net_burn",
            "finance.cash_runway_months",
            "marketing.conversion_rate",
          ]),
        }),
        expect.objectContaining({
          title: "Retention",
          metricKeys: expect.arrayContaining([
            "customer_success.customer_health",
            "customer_success.churn_rate",
            "customer_success.retention_rate",
          ]),
        }),
      ]),
    );
    expect(boardPack.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Financials",
          metricKeys: expect.arrayContaining([
            "finance.cash_balance",
            "finance.net_burn",
            "finance.cash_runway_months",
            "revenue.arr",
          ]),
        }),
        expect.objectContaining({
          title: "Revenue and Go-to-Market",
          metricKeys: expect.arrayContaining([
            "revenue.mrr",
            "revenue.active_subscriptions",
            "sales.demos",
            "marketing.conversion_rate",
          ]),
        }),
        expect.objectContaining({
          title: "Customer Health",
          metricKeys: expect.arrayContaining([
            "customer_success.customer_activity",
            "customer_success.retention_rate",
            "customer_success.retention_risk",
          ]),
        }),
      ]),
    );
  });

  it("maps CEO finance projection source health to real provider dependencies", () => {
    const definitions = getDefaultCeoMetricDefinitions();
    const forecastHealth = definitions.find((definition) => definition.key === "source.finance-forecast.health");
    const planningHealth = definitions.find((definition) => definition.key === "source.finance-planning.health");
    const pnlHealth = definitions.find((definition) => definition.key === "source.finance-pnl.health");
    const unitEconomicsHealth = definitions.find((definition) => definition.key === "source.finance-unit-economics.health");

    expect(forecastHealth?.sourceDependencies).toEqual(["stripe", "mercury"]);
    expect(planningHealth?.sourceDependencies).toEqual(["stripe", "mercury", "hubspot"]);
    expect(pnlHealth?.sourceDependencies).toEqual(["stripe", "mercury"]);
    expect(unitEconomicsHealth?.sourceDependencies).toEqual(["stripe", "mercury", "hubspot"]);
  });

  it("builds deterministic markdown, csv, and slide-ready JSON for a report pack", () => {
    const definitions = getDefaultCeoMetricDefinitions();
    const packs = buildDefaultCeoReportPacks(definitions);
    const weeklyPack = packs.find((pack) => pack.slug === "weekly-exec");
    expect(weeklyPack).toBeDefined();

    const run = buildMetricReportRun({
      pack: weeklyPack!,
      metrics: weeklyPack!.metricKeys.map((metricKey, index) => ({
        definition: definitions.find((definition) => definition.key === metricKey)!,
        value: index + 1,
        priorValue: index,
        delta: 1,
        details: metricKey === "finance.cash_balance"
          ? [
              { key: "bankCash", label: "Bank cash", value: 10, unit: "currency" },
              { key: "treasuryCash", label: "Treasury cash", value: 20, unit: "currency" },
              { key: "totalCash", label: "Total cash", value: 30, unit: "currency" },
            ]
          : undefined,
        periodStart: "2026-04-24T00:00:00.000Z",
        periodEnd: "2026-05-01T12:00:00.000Z",
        asOf: "2026-05-01T12:00:00.000Z",
        computedAt: "2026-05-01T12:01:00.000Z",
        trust: {
          status: index === 0 ? "fresh" : "stale",
          confidence: index === 0 ? 1 : 0.7,
          warnings: index === 0 ? [] : ["Source snapshot is stale."],
          sourceStates: [],
        },
        lineage: [],
      })),
      generatedAt: "2026-05-01T12:02:00.000Z",
    });

    expect(run.markdown).toContain("# Weekly Exec");
    expect(run.markdown).toContain("Trust");
    expect(run.markdown).toContain("Bank cash: 10; Treasury cash: 20; Total cash: 30");
    expect(run.csv).toContain("Metric,Value,Prior Value,Delta,Trust,As Of,Sources,Details");
    expect(run.csv).toContain("Bank cash: 10; Treasury cash: 20; Total cash: 30");
    expect(run.slideJson.sections.length).toBeGreaterThan(0);
    expect(
      run.slideJson.sections
        .flatMap((section) => section.metrics)
        .find((metric) => metric.key === "finance.cash_balance")?.details
    ).toEqual([
      { key: "bankCash", label: "Bank cash", value: 10, unit: "currency" },
      { key: "treasuryCash", label: "Treasury cash", value: 20, unit: "currency" },
      { key: "totalCash", label: "Total cash", value: 30, unit: "currency" },
    ]);
    expect(run.deterministicNotes.some((note) => note.includes("stale"))).toBe(true);
  });

  it("marks reports not board-final when any required metric is stale, missing, or unverified", () => {
    const definitions = getDefaultCeoMetricDefinitions();
    const packs = buildDefaultCeoReportPacks(definitions);
    const boardPack = packs.find((pack) => pack.slug === "board-meeting")!;
    const metrics: CeoMetricValue[] = boardPack.metricKeys.map((metricKey, index) => ({
      definition: definitions.find((definition) => definition.key === metricKey)!,
      value: index === 1 ? null : index + 1,
      priorValue: null,
      delta: null,
      periodStart: "2026-04-01T00:00:00.000Z",
      periodEnd: "2026-05-01T00:00:00.000Z",
      asOf: "2026-05-01T00:00:00.000Z",
      computedAt: "2026-05-01T00:01:00.000Z",
      trust: {
        status: index === 0 ? "fresh" : "stale",
        confidence: index === 0 ? 1 : 0.7,
        warnings: index === 0 ? [] : ["Source snapshot is stale."],
        sourceStates: [],
      },
      lineage: index === 2 ? [] : [{ sourceKey: "test-source", sourceId: "snap-1", capturedAt: "2026-05-01T00:00:00.000Z" }],
    }));

    const readiness = computeCeoReadiness({
      reportPacks: [boardPack],
      metrics,
      verifiedMetricKeys: new Set(boardPack.metricKeys.filter((key) => key !== boardPack.metricKeys[3])),
    });

    expect(readiness.status).toBe("not_board_final");
    expect(readiness.ready).toBe(false);
    expect(readiness.failingGates.some((gate) => gate.reason.includes("stale"))).toBe(true);
    expect(readiness.failingGates.some((gate) => gate.reason.includes("lineage"))).toBe(true);
    expect(readiness.failingGates.some((gate) => gate.reason.includes("verified"))).toBe(true);
    expect(readiness.failingGates.some((gate) => gate.reason.includes("value"))).toBe(true);
  });

  it("embeds board-readiness warnings into markdown, csv, and slide-ready JSON exports", () => {
    const definitions = getDefaultCeoMetricDefinitions();
    const pack = buildDefaultCeoReportPacks(definitions).find((candidate) => candidate.slug === "weekly-exec")!;
    const metrics: CeoMetricValue[] = pack.metricKeys.map((metricKey) => ({
      definition: definitions.find((definition) => definition.key === metricKey)!,
      value: 1,
      priorValue: null,
      delta: null,
      periodStart: "2026-04-01T00:00:00.000Z",
      periodEnd: "2026-05-01T00:00:00.000Z",
      asOf: "2026-05-01T00:00:00.000Z",
      computedAt: "2026-05-01T00:01:00.000Z",
      trust: { status: "fresh", confidence: 1, warnings: [], sourceStates: [] },
      lineage: [{ sourceKey: "test-source", sourceId: "snap-1", capturedAt: "2026-05-01T00:00:00.000Z" }],
    }));
    const readiness = {
      status: "not_board_final" as const,
      ready: false,
      summary: "Not board-final: 1 readiness gate is failing.",
      failingGates: [
        {
          metricKey: "finance.mrr",
          label: "MRR",
          reason: "Metric source snapshot is stale.",
        },
      ],
    };

    const run = buildMetricReportRun({ pack, metrics, readiness });

    expect(run.markdown).toContain("Board Readiness");
    expect(run.markdown).toContain("Not board-final");
    expect(run.csv).toContain("Readiness Status,not_board_final");
    expect(run.slideJson.readiness.status).toBe("not_board_final");
    expect(run.slideJson.readiness.failingGates[0]?.metricKey).toBe("finance.mrr");
  });
});
