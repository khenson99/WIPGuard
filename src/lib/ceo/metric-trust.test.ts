import { describe, expect, it } from "vitest";
import {
  buildDefaultCeoReportPacks,
  buildMetricReportRun,
  computeCeoReadiness,
  evaluateMetricTrust,
  getDefaultCeoMetricDefinitions,
  type CeoMetricValue,
} from "@/lib/ceo/metric-trust";

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
    const socialPaidSpend = definitions.find((definition) => definition.key === "social.paid_spend");
    const socialDomainHealth = definitions.find((definition) => definition.key === "domain.social-media.health");

    expect(domains).toContain("finance");
    expect(domains).toContain("sales-pipeline");
    expect(domains).toContain("customer-success");
    expect(domains).toContain("process-analytics");
    expect(domains).toContain("website-traffic");
    expect(domains).toContain("social-media");
    expect(domains).toContain("ceo");
    expect(definitions.every((definition) => definition.sourceDependencies.length > 0)).toBe(true);
    expect(socialPaidSpend?.sourceDependencies).toEqual(["googleAds", "metaAds"]);
    expect(socialPaidSpend?.optionalSourceDependencies).toEqual(["redditAds"]);
    expect(socialDomainHealth?.sourceDependencies).toEqual(["googleAds", "metaAds"]);
    expect(socialDomainHealth?.optionalSourceDependencies).toEqual(["redditAds"]);
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
