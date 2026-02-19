import { resolveAnalyticsChildRenderKind } from "@/components/analytics/analytics-section-page";

describe("analytics child section rendering", () => {
  it("routes finance hubspot to finance-specific renderer", () => {
    expect(
      resolveAnalyticsChildRenderKind({
        childId: "finance-hubspot",
        childDataDomain: "hubspot",
      })
    ).toBe("finance-hubspot");
  });

  it("routes sales hubspot to sales funnel renderer", () => {
    expect(
      resolveAnalyticsChildRenderKind({
        childId: "sales-hubspot",
        childDataDomain: "hubspot",
      })
    ).toBe("sales-hubspot");
  });

  it("routes finance stripe to finance-stripe renderer", () => {
    expect(
      resolveAnalyticsChildRenderKind({
        childId: "finance-stripe",
        childDataDomain: "stripe",
      })
    ).toBe("finance-stripe");
  });

  it("routes sales stripe to sales-stripe renderer", () => {
    expect(
      resolveAnalyticsChildRenderKind({
        childId: "sales-stripe",
        childDataDomain: "stripe",
      })
    ).toBe("sales-stripe");
  });

  it("uses snapshot fallback for generic integrations", () => {
    expect(
      resolveAnalyticsChildRenderKind({
        childId: "ads-unknown",
        childDataDomain: "unknown",
      })
    ).toBe("snapshot");
  });
});
