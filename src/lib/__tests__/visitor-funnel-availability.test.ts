import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getVisitorFunnelPrisma,
  hasVisitorFunnelPrismaModels,
} from "@/lib/analytics/visitor-funnel-availability";

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
          findMany: () => [],
          upsert: () => ({}),
          update: () => ({}),
        },
        funnelEvent: {
          create: () => ({}),
          upsert: () => ({}),
        },
        funnelIdentityLink: {
          findFirst: () => null,
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

describe("getVisitorFunnelPrisma", () => {
  it("returns null when required delegates are missing", () => {
    expect(
      getVisitorFunnelPrisma({
        funnelVisitor: {
          findUnique: () => null,
        },
      })
    ).toBeNull();
  });
});

describe("visitor funnel Prisma schema", () => {
  it("declares the models required by the runtime visitor funnel delegates", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

    expect(schema).toContain("model FunnelVisitor");
    expect(schema).toContain("model FunnelEvent");
    expect(schema).toContain("model FunnelIdentityLink");
    expect(schema).toContain("model FunnelEnrichmentSignal");
    expect(schema).toContain("enum FunnelEventType");
    expect(schema).toContain("enum FunnelIdentityType");
    expect(schema).toContain("enum FunnelLinkProvenance");
    expect(schema).toContain("enum EnrichmentProvider");
  });
});
