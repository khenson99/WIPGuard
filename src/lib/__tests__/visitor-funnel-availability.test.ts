import { describe, expect, it } from "vitest";
import { hasVisitorFunnelPrismaModels } from "@/lib/analytics/visitor-funnel-availability";

describe("hasVisitorFunnelPrismaModels", () => {
  it("returns false when funnel delegates exist without the required methods", () => {
    expect(
      hasVisitorFunnelPrismaModels({
        funnelVisitor: {},
        funnelEvent: { upsert: () => ({}) },
        funnelIdentityLink: { upsert: () => ({}) },
        funnelEnrichmentSignal: { findFirst: () => null },
      })
    ).toBe(false);
  });

  it("returns true when all required funnel delegate methods are present", () => {
    expect(
      hasVisitorFunnelPrismaModels({
        funnelVisitor: {
          findUnique: () => null,
          upsert: () => ({}),
        },
        funnelEvent: {
          upsert: () => ({}),
        },
        funnelIdentityLink: {
          upsert: () => ({}),
        },
        funnelEnrichmentSignal: {
          count: () => 0,
          findFirst: () => null,
          upsert: () => ({}),
          update: () => ({}),
        },
      })
    ).toBe(true);
  });
});
