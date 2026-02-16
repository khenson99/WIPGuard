import { describe, expect, it } from "vitest";
import { buildNavItems } from "@/components/layout/sidebar-nav-config";

describe("buildNavItems", () => {
  it("returns analytics groups with children", () => {
    const items = buildNavItems();
    const adsTraffic = items.find((i) => i.id === "ads-traffic");
    expect(adsTraffic).toBeDefined();
    expect(adsTraffic!.children!.length).toBeGreaterThan(0);
  });

  it("includes Customer Journey and AI Insights as flat items", () => {
    const items = buildNavItems();
    const journey = items.find((i) => i.id === "customer-journey");
    const insights = items.find((i) => i.id === "ai-insights");
    expect(journey).toBeDefined();
    expect(insights).toBeDefined();
    expect(journey!.children).toBeUndefined();
    expect(insights!.children).toBeUndefined();
  });

  it("preserves non-analytics flat items", () => {
    const items = buildNavItems();
    const dashboard = items.find((i) => i.id === "dashboard");
    expect(dashboard).toBeDefined();
    expect(dashboard!.children).toBeUndefined();
  });
});
