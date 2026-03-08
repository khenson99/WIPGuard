import { describe, expect, it } from "vitest";
import { parseVisitorFunnelFilters } from "@/lib/analytics/visitor-funnel";

describe("parseVisitorFunnelFilters", () => {
  it("parses the reddit quick filter and normalized source filters", () => {
    const params = new URLSearchParams({
      channel: "all",
      source: "Reddit",
      campaign: "Launch-Week",
      stage: "trial_started",
      quickFilter: "reddit",
      knownOnly: "true",
    });

    expect(parseVisitorFunnelFilters(params)).toEqual({
      channel: "all",
      source: "reddit",
      campaign: "launch-week",
      stage: "trial_started",
      quickFilter: "reddit",
      knownOnly: true,
    });
  });

  it("falls back to safe defaults for unsupported values", () => {
    const params = new URLSearchParams({
      channel: "",
      stage: "bogus_stage",
      quickFilter: "linkedin",
    });

    expect(parseVisitorFunnelFilters(params)).toEqual({
      channel: "all",
      source: null,
      campaign: null,
      stage: "all",
      quickFilter: "all",
      knownOnly: false,
    });
  });
});
