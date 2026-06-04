import { describe, expect, it } from "vitest";

import {
  normalizeMetricConfidence,
  normalizeMetricStatus,
  normalizeMetricWarnings,
} from "@/lib/imladris/confidence";

describe("normalizeMetricConfidence", () => {
  it("normalizes percentage-scale confidence values to ratios", () => {
    expect(normalizeMetricConfidence("87%")).toBe(0.87);
    expect(normalizeMetricConfidence("87,5%")).toBe(0.875);
    expect(normalizeMetricConfidence("87 percent")).toBe(0.87);
    expect(normalizeMetricConfidence("87,5 percent")).toBe(0.875);
    expect(normalizeMetricConfidence("87 pct")).toBe(0.87);
    expect(normalizeMetricConfidence("1%")).toBe(0.01);
    expect(normalizeMetricConfidence("87")).toBe(0.87);
    expect(normalizeMetricConfidence("0,875")).toBe(0.875);
    expect(normalizeMetricConfidence(87)).toBe(1);
  });

  it("unwraps object-shaped provider confidence envelopes before normalizing values", () => {
    expect(normalizeMetricConfidence({ confidence: "87%" })).toBe(0.87);
    expect(normalizeMetricConfidence({ score: "73 percent" })).toBe(0.73);
    expect(
      normalizeMetricConfidence({
        data: {
          attributes: {
            metricConfidence: "0,875",
          },
        },
      }),
    ).toBe(0.875);
    expect(normalizeMetricConfidence({ value: { confidence_score: 0.42 } })).toBe(0.42);
  });

  it("unwraps direct data value confidence envelopes before normalizing values", () => {
    expect(
      normalizeMetricConfidence({
        data: {
          value: {
            confidenceScore: "87 percent",
          },
        },
      }),
    ).toBe(0.87);
  });

  it("unwraps direct data confidence envelopes before normalizing values", () => {
    expect(
      normalizeMetricConfidence({
        data: {
          confidenceScore: "87 percent",
        },
      }),
    ).toBe(0.87);
    expect(
      normalizeMetricConfidence({
        data: {
          confidence: "0,875",
        },
      }),
    ).toBe(0.875);
  });

  it("unwraps single-value confidence arrays before normalizing values", () => {
    expect(normalizeMetricConfidence(["87%"])).toBe(0.87);
    expect(
      normalizeMetricConfidence({
        data: {
          attributes: {
            confidenceScore: ["73 percent"],
          },
        },
      }),
    ).toBe(0.73);
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

  it("unwraps common provider warning envelopes", () => {
    expect(
      normalizeMetricWarnings({
        data: {
          attributes: {
            warnings: [" Stripe coverage is partial. ", "", "Slack context is missing."],
          },
        },
        messages: [{ message: "HubSpot sync is stale." }],
        error: { detail: "Google Ads import timed out." },
      }),
    ).toEqual([
      "Stripe coverage is partial.",
      "Slack context is missing.",
      "HubSpot sync is stale.",
      "Google Ads import timed out.",
    ]);
  });

  it("unwraps single-value warning envelopes before normalizing provider warnings", () => {
    expect(
      normalizeMetricWarnings({
        data: {
          attributes: {
            value: {
              warnings: [" Stripe import completed with warnings. "],
              messages: [{ message: "HubSpot context is missing." }],
            },
          },
        },
        metricValue: {
          error: {
            detail: "Mercury balance snapshot is stale.",
          },
        },
      }),
    ).toEqual([
      "Stripe import completed with warnings.",
      "HubSpot context is missing.",
      "Mercury balance snapshot is stale.",
    ]);
  });

  it("unwraps direct data value warning envelopes before normalizing provider warnings", () => {
    expect(
      normalizeMetricWarnings({
        data: {
          value: {
            warnings: [" Stripe import completed with warnings. "],
            error: { detail: "Mercury balance snapshot is stale." },
          },
        },
      }),
    ).toEqual([
      "Stripe import completed with warnings.",
      "Mercury balance snapshot is stale.",
    ]);
  });

  it("unwraps direct data warning envelopes before normalizing provider warnings", () => {
    expect(
      normalizeMetricWarnings({
        data: {
          warning: " Mercury sync is stale. ",
          error: { detail: "Stripe coverage is partial." },
        },
      }),
    ).toEqual(["Mercury sync is stale.", "Stripe coverage is partial."]);
  });

  it("ignores recursive provider warning envelopes after collecting reachable warnings", () => {
    const envelope: Record<string, unknown> = {
      messages: [{ message: "HubSpot sync is stale." }],
    };
    envelope.value = envelope;

    expect(normalizeMetricWarnings(envelope)).toEqual(["HubSpot sync is stale."]);
  });
});

describe("normalizeMetricStatus", () => {
  it("normalizes common provider and materializer status aliases", () => {
    expect(normalizeMetricStatus("complete")).toBe("ready");
    expect(normalizeMetricStatus("success")).toBe("ready");
    expect(normalizeMetricStatus("ready-with-warnings")).toBe("partial");
    expect(normalizeMetricStatus("in progress")).toBe("partial");
    expect(normalizeMetricStatus("timed out")).toBe("error");
    expect(normalizeMetricStatus("expired")).toBe("stale");
    expect(normalizeMetricStatus("not_found")).toBe("missing");
  });

  it("unwraps object-shaped provider status envelopes before normalizing aliases", () => {
    expect(normalizeMetricStatus({ status: "complete" })).toBe("ready");
    expect(normalizeMetricStatus({ state: "ready-with-warnings" })).toBe("partial");
    expect(
      normalizeMetricStatus({
        data: {
          attributes: {
            status: "timed out",
          },
        },
      }),
    ).toBe("error");
    expect(normalizeMetricStatus({ value: { status: "expired" } })).toBe("stale");
  });

  it("unwraps direct data value status envelopes before normalizing aliases", () => {
    expect(
      normalizeMetricStatus({
        data: {
          value: {
            status: "ready-with-warnings",
          },
        },
      }),
    ).toBe("partial");
  });

  it("unwraps direct data status envelopes before normalizing aliases", () => {
    expect(
      normalizeMetricStatus({
        data: {
          status: "ready-with-warnings",
        },
      }),
    ).toBe("partial");
    expect(
      normalizeMetricStatus({
        data: {
          state: "timed out",
        },
      }),
    ).toBe("error");
  });

  it("unwraps single-value status arrays before normalizing aliases", () => {
    expect(normalizeMetricStatus(["timed out"])).toBe("error");
    expect(
      normalizeMetricStatus({
        data: {
          attributes: {
            status: ["ready-with-warnings"],
          },
        },
      }),
    ).toBe("partial");
  });
});
