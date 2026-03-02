import { describe, it, expect } from "vitest";
import { matchJourneysToPath } from "./path-matching";
import type { CustomerJourneyRecord } from "@/lib/analytics/types";

function makeJourney(overrides: Partial<CustomerJourneyRecord> & { channels: string[] }): CustomerJourneyRecord {
  const { channels, ...rest } = overrides;
  return {
    dealId: "deal-1",
    dealName: "Test Deal",
    contactEmail: null,
    currentStage: "Closed Won",
    value: 10000,
    touchpoints: channels.map((ch, i) => ({
      timestamp: `2026-01-0${i + 1}T00:00:00Z`,
      phase: "crm",
      channel: ch as never,
      type: "engagement",
      detail: ch,
      value: null,
    })),
    firstTouch: "2026-01-01T00:00:00Z",
    lastTouch: "2026-01-10T00:00:00Z",
    daysInPipeline: 10,
    ...rest,
  };
}

const journeys: CustomerJourneyRecord[] = [
  makeJourney({ dealId: "1", dealName: "Acme Corp", value: 50000, channels: ["google-ads", "hubspot", "stripe"] }),
  makeJourney({ dealId: "2", dealName: "Beta Inc", value: 30000, channels: ["meta-ads", "hubspot"] }),
  makeJourney({ dealId: "3", dealName: "Gamma LLC", value: 75000, channels: ["google-ads", "meta-ads", "hubspot", "stripe"] }),
  makeJourney({ dealId: "4", dealName: "Delta Co", value: 20000, channels: ["hubspot"] }),
];

describe("matchJourneysToPath", () => {
  it("returns journeys whose channel sequence starts with the target path", () => {
    // Journey "2" has sequence ["meta-ads", "hubspot"] — exact match
    // Journey "3" has sequence ["google-ads", "meta-ads", "hubspot", "stripe"] — contains it as subseq
    const result = matchJourneysToPath(journeys, ["meta-ads", "hubspot"] as never);
    const ids = result.map((j) => j.id);
    expect(ids).toContain("2");
    expect(ids).toContain("3");
  });

  it("does not return journeys whose channel sequence does not contain the target", () => {
    // Journey "4" only has ["hubspot"], no meta-ads
    const result = matchJourneysToPath(journeys, ["meta-ads", "hubspot"] as never);
    const ids = result.map((j) => j.id);
    expect(ids).not.toContain("4");
  });

  it("returns multiple journeys when several match", () => {
    const result = matchJourneysToPath(journeys, ["hubspot"] as never);
    expect(result.length).toBe(4);
  });

  it("returns empty array when no journeys match", () => {
    const result = matchJourneysToPath(journeys, ["pylon"] as never);
    expect(result.length).toBe(0);
  });

  it("returns empty array for empty path", () => {
    const result = matchJourneysToPath(journeys, []);
    expect(result.length).toBe(0);
  });

  it("returns empty array for empty journeys", () => {
    const result = matchJourneysToPath([], ["hubspot"] as never);
    expect(result.length).toBe(0);
  });

  it("handles single-stage path", () => {
    const result = matchJourneysToPath(journeys, ["stripe"] as never);
    const ids = result.map((j) => j.id);
    expect(ids).toContain("1");
    expect(ids).toContain("3");
    expect(ids).not.toContain("2");
    expect(ids).not.toContain("4");
  });

  it("returns only display fields, not full journey", () => {
    const result = matchJourneysToPath(journeys, ["google-ads", "hubspot"] as never);
    expect(result.length).toBeGreaterThan(0);
    const first = result[0];
    expect(first.id).toBeTruthy();
    expect(first.dealName).toBeTruthy();
    expect(typeof first.value).toBe("number");
    expect(typeof first.daysInPipeline).toBe("number");
    expect("touchpoints" in first).toBe(false);
    expect("stageHistory" in first).toBe(false);
  });

  it("deduplicates repeated channels before matching", () => {
    const withRepeats = [
      makeJourney({ dealId: "5", channels: ["hubspot", "stripe", "hubspot", "google-ads"] }),
    ];
    // Deduped sequence is: hubspot, stripe, google-ads
    const result = matchJourneysToPath(withRepeats, ["stripe", "google-ads"] as never);
    expect(result.length).toBe(1);
  });

  it("does not match non-contiguous subsequences", () => {
    // Journey has google-ads → hubspot → stripe
    // Looking for google-ads → stripe (non-contiguous, skipping hubspot)
    const result = matchJourneysToPath(
      [makeJourney({ dealId: "6", channels: ["google-ads", "hubspot", "stripe"] })],
      ["google-ads", "stripe"] as never,
    );
    // google-ads and stripe are NOT contiguous in that journey, so no match
    expect(result.length).toBe(0);
  });
});
