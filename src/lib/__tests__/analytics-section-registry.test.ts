import { describe, expect, it } from "vitest";
import {
  ANALYTICS_SECTION_REGISTRY,
  LEGACY_ANALYTICS_TAB_REDIRECTS,
  getAnalyticsSectionById,
} from "@/lib/analytics/section-registry";

describe("analytics section registry", () => {
  it("includes all required top-level section routes", () => {
    const ids = new Set(ANALYTICS_SECTION_REGISTRY.map((section) => section.id));

    expect(ids.has("overview")).toBe(true);
    expect(ids.has("sales")).toBe(true);
    expect(ids.has("finance")).toBe(true);
    expect(ids.has("marketing")).toBe(true);
    expect(ids.has("tasks")).toBe(true);
    expect(ids.has("hubspot")).toBe(true);
    expect(ids.has("stripe")).toBe(true);
    expect(ids.has("mercury")).toBe(true);
    expect(ids.has("google-analytics")).toBe(true);
    expect(ids.has("google-ads")).toBe(true);
    expect(ids.has("meta-ads")).toBe(true);
    expect(ids.has("meta-page")).toBe(true);
    expect(ids.has("reddit-ads")).toBe(true);
    expect(ids.has("webflow")).toBe(true);
    expect(ids.has("coda")).toBe(true);
    expect(ids.has("semrush")).toBe(true);
    expect(ids.has("decision-dashboard")).toBe(true);
    expect(ids.has("flow-metrics")).toBe(true);
    expect(ids.has("flow-risk")).toBe(true);
    expect(ids.has("observability")).toBe(true);
  });

  it("maps legacy analytics tabs to section routes", () => {
    expect(LEGACY_ANALYTICS_TAB_REDIRECTS.overview).toBe("/analytics/overview");
    expect(LEGACY_ANALYTICS_TAB_REDIRECTS.sales).toBe("/analytics/sales");
    expect(LEGACY_ANALYTICS_TAB_REDIRECTS.finance).toBe("/analytics/finance");
    expect(LEGACY_ANALYTICS_TAB_REDIRECTS.marketing).toBe("/analytics/marketing");
    expect(LEGACY_ANALYTICS_TAB_REDIRECTS.tasks).toBe("/analytics/tasks");
  });

  it("returns null for unknown sections", () => {
    expect(getAnalyticsSectionById("missing")).toBeNull();
  });
});
