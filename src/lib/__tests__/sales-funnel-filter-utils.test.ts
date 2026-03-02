import { describe, it, expect } from "vitest";
import {
  filterDeals,
  getDateRangeFromPreset,
  extractReps,
  recomputeFunnelMetrics,
} from "../sales-funnel-filter-utils";
import type { FunnelDeal } from "../sales-funnel-filter-utils";

// ---------- Test data factory ----------

function makeDeal(overrides: Partial<FunnelDeal> = {}): FunnelDeal {
  return {
    dealId: "d1",
    dealName: "Test Deal",
    stageId: "discovery",
    stageLabel: "Prospect",
    amount: 1000,
    source: "Website",
    ownerId: "rep-1",
    repName: "Alice",
    createdAt: new Date().toISOString(),
    closedAt: null,
    stripeCustomerId: null,
    ...overrides,
  };
}

// ---------- getDateRangeFromPreset ----------

describe("getDateRangeFromPreset", () => {
  it('returns null start for "all"', () => {
    const { start } = getDateRangeFromPreset("all");
    expect(start).toBeNull();
  });

  it('returns start ~7 days ago for "7d"', () => {
    const { start } = getDateRangeFromPreset("7d");
    const diffDays = (Date.now() - start!.getTime()) / (1000 * 60 * 60 * 24);
    // setHours(0,0,0,0) rounds to midnight, so diff may be slightly over N days
    expect(diffDays).toBeGreaterThanOrEqual(6.9);
    expect(diffDays).toBeLessThanOrEqual(7.5);
  });

  it('returns start ~30 days ago for "30d"', () => {
    const { start } = getDateRangeFromPreset("30d");
    const diffDays = (Date.now() - start!.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(29.9);
    expect(diffDays).toBeLessThanOrEqual(30.5);
  });

  it('returns start ~90 days ago for "90d"', () => {
    const { start } = getDateRangeFromPreset("90d");
    const diffDays = (Date.now() - start!.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(89.9);
    expect(diffDays).toBeLessThanOrEqual(90.5);
  });
});

// ---------- filterDeals ----------

describe("filterDeals", () => {
  it("returns all deals when preset is all and no rep filter", () => {
    const deals = [makeDeal(), makeDeal({ dealId: "d2" })];
    const range = getDateRangeFromPreset("all");
    expect(filterDeals(deals, range, null)).toHaveLength(2);
  });

  it("filters by rep id", () => {
    const deals = [
      makeDeal({ dealId: "d1", ownerId: "rep-1" }),
      makeDeal({ dealId: "d2", ownerId: "rep-2" }),
    ];
    const range = getDateRangeFromPreset("all");
    const result = filterDeals(deals, range, "rep-1");
    expect(result).toHaveLength(1);
    expect(result[0].dealId).toBe("d1");
  });

  it("filters out deals older than date range", () => {
    const old = new Date();
    old.setDate(old.getDate() - 60);
    const deals = [
      makeDeal({ dealId: "d1", createdAt: new Date().toISOString() }),
      makeDeal({ dealId: "d2", createdAt: old.toISOString() }),
    ];
    const range = getDateRangeFromPreset("30d");
    expect(filterDeals(deals, range, null)).toHaveLength(1);
  });

  it("applies both date and rep filters together", () => {
    const old = new Date();
    old.setDate(old.getDate() - 60);
    const deals = [
      makeDeal({ dealId: "d1", ownerId: "rep-1", createdAt: new Date().toISOString() }),
      makeDeal({ dealId: "d2", ownerId: "rep-2", createdAt: new Date().toISOString() }),
      makeDeal({ dealId: "d3", ownerId: "rep-1", createdAt: old.toISOString() }),
    ];
    const range = getDateRangeFromPreset("30d");
    const result = filterDeals(deals, range, "rep-1");
    expect(result).toHaveLength(1);
    expect(result[0].dealId).toBe("d1");
  });

  it("treats deal with null createdAt as unfiltered by date", () => {
    const deals = [makeDeal({ dealId: "d1", createdAt: null })];
    const range = getDateRangeFromPreset("7d");
    // null createdAt should pass the date filter (no date to compare)
    expect(filterDeals(deals, range, null)).toHaveLength(1);
  });

  it("returns empty array when all deals filtered out", () => {
    const old = new Date();
    old.setDate(old.getDate() - 90);
    const deals = [makeDeal({ createdAt: old.toISOString() })];
    const range = getDateRangeFromPreset("7d");
    expect(filterDeals(deals, range, null)).toHaveLength(0);
  });
});

// ---------- extractReps ----------

describe("extractReps", () => {
  it("returns unique reps sorted by name", () => {
    const deals = [
      makeDeal({ dealId: "d1", ownerId: "r2", repName: "Zara" }),
      makeDeal({ dealId: "d2", ownerId: "r1", repName: "Alice" }),
      makeDeal({ dealId: "d3", ownerId: "r2", repName: "Zara" }),
    ];
    const reps = extractReps(deals);
    expect(reps).toHaveLength(2);
    expect(reps[0].name).toBe("Alice");
    expect(reps[0].id).toBe("r1");
    expect(reps[1].name).toBe("Zara");
    expect(reps[1].id).toBe("r2");
  });

  it("skips deals with null ownerId", () => {
    const deals = [
      makeDeal({ ownerId: null }),
      makeDeal({ dealId: "d2", ownerId: "r1", repName: "Bob" }),
    ];
    const reps = extractReps(deals);
    expect(reps).toHaveLength(1);
    expect(reps[0].name).toBe("Bob");
  });

  it("returns empty array for empty deals", () => {
    expect(extractReps([])).toHaveLength(0);
  });
});

// ---------- recomputeFunnelMetrics ----------

describe("recomputeFunnelMetrics", () => {
  it("returns zero metrics for empty deals", () => {
    const result = recomputeFunnelMetrics([]);
    expect(result.totalDeals).toBe(0);
    expect(result.closedWon).toBe(0);
    expect(result.winRate).toBe(0);
    expect(result.stages).toHaveLength(0);
  });

  it("counts deals per stage", () => {
    const deals = [
      makeDeal({ dealId: "d1", stageLabel: "Prospect" }),
      makeDeal({ dealId: "d2", stageLabel: "Prospect" }),
      makeDeal({ dealId: "d3", stageLabel: "Demo Scheduled" }),
    ];
    const result = recomputeFunnelMetrics(deals, ["Prospect", "Demo Scheduled"]);
    const prospect = result.stages.find((s) => s.label === "Prospect");
    const demo = result.stages.find((s) => s.label === "Demo Scheduled");
    expect(prospect?.count).toBe(2);
    expect(demo?.count).toBe(1);
  });

  it("sums amounts per stage", () => {
    const deals = [
      makeDeal({ dealId: "d1", stageLabel: "Prospect", amount: 500 }),
      makeDeal({ dealId: "d2", stageLabel: "Prospect", amount: 300 }),
    ];
    const result = recomputeFunnelMetrics(deals);
    expect(result.stages[0].value).toBe(800);
  });

  it("computes win rate from closed won / (won + lost)", () => {
    const deals = [
      makeDeal({ dealId: "d1", stageLabel: "Closed Won", amount: 1000 }),
      makeDeal({ dealId: "d2", stageLabel: "Closed Won", amount: 1000 }),
      makeDeal({ dealId: "d3", stageLabel: "Closed Lost", amount: 0 }),
      makeDeal({ dealId: "d4", stageLabel: "Closed Lost", amount: 0 }),
    ];
    const result = recomputeFunnelMetrics(deals);
    expect(result.closedWon).toBe(2);
    expect(result.closedLost).toBe(2);
    expect(result.winRate).toBe(50);
  });

  it("computes effective win rate including unlikely + churn in denominator", () => {
    const deals = [
      makeDeal({ dealId: "d1", stageLabel: "Closed Won" }),
      makeDeal({ dealId: "d2", stageLabel: "Closed Lost" }),
      makeDeal({ dealId: "d3", stageLabel: "Unlikely" }),
      makeDeal({ dealId: "d4", stageLabel: "Churn" }),
    ];
    const result = recomputeFunnelMetrics(deals);
    // 1 won / (1 + 1 + 1 + 1) = 25%
    expect(result.effectiveWinRate).toBe(25);
  });

  it("computes no-show rate from demo-booked stages", () => {
    const deals = [
      makeDeal({ dealId: "d1", stageLabel: "Demo Scheduled" }),
      makeDeal({ dealId: "d2", stageLabel: "Demo Scheduled" }),
      makeDeal({ dealId: "d3", stageLabel: "No-Show/Reschedule" }),
      makeDeal({ dealId: "d4", stageLabel: "No-Show/Reschedule" }),
      makeDeal({ dealId: "d5", stageLabel: "Closed Won" }),
    ];
    const result = recomputeFunnelMetrics(deals);
    // noShows=2, demoBooked stages = Demo Scheduled (2) + No-Show (2) + Closed Won (1) = 5
    expect(result.noShows).toBe(2);
    expect(result.noShowRate).toBeCloseTo(40, 0);
  });

  it("computes average deal size", () => {
    const deals = [
      makeDeal({ dealId: "d1", amount: 1000 }),
      makeDeal({ dealId: "d2", amount: 3000 }),
    ];
    const result = recomputeFunnelMetrics(deals);
    expect(result.avgDealSize).toBe(2000);
  });

  it("groups deals by rep with closed won tracking", () => {
    const deals = [
      makeDeal({ dealId: "d1", ownerId: "r1", repName: "Alice", stageLabel: "Closed Won", amount: 2000 }),
      makeDeal({ dealId: "d2", ownerId: "r1", repName: "Alice", stageLabel: "Prospect", amount: 1000 }),
    ];
    const result = recomputeFunnelMetrics(deals);
    expect(result.dealsByRep).toHaveLength(1);
    const alice = result.dealsByRep[0];
    expect(alice.repName).toBe("Alice");
    expect(alice.count).toBe(2);
    expect(alice.closedWon).toBe(1);
    expect(alice.closedWonValue).toBe(2000);
  });

  it("groups deals by source", () => {
    const deals = [
      makeDeal({ dealId: "d1", source: "Organic" }),
      makeDeal({ dealId: "d2", source: "Referral" }),
      makeDeal({ dealId: "d3", source: "Organic" }),
    ];
    const result = recomputeFunnelMetrics(deals);
    const organic = result.dealsBySource.find((s) => s.source === "Organic");
    expect(organic?.count).toBe(2);
  });

  it("respects explicit stageOrder for stage ordering", () => {
    const deals = [
      makeDeal({ dealId: "d1", stageLabel: "Demo Scheduled" }),
      makeDeal({ dealId: "d2", stageLabel: "Prospect" }),
    ];
    const result = recomputeFunnelMetrics(deals, ["Prospect", "Demo Scheduled"]);
    expect(result.stages[0].label).toBe("Prospect");
    expect(result.stages[1].label).toBe("Demo Scheduled");
  });
});
