import { describe, expect, it } from "vitest";
import {
  ANALYTICS_PRIMARY_SECTIONS,
  LEGACY_ANALYTICS_ROUTE_REDIRECTS,
  ANALYTICS_SUB_SECTIONS,
  LEGACY_ANALYTICS_TAB_REDIRECTS,
  getAnalyticsPrimaryForSection,
  getAnalyticsSecondaryForPrimary,
} from "@/lib/analytics/section-registry";

describe("analytics section registry", () => {
  it("includes required primary sections", () => {
    const ids = new Set(ANALYTICS_PRIMARY_SECTIONS.map((section) => section.id));
    expect(ids.has("ads-traffic")).toBe(true);
    expect(ids.has("finance")).toBe(true);
    expect(ids.has("sales-pipeline")).toBe(true);
    expect(ids.has("customer-success")).toBe(true);
    expect(ids.has("customer-journey")).toBe(true);
    expect(ids.has("demo-analytics")).toBe(true);
    expect(ids.has("process-analytics")).toBe(true);
  });

  it("keeps the remaining customer-success child sections", () => {
    const ids = new Set(ANALYTICS_SUB_SECTIONS.map((section) => section.id));
    expect(ids.has("cs-pylon")).toBe(true);
    expect(ids.has("cs-coda")).toBe(true);
    expect(ids.has("cs-product")).toBe(true);
  });

  it("omits removed task-management analytics sections", () => {
    const ids = new Set(ANALYTICS_SUB_SECTIONS.map((section) => section.id));
    expect(ids.has("cs-decision-dashboard")).toBe(false);
    expect(ids.has("cs-flow-metrics")).toBe(false);
    expect(ids.has("cs-flow-risk")).toBe(false);
    expect(ids.has("cs-observability")).toBe(false);
  });

  it("maps legacy analytics tabs to new primary routes", () => {
    expect(LEGACY_ANALYTICS_TAB_REDIRECTS.overview).toBe("/analytics");
    expect(LEGACY_ANALYTICS_TAB_REDIRECTS.sales).toBe("/analytics/sales-pipeline");
    expect(LEGACY_ANALYTICS_TAB_REDIRECTS.finance).toBe("/analytics/finance");
    expect(LEGACY_ANALYTICS_TAB_REDIRECTS.marketing).toBe("/analytics/ads-traffic");
    expect(LEGACY_ANALYTICS_TAB_REDIRECTS.tasks).toBe("/analytics/customer-success");
    expect(LEGACY_ANALYTICS_TAB_REDIRECTS.journey).toBe("/analytics/customer-journey");
    expect(LEGACY_ANALYTICS_TAB_REDIRECTS.demos).toBe("/analytics/demo-analytics");
    expect(LEGACY_ANALYTICS_TAB_REDIRECTS.process).toBe("/analytics/process-analytics");
  });

  it("redirects removed customer-success ops routes to the parent dashboard", () => {
    expect(LEGACY_ANALYTICS_ROUTE_REDIRECTS["decision-dashboard"]).toBe("/analytics/customer-success");
    expect(LEGACY_ANALYTICS_ROUTE_REDIRECTS["flow-metrics"]).toBe("/analytics/customer-success");
    expect(LEGACY_ANALYTICS_ROUTE_REDIRECTS["flow-risk"]).toBe("/analytics/customer-success");
    expect(LEGACY_ANALYTICS_ROUTE_REDIRECTS.observability).toBe("/analytics/customer-success");
    expect(LEGACY_ANALYTICS_ROUTE_REDIRECTS["cs-decision-dashboard"]).toBe("/analytics/customer-success");
    expect(LEGACY_ANALYTICS_ROUTE_REDIRECTS["cs-flow-metrics"]).toBe("/analytics/customer-success");
    expect(LEGACY_ANALYTICS_ROUTE_REDIRECTS["cs-flow-risk"]).toBe("/analytics/customer-success");
    expect(LEGACY_ANALYTICS_ROUTE_REDIRECTS["cs-observability"]).toBe("/analytics/customer-success");
  });

  it("returns the owning primary section for child routes", () => {
    expect(getAnalyticsPrimaryForSection("ads-google-ads")?.id).toBe("ads-traffic");
    expect(getAnalyticsPrimaryForSection("finance-stripe")?.id).toBe("finance");
    expect(getAnalyticsPrimaryForSection("sales-hubspot")?.id).toBe("sales-pipeline");
    expect(getAnalyticsPrimaryForSection("cs-pylon")?.id).toBe("customer-success");
    expect(getAnalyticsPrimaryForSection("cj-overview")?.id).toBe("customer-journey");
    expect(getAnalyticsPrimaryForSection("cj-conversion")?.id).toBe("customer-journey");
    expect(getAnalyticsPrimaryForSection("demo-scheduling")?.id).toBe("demo-analytics");
    expect(getAnalyticsPrimaryForSection("process-bottlenecks")?.id).toBe("process-analytics");
    expect(getAnalyticsPrimaryForSection("missing")).toBeNull();
  });

  it("ensures each tier-1 dashboard has integration sub-tabs", () => {
    expect(getAnalyticsSecondaryForPrimary("ads-traffic").length).toBeGreaterThan(0);
    expect(getAnalyticsSecondaryForPrimary("finance").length).toBeGreaterThan(0);
    expect(getAnalyticsSecondaryForPrimary("sales-pipeline").length).toBeGreaterThan(0);
    expect(getAnalyticsSecondaryForPrimary("customer-success").length).toBeGreaterThan(0);
    expect(getAnalyticsSecondaryForPrimary("customer-journey").length).toBeGreaterThan(0);
    expect(getAnalyticsSecondaryForPrimary("demo-analytics").length).toBeGreaterThan(0);
    expect(getAnalyticsSecondaryForPrimary("process-analytics").length).toBeGreaterThan(0);
  });
});
