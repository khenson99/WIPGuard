import { describe, expect, it } from "vitest";
import {
  ANALYTICS_PRIMARY_SECTIONS,
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
  });

  it("includes customer-success and ops child sections", () => {
    const ids = new Set(ANALYTICS_SUB_SECTIONS.map((section) => section.id));
    expect(ids.has("cs-pylon")).toBe(true);
    expect(ids.has("cs-coda")).toBe(true);
    expect(ids.has("cs-product")).toBe(true);
    expect(ids.has("cs-decision-dashboard")).toBe(true);
    expect(ids.has("cs-flow-metrics")).toBe(true);
    expect(ids.has("cs-flow-risk")).toBe(true);
    expect(ids.has("cs-observability")).toBe(true);
  });

  it("maps legacy analytics tabs to new primary routes", () => {
    expect(LEGACY_ANALYTICS_TAB_REDIRECTS.overview).toBe("/analytics");
    expect(LEGACY_ANALYTICS_TAB_REDIRECTS.sales).toBe("/analytics/sales-pipeline");
    expect(LEGACY_ANALYTICS_TAB_REDIRECTS.finance).toBe("/analytics/finance");
    expect(LEGACY_ANALYTICS_TAB_REDIRECTS.marketing).toBe("/analytics/ads-traffic");
    expect(LEGACY_ANALYTICS_TAB_REDIRECTS.tasks).toBe("/analytics/customer-success");
  });

  it("returns the owning primary section for child routes", () => {
    expect(getAnalyticsPrimaryForSection("ads-google-ads")?.id).toBe("ads-traffic");
    expect(getAnalyticsPrimaryForSection("finance-stripe")?.id).toBe("finance");
    expect(getAnalyticsPrimaryForSection("sales-hubspot")?.id).toBe("sales-pipeline");
    expect(getAnalyticsPrimaryForSection("cs-pylon")?.id).toBe("customer-success");
    expect(getAnalyticsPrimaryForSection("missing")).toBeNull();
  });

  it("ensures each tier-1 dashboard has integration sub-tabs", () => {
    expect(getAnalyticsSecondaryForPrimary("ads-traffic").length).toBeGreaterThan(0);
    expect(getAnalyticsSecondaryForPrimary("finance").length).toBeGreaterThan(0);
    expect(getAnalyticsSecondaryForPrimary("sales-pipeline").length).toBeGreaterThan(0);
    expect(getAnalyticsSecondaryForPrimary("customer-success").length).toBeGreaterThan(0);
  });
});
