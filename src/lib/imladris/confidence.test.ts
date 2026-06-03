import { describe, expect, it } from "vitest";

import { normalizeMetricConfidence, normalizeMetricWarnings } from "@/lib/imladris/confidence";

describe("normalizeMetricConfidence", () => {
  it("normalizes percentage-scale confidence values to ratios", () => {
    expect(normalizeMetricConfidence("87%")).toBe(0.87);
    expect(normalizeMetricConfidence("1%")).toBe(0.01);
    expect(normalizeMetricConfidence("87")).toBe(0.87);
    expect(normalizeMetricConfidence(87)).toBe(1);
  });
});

describe("normalizeMetricWarnings", () => {
  it("trims warning text and deduplicates repeated provider warnings", () => {
    expect(
      normalizeMetricWarnings([
        " Stripe coverage is partial. ",
        "",
        "Stripe coverage is partial.",
        "HubSpot source is stale.",
        42,
        " HubSpot source is stale. ",
      ]),
    ).toEqual(["Stripe coverage is partial.", "HubSpot source is stale."]);
  });
});
