import { describe, expect, it } from "vitest";
import {
  CANONICAL_DEPARTMENTS,
  IMLADRIS_METRIC_DEFINITIONS,
  REQUIRED_IMLADRIS_PROVIDERS,
  getImladrisDashboardDefinition,
} from "@/lib/imladris/catalog";

describe("Imladris catalog", () => {
  it("requires every v1 source system and excludes task/WIP pseudo-sources", () => {
    expect(REQUIRED_IMLADRIS_PROVIDERS.map((provider) => provider.key)).toEqual([
      "hubspot",
      "stripe",
      "pylon",
      "posthog",
      "linear",
      "slack",
      "googleWorkspace",
      "github",
      "googleAnalytics",
      "googleSearchConsole",
      "googleAds",
      "metaAds",
      "reddit",
      "semrush",
      "coda",
      "webflow",
      "unify",
      "mercury",
    ]);

    expect(REQUIRED_IMLADRIS_PROVIDERS.map((provider) => provider.key)).not.toContain("wipguard");
    expect(REQUIRED_IMLADRIS_PROVIDERS.map((provider) => provider.key)).not.toContain("task");
  });

  it("defines freshness and 13-month backfill policy for every v1 provider", () => {
    for (const provider of REQUIRED_IMLADRIS_PROVIDERS) {
      expect(provider.freshnessSlaHours).toBeGreaterThan(0);
      expect(provider.historicalLookbackMonths).toBe(13);
    }
  });

  it("defines the operating dashboard and department drilldowns from canonical metrics", () => {
    expect(CANONICAL_DEPARTMENTS).toEqual([
      "finance",
      "development",
      "marketing",
      "sales",
      "customer-success",
    ]);

    const operating = getImladrisDashboardDefinition("operating");
    expect(operating?.metricKeys).toEqual([
      "finance.cash_runway_months",
      "finance.net_burn",
      "revenue.mrr",
      "sales.qualified_pipeline",
      "marketing.pipeline_efficiency",
      "development.delivery_health",
      "product.activation_rate",
      "customer_success.retention_risk",
    ]);

    const development = getImladrisDashboardDefinition("development");
    expect(development?.sourceKeys).toEqual(["linear", "github", "posthog"]);
    expect(development?.metricKeys).not.toContain("ceo.throughput_30d");

    const marketing = getImladrisDashboardDefinition("marketing");
    expect(marketing?.sourceKeys).toContain("googleSearchConsole");
    expect(marketing?.sourceKeys).toContain("reddit");
    expect(marketing?.sourceKeys).toContain("coda");
    expect(marketing?.sourceKeys).toContain("webflow");
  });

  it("declares units that match canonical metric values", () => {
    expect(
      IMLADRIS_METRIC_DEFINITIONS.find((metric) => metric.key === "finance.cash_runway_months")?.unit,
    ).toBe("months");
    expect(
      IMLADRIS_METRIC_DEFINITIONS.find((metric) => metric.key === "product.activation_rate")?.unit,
    ).toBe("percent");
  });
});
