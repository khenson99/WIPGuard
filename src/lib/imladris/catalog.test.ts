import { describe, expect, it } from "vitest";
import { IntegrationProvider } from "@/generated/prisma/client";
import {
  CANONICAL_DEPARTMENTS,
  IMLADRIS_DERIVED_METRIC_DEFINITIONS,
  IMLADRIS_METRIC_DEFINITIONS,
  REQUIRED_IMLADRIS_PROVIDERS,
  derivedMetricSourceKeys,
  getImladrisDashboardDefinition,
} from "@/lib/imladris/catalog";
import { getProviderRegistryEntry } from "@/lib/integrations/provider-registry";

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

  it("keeps Imladris snapshot keys aligned with registry-backed provider aliases", () => {
    for (const provider of REQUIRED_IMLADRIS_PROVIDERS) {
      const registrySnapshotKeys = provider.providerAliases.flatMap((alias) => {
        const registryProvider = IntegrationProvider[alias as keyof typeof IntegrationProvider];
        return registryProvider ? (getProviderRegistryEntry(registryProvider)?.snapshotKeys ?? []) : [];
      });

      expect(provider.snapshotKeys).toEqual(expect.arrayContaining(registrySnapshotKeys));
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
      "finance.cash_balance",
      "finance.net_burn",
      "finance.expenses",
      "finance.gross_margin",
      "revenue.mrr",
      "revenue.arr",
      "revenue.total_revenue",
      "revenue.subscription_revenue",
      "revenue.services_revenue",
      "revenue.active_subscriptions",
      "revenue.customer_count",
      "sales.qualified_pipeline",
      "sales.demos",
      "marketing.website_traffic",
      "marketing.conversion_rate",
      "marketing.pipeline_efficiency",
      "development.delivery_health",
      "product.activation_rate",
      "customer_success.customer_health",
      "customer_success.customer_activity",
      "customer_success.churn_rate",
      "customer_success.retention_rate",
      "customer_success.retention_risk",
      "company.healthy_arr_growth",
      "revenue.net_new_arr",
      "revenue.arr_growth_rate",
      "finance.burn_multiple",
      "revenue.arpa",
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

  it("defines the company tracker as a non-department dashboard", () => {
    expect(CANONICAL_DEPARTMENTS).not.toContain("company");

    const company = getImladrisDashboardDefinition("company");

    expect(company).toMatchObject({
      id: "company",
      label: "Company Tracker",
      metricKeys: [
        "revenue.mrr",
        "revenue.arr",
        "revenue.total_revenue",
        "revenue.subscription_revenue",
        "revenue.services_revenue",
        "revenue.active_subscriptions",
        "revenue.customer_count",
        "finance.cash_balance",
        "finance.cash_runway_months",
        "finance.net_burn",
        "finance.expenses",
        "finance.gross_margin",
        "sales.qualified_pipeline",
        "sales.demos",
        "marketing.website_traffic",
        "marketing.conversion_rate",
        "marketing.pipeline_efficiency",
        "product.activation_rate",
        "customer_success.customer_health",
        "customer_success.customer_activity",
        "customer_success.churn_rate",
        "customer_success.retention_rate",
        "customer_success.retention_risk",
        "company.healthy_arr_growth",
        "revenue.net_new_arr",
        "revenue.arr_growth_rate",
        "finance.burn_multiple",
        "revenue.arpa",
      ],
    });
  });

  it("defines derived metrics from canonical inputs with deterministic formulas", () => {
    expect(IMLADRIS_DERIVED_METRIC_DEFINITIONS.map((metric) => metric.key)).toEqual([
      "revenue.net_new_arr",
      "revenue.arr_growth_rate",
      "finance.burn_multiple",
      "revenue.arpa",
      "company.healthy_arr_growth",
    ]);

    const canonicalKeys = new Set(IMLADRIS_METRIC_DEFINITIONS.map((metric) => metric.key));
    for (const metric of IMLADRIS_DERIVED_METRIC_DEFINITIONS) {
      expect(metric.inputs.length).toBeGreaterThan(0);
      for (const input of metric.inputs) {
        expect(canonicalKeys.has(input)).toBe(true);
      }
      expect(metric.formula.length).toBeGreaterThan(0);
      // Derived metrics never have their own materialized canonical rows.
      expect(canonicalKeys.has(metric.key)).toBe(false);
      // Provider dependencies come from the union of the inputs' sources.
      expect(derivedMetricSourceKeys(metric).length).toBeGreaterThan(0);
    }
  });

  it("declares units that match canonical metric values", () => {
    expect(
      IMLADRIS_METRIC_DEFINITIONS.find((metric) => metric.key === "finance.cash_runway_months")?.unit,
    ).toBe("months");
    expect(
      IMLADRIS_METRIC_DEFINITIONS.find((metric) => metric.key === "product.activation_rate")?.unit,
    ).toBe("percent");
    expect(
      IMLADRIS_METRIC_DEFINITIONS.find((metric) => metric.key === "sales.demos")?.unit,
    ).toBe("count");
    expect(
      IMLADRIS_METRIC_DEFINITIONS.find((metric) => metric.key === "marketing.conversion_rate")?.unit,
    ).toBe("percent");
    expect(
      IMLADRIS_METRIC_DEFINITIONS.find((metric) => metric.key === "revenue.customer_count")?.unit,
    ).toBe("count");
    expect(
      IMLADRIS_METRIC_DEFINITIONS.find((metric) => metric.key === "revenue.total_revenue")?.unit,
    ).toBe("currency");
  });
});
