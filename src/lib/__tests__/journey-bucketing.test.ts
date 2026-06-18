import { describe, it, expect } from "vitest";
import {
  bucketJourneysByMonth,
  computeTrendIndicator,
  computeTrends,
} from "@/lib/journey-bucketing";
import type { JourneyRecord, MonthBucket } from "@/lib/journey-bucketing";

// ── Fixtures ──

function makeJourney(overrides: Partial<JourneyRecord> & Pick<JourneyRecord, "createdAt" | "stage" | "isConverted">): JourneyRecord {
  return {
    id: `deal-${Math.random().toString(36).slice(2, 8)}`,
    ...overrides,
  };
}

// ── bucketJourneysByMonth ──

describe("bucketJourneysByMonth", () => {
  it("returns [] for empty input", () => {
    expect(bucketJourneysByMonth([])).toEqual([]);
  });

  it("creates one bucket for a single journey", () => {
    const journeys = [
      makeJourney({ createdAt: "2026-01-15T00:00:00Z", stage: "Lead", isConverted: false }),
    ];
    const buckets = bucketJourneysByMonth(journeys);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].key).toBe("2026-01");
    expect(buckets[0].totalJourneys).toBe(1);
    expect(buckets[0].conversions).toBe(0);
    expect(buckets[0].conversionRate).toBe(0);
  });

  it("produces sorted buckets across multiple months", () => {
    const journeys = [
      makeJourney({ createdAt: "2026-03-01T00:00:00Z", stage: "Lead", isConverted: false }),
      makeJourney({ createdAt: "2026-01-01T00:00:00Z", stage: "Lead", isConverted: false }),
      makeJourney({ createdAt: "2026-02-01T00:00:00Z", stage: "Closed Won", isConverted: true }),
    ];
    const buckets = bucketJourneysByMonth(journeys);
    expect(buckets).toHaveLength(3);
    expect(buckets[0].key).toBe("2026-01");
    expect(buckets[1].key).toBe("2026-02");
    expect(buckets[2].key).toBe("2026-03");
  });

  it("groups multiple journeys into the same month bucket", () => {
    const journeys = [
      makeJourney({ createdAt: "2026-01-05T00:00:00Z", stage: "Lead", isConverted: false }),
      makeJourney({ createdAt: "2026-01-20T00:00:00Z", stage: "Closed Won", isConverted: true }),
      makeJourney({ createdAt: "2026-01-28T00:00:00Z", stage: "Closed Won", isConverted: true }),
    ];
    const bucket = bucketJourneysByMonth(journeys)[0];
    expect(bucket.totalJourneys).toBe(3);
    expect(bucket.conversions).toBe(2);
    expect(bucket.conversionRate).toBeCloseTo(2 / 3);
  });

  it("computes per-stage breakdown correctly", () => {
    const journeys = [
      makeJourney({ createdAt: "2026-01-01T00:00:00Z", stage: "Lead", isConverted: false }),
      makeJourney({ createdAt: "2026-01-02T00:00:00Z", stage: "Lead", isConverted: false }),
      makeJourney({ createdAt: "2026-01-03T00:00:00Z", stage: "Closed Won", isConverted: true }),
    ];
    const bucket = bucketJourneysByMonth(journeys)[0];
    expect(bucket.stageBreakdown["Lead"].entered).toBe(2);
    expect(bucket.stageBreakdown["Lead"].converted).toBe(0);
    expect(bucket.stageBreakdown["Lead"].conversionRate).toBe(0);
    expect(bucket.stageBreakdown["Closed Won"].entered).toBe(1);
    expect(bucket.stageBreakdown["Closed Won"].converted).toBe(1);
    expect(bucket.stageBreakdown["Closed Won"].conversionRate).toBe(1);
  });

  it("returns 0 conversionRate (not NaN) when there are no conversions", () => {
    const journeys = [
      makeJourney({ createdAt: "2026-02-10T00:00:00Z", stage: "Lead", isConverted: false }),
    ];
    const bucket = bucketJourneysByMonth(journeys)[0];
    expect(bucket.conversionRate).toBe(0);
    expect(Number.isNaN(bucket.conversionRate)).toBe(false);
  });

  it("skips journeys with invalid createdAt dates", () => {
    const journeys = [
      makeJourney({ createdAt: "not-a-date", stage: "Lead", isConverted: false }),
      makeJourney({ createdAt: "2026-01-01T00:00:00Z", stage: "Lead", isConverted: false }),
    ];
    const buckets = bucketJourneysByMonth(journeys);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].totalJourneys).toBe(1);
  });

  it("buckets a journey at a month boundary into the correct month", () => {
    const journeys = [
      // Last second of January (UTC)
      makeJourney({ createdAt: "2026-01-31T23:59:59Z", stage: "Lead", isConverted: false }),
      // First second of February (UTC)
      makeJourney({ createdAt: "2026-02-01T00:00:00Z", stage: "Closed Won", isConverted: true }),
    ];
    const buckets = bucketJourneysByMonth(journeys);
    expect(buckets).toHaveLength(2);
    expect(buckets[0].key).toBe("2026-01");
    expect(buckets[1].key).toBe("2026-02");
  });

  it("handles large datasets efficiently", () => {
    const count = 100_000;
    const journeys: JourneyRecord[] = Array.from({ length: count }, (_, i) => ({
      id: `deal-${i}`,
      createdAt: new Date(2026, i % 12, 1 + (i % 28)).toISOString(),
      stage: i % 5 === 0 ? "Closed Won" : "Lead",
      isConverted: i % 5 === 0,
    }));
    const start = Date.now();
    const buckets = bucketJourneysByMonth(journeys);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
    expect(buckets.length).toBeGreaterThan(0);
  });
});

// ── computeTrendIndicator ──

describe("computeTrendIndicator", () => {
  it("returns 'up' when current > previous", () => {
    const t = computeTrendIndicator(100, 80, "Feb 2026", "Jan 2026");
    expect(t.direction).toBe("up");
    expect(t.absoluteChange).toBe(20);
    expect(t.percentChange).toBeCloseTo(25);
  });

  it("returns 'down' when current < previous", () => {
    const t = computeTrendIndicator(60, 80, "Feb 2026", "Jan 2026");
    expect(t.direction).toBe("down");
    expect(t.absoluteChange).toBe(-20);
    expect(t.percentChange).toBeCloseTo(-25);
  });

  it("returns 'flat' when current === previous", () => {
    const t = computeTrendIndicator(50, 50, "Feb 2026", "Jan 2026");
    expect(t.direction).toBe("flat");
    expect(t.absoluteChange).toBe(0);
    expect(t.percentChange).toBe(0);
  });

  it("returns 'flat' with percentChange=0 when both values are 0", () => {
    const t = computeTrendIndicator(0, 0, "Feb 2026", "Jan 2026");
    expect(t.direction).toBe("flat");
    expect(t.percentChange).toBe(0);
  });

  it("returns null percentChange when previous is 0 and current > 0", () => {
    const t = computeTrendIndicator(50, 0, "Feb 2026", "Jan 2026");
    expect(t.direction).toBe("up");
    expect(t.percentChange).toBeNull();
    expect(t.absoluteChange).toBe(50);
  });

  it("stores currentPeriod and previousPeriod labels", () => {
    const t = computeTrendIndicator(10, 5, "Mar 2026", "Feb 2026");
    expect(t.currentPeriod).toBe("Mar 2026");
    expect(t.previousPeriod).toBe("Feb 2026");
    expect(t.currentValue).toBe(10);
    expect(t.previousValue).toBe(5);
  });
});

// ── computeTrends ──

describe("computeTrends", () => {
  it("returns hasEnoughData=false for 0 complete buckets", () => {
    const result = computeTrends([]);
    expect(result.hasEnoughData).toBe(false);
  });

  it("returns hasEnoughData=false for 1 complete bucket", () => {
    const buckets: MonthBucket[] = [
      {
        key: "2025-12",
        label: "Dec 2025",
        totalJourneys: 10,
        conversions: 3,
        conversionRate: 0.3,
        stageBreakdown: {},
      },
    ];
    const result = computeTrends(buckets);
    expect(result.hasEnoughData).toBe(false);
    expect(result.kpiTrends.totalJourneys.direction).toBe("insufficient");
    expect(result.stageTrends).toEqual({});
  });

  it("uses the two most recent complete months for comparison", () => {
    // Use dates well in the past so they are never "current month"
    const buckets: MonthBucket[] = [
      { key: "2025-10", label: "Oct 2025", totalJourneys: 5, conversions: 1, conversionRate: 0.2, stageBreakdown: {} },
      { key: "2025-11", label: "Nov 2025", totalJourneys: 10, conversions: 3, conversionRate: 0.3, stageBreakdown: {} },
      { key: "2025-12", label: "Dec 2025", totalJourneys: 15, conversions: 6, conversionRate: 0.4, stageBreakdown: {} },
    ];
    const result = computeTrends(buckets);
    expect(result.hasEnoughData).toBe(true);
    // Should compare Dec (current) vs Nov (previous)
    expect(result.kpiTrends.totalJourneys.currentValue).toBe(15);
    expect(result.kpiTrends.totalJourneys.previousValue).toBe(10);
    expect(result.kpiTrends.totalJourneys.direction).toBe("up");
  });

  it("excludes the current calendar month from comparison", () => {
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const prev2Date = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const prev2Key = `${prev2Date.getFullYear()}-${String(prev2Date.getMonth() + 1).padStart(2, "0")}`;

    const buckets: MonthBucket[] = [
      { key: prev2Key, label: "Prev-2", totalJourneys: 5, conversions: 1, conversionRate: 0.2, stageBreakdown: {} },
      { key: prevKey, label: "Prev-1", totalJourneys: 10, conversions: 4, conversionRate: 0.4, stageBreakdown: {} },
      // Current month with only a few days of data — should be excluded
      { key: currentKey, label: "Current", totalJourneys: 2, conversions: 0, conversionRate: 0, stageBreakdown: {} },
    ];

    const result = computeTrends(buckets);
    expect(result.hasEnoughData).toBe(true);
    // Comparison should be prev-1 vs prev-2 (current month excluded)
    expect(result.kpiTrends.totalJourneys.currentValue).toBe(10);
    expect(result.kpiTrends.totalJourneys.previousValue).toBe(5);
  });

  it("computes stage-level trends from the stageBreakdown", () => {
    const buckets: MonthBucket[] = [
      {
        key: "2025-11",
        label: "Nov 2025",
        totalJourneys: 10,
        conversions: 2,
        conversionRate: 0.2,
        stageBreakdown: {
          "Closed Won": { entered: 2, converted: 2, conversionRate: 1.0 },
          Lead: { entered: 8, converted: 0, conversionRate: 0.0 },
        },
      },
      {
        key: "2025-12",
        label: "Dec 2025",
        totalJourneys: 10,
        conversions: 4,
        conversionRate: 0.4,
        stageBreakdown: {
          "Closed Won": { entered: 4, converted: 4, conversionRate: 1.0 },
          Lead: { entered: 6, converted: 0, conversionRate: 0.0 },
        },
      },
    ];
    const result = computeTrends(buckets);
    expect(result.hasEnoughData).toBe(true);
    // Both have the same conversionRate for "Closed Won" → flat
    expect(result.stageTrends["Closed Won"].direction).toBe("flat");
    // Both have 0% for Lead → flat
    expect(result.stageTrends["Lead"].direction).toBe("flat");
  });

  it("includes stages only present in one period (filled with 0 for missing)", () => {
    const buckets: MonthBucket[] = [
      {
        key: "2025-11",
        label: "Nov 2025",
        totalJourneys: 5,
        conversions: 1,
        conversionRate: 0.2,
        stageBreakdown: {
          Lead: { entered: 4, converted: 0, conversionRate: 0.0 },
          "Closed Won": { entered: 1, converted: 1, conversionRate: 1.0 },
        },
      },
      {
        key: "2025-12",
        label: "Dec 2025",
        totalJourneys: 8,
        conversions: 2,
        conversionRate: 0.25,
        stageBreakdown: {
          // "Lead" is missing from Dec (no leads entered this month)
          "Closed Won": { entered: 2, converted: 2, conversionRate: 1.0 },
          "New Stage": { entered: 6, converted: 0, conversionRate: 0.0 },
        },
      },
    ];
    const result = computeTrends(buckets);
    // All stages from both periods should be represented
    expect("Lead" in result.stageTrends).toBe(true);
    expect("Closed Won" in result.stageTrends).toBe(true);
    expect("New Stage" in result.stageTrends).toBe(true);
  });

  it("passes all buckets through in the result", () => {
    const buckets: MonthBucket[] = [
      { key: "2025-11", label: "Nov 2025", totalJourneys: 5, conversions: 1, conversionRate: 0.2, stageBreakdown: {} },
      { key: "2025-12", label: "Dec 2025", totalJourneys: 8, conversions: 2, conversionRate: 0.25, stageBreakdown: {} },
    ];
    const result = computeTrends(buckets);
    expect(result.buckets).toHaveLength(2);
    expect(result.buckets).toEqual(buckets);
  });
});
