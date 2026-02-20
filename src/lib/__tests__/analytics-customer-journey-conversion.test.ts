import { describe, expect, it } from "vitest";
import type {
  CustomerJourneyData,
  CustomerJourneyRecord,
  Touchpoint,
} from "@/lib/analytics/types";

/**
 * Re-implement the pure derivation helpers from the conversion tab so we can
 * unit-test them without needing React / DOM.
 *
 * These mirror buildStageConversions, buildSourceConversions, and
 * buildPathConversions in customer-journey-conversion-tab.tsx.
 */

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}

interface StageConversionRow {
  fromStage: string;
  toStage: string;
  fromCount: number;
  toCount: number;
  conversionRate: number;
  avgDaysInStage: number;
  revenueAtRisk: number;
}

interface SourceConversionRow {
  source: string;
  totalJourneys: number;
  converted: number;
  conversionRate: number;
  totalRevenue: number;
  avgDaysToClose: number;
}

interface PathConversionRow {
  path: string;
  channels: string[];
  journeyCount: number;
  convertedCount: number;
  conversionRate: number;
  avgValue: number;
  avgDays: number;
}

function buildStageConversions(journeys: CustomerJourneyRecord[]): StageConversionRow[] {
  const stageOrder = new Map<string, number>();
  const stageCounts = new Map<string, { count: number; totalDays: number; totalValue: number }>();

  for (const j of journeys) {
    const stage = j.currentStage;
    if (!stageOrder.has(stage)) stageOrder.set(stage, stageOrder.size);
    const entry = stageCounts.get(stage) ?? { count: 0, totalDays: 0, totalValue: 0 };
    entry.count += 1;
    entry.totalDays += j.daysInPipeline;
    entry.totalValue += j.value;
    stageCounts.set(stage, entry);
  }

  const stages = Array.from(stageOrder.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([s]) => s);

  const rows: StageConversionRow[] = [];
  for (let i = 0; i < stages.length - 1; i++) {
    const from = stageCounts.get(stages[i])!;
    const to = stageCounts.get(stages[i + 1])!;
    rows.push({
      fromStage: stages[i],
      toStage: stages[i + 1],
      fromCount: from.count,
      toCount: to.count,
      conversionRate: pct(to.count, from.count),
      avgDaysInStage: from.count > 0 ? Math.round(from.totalDays / from.count) : 0,
      revenueAtRisk: Math.max(0, from.totalValue - to.totalValue),
    });
  }
  return rows;
}

function buildSourceConversions(journeys: CustomerJourneyRecord[]): SourceConversionRow[] {
  const CLOSE_STAGES = new Set(["Closed Won", "Subscription", "Active"]);
  const byFirstChannel = new Map<string, { total: number; converted: number; revenue: number; totalDays: number }>();

  for (const j of journeys) {
    const firstChannel = j.touchpoints[0]?.channel;
    if (!firstChannel) continue;
    const entry = byFirstChannel.get(firstChannel) ?? { total: 0, converted: 0, revenue: 0, totalDays: 0 };
    entry.total += 1;
    entry.totalDays += j.daysInPipeline;
    if (CLOSE_STAGES.has(j.currentStage)) {
      entry.converted += 1;
      entry.revenue += j.value;
    }
    byFirstChannel.set(firstChannel, entry);
  }

  return Array.from(byFirstChannel.entries())
    .map(([channel, stats]) => ({
      source: channel,
      totalJourneys: stats.total,
      converted: stats.converted,
      conversionRate: pct(stats.converted, stats.total),
      totalRevenue: stats.revenue,
      avgDaysToClose: stats.total > 0 ? Math.round(stats.totalDays / stats.total) : 0,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
}

function buildPathConversions(journey: CustomerJourneyData): PathConversionRow[] {
  const CLOSE_STAGES = new Set(["Closed Won", "Subscription", "Active"]);

  const pathMap = new Map<string, {
    channels: string[];
    count: number;
    converted: number;
    totalValue: number;
    totalDays: number;
  }>();

  for (const j of journey.journeys) {
    const channels = [...new Set(j.touchpoints.map((tp) => tp.channel))];
    if (channels.length === 0) continue;
    const key = channels.join(" → ");
    const entry = pathMap.get(key) ?? { channels, count: 0, converted: 0, totalValue: 0, totalDays: 0 };
    entry.count += 1;
    entry.totalDays += j.daysInPipeline;
    if (CLOSE_STAGES.has(j.currentStage)) {
      entry.converted += 1;
      entry.totalValue += j.value;
    }
    pathMap.set(key, entry);
  }

  return Array.from(pathMap.entries())
    .map(([path, stats]) => ({
      path,
      channels: stats.channels,
      journeyCount: stats.count,
      convertedCount: stats.converted,
      conversionRate: pct(stats.converted, stats.count),
      avgValue: stats.converted > 0 ? Math.round(stats.totalValue / stats.converted) : 0,
      avgDays: stats.count > 0 ? Math.round(stats.totalDays / stats.count) : 0,
    }))
    .sort((a, b) => b.conversionRate - a.conversionRate || b.journeyCount - a.journeyCount)
    .slice(0, 10);
}

// ── Fixture helpers ──

function tp(channel: Touchpoint["channel"], type: Touchpoint["type"] = "deal-created", detail = ""): Touchpoint {
  return { timestamp: "2026-01-15T00:00:00Z", channel, type, detail, value: null };
}

function journey(
  overrides: Partial<CustomerJourneyRecord> & Pick<CustomerJourneyRecord, "currentStage" | "touchpoints">,
): CustomerJourneyRecord {
  return {
    dealId: `deal-${Math.random().toString(36).slice(2, 6)}`,
    dealName: "Test Deal",
    contactEmail: "test@example.com",
    value: 5000,
    firstTouch: "2026-01-01T00:00:00Z",
    lastTouch: "2026-01-20T00:00:00Z",
    daysInPipeline: 20,
    ...overrides,
  };
}

function journeyData(journeys: CustomerJourneyRecord[]): CustomerJourneyData {
  return {
    journeys,
    touchpointSummary: [],
    avgTouchpoints: 0,
    medianDaysToClose: 0,
    topPaths: [],
    attribution: [],
  };
}

// ── Tests ──

describe("customer journey conversion analysis", () => {
  describe("buildStageConversions", () => {
    it("returns empty array for no journeys", () => {
      expect(buildStageConversions([])).toEqual([]);
    });

    it("computes stage-to-stage conversion rates", () => {
      const journeys: CustomerJourneyRecord[] = [
        journey({ currentStage: "Lead", touchpoints: [tp("hubspot")], value: 1000, daysInPipeline: 5 }),
        journey({ currentStage: "Lead", touchpoints: [tp("hubspot")], value: 2000, daysInPipeline: 10 }),
        journey({ currentStage: "Lead", touchpoints: [tp("hubspot")], value: 1500, daysInPipeline: 7 }),
        journey({ currentStage: "Demo Scheduled", touchpoints: [tp("hubspot")], value: 3000, daysInPipeline: 15 }),
        journey({ currentStage: "Demo Scheduled", touchpoints: [tp("hubspot")], value: 2500, daysInPipeline: 12 }),
        journey({ currentStage: "Closed Won", touchpoints: [tp("hubspot")], value: 4000, daysInPipeline: 30 }),
      ];

      const rows = buildStageConversions(journeys);
      expect(rows).toHaveLength(2);

      // Lead → Demo Scheduled: 2 of 3 = 66.7%
      expect(rows[0].fromStage).toBe("Lead");
      expect(rows[0].toStage).toBe("Demo Scheduled");
      expect(rows[0].fromCount).toBe(3);
      expect(rows[0].toCount).toBe(2);
      expect(rows[0].conversionRate).toBeCloseTo(66.7, 0);

      // Demo Scheduled → Closed Won: 1 of 2 = 50%
      expect(rows[1].fromStage).toBe("Demo Scheduled");
      expect(rows[1].toStage).toBe("Closed Won");
      expect(rows[1].conversionRate).toBe(50);
    });

    it("calculates revenue at risk between stages", () => {
      const journeys: CustomerJourneyRecord[] = [
        journey({ currentStage: "Lead", touchpoints: [tp("hubspot")], value: 10000 }),
        journey({ currentStage: "Demo Scheduled", touchpoints: [tp("hubspot")], value: 3000 }),
      ];

      const rows = buildStageConversions(journeys);
      expect(rows[0].revenueAtRisk).toBe(7000);
    });

    it("calculates average days in stage", () => {
      const journeys: CustomerJourneyRecord[] = [
        journey({ currentStage: "Lead", touchpoints: [tp("hubspot")], daysInPipeline: 10 }),
        journey({ currentStage: "Lead", touchpoints: [tp("hubspot")], daysInPipeline: 20 }),
        journey({ currentStage: "Demo Scheduled", touchpoints: [tp("hubspot")], daysInPipeline: 5 }),
      ];

      const rows = buildStageConversions(journeys);
      expect(rows[0].avgDaysInStage).toBe(15); // (10+20)/2
    });
  });

  describe("buildSourceConversions", () => {
    it("returns empty array for no journeys", () => {
      expect(buildSourceConversions([])).toEqual([]);
    });

    it("groups by first-touch channel and computes conversion rates", () => {
      const journeys: CustomerJourneyRecord[] = [
        journey({ currentStage: "Lead", touchpoints: [tp("google-ads"), tp("hubspot")], value: 0 }),
        journey({ currentStage: "Closed Won", touchpoints: [tp("google-ads"), tp("stripe")], value: 5000 }),
        journey({ currentStage: "Closed Won", touchpoints: [tp("hubspot")], value: 3000 }),
        journey({ currentStage: "Lead", touchpoints: [tp("hubspot")], value: 0 }),
      ];

      const rows = buildSourceConversions(journeys);

      // HubSpot: 2 total, 1 converted = 50%, revenue 3000
      const hubspot = rows.find((r) => r.source === "hubspot");
      expect(hubspot).toBeDefined();
      expect(hubspot!.totalJourneys).toBe(2);
      expect(hubspot!.converted).toBe(1);
      expect(hubspot!.conversionRate).toBe(50);
      expect(hubspot!.totalRevenue).toBe(3000);

      // Google Ads: 2 total, 1 converted = 50%, revenue 5000
      const gads = rows.find((r) => r.source === "google-ads");
      expect(gads).toBeDefined();
      expect(gads!.totalJourneys).toBe(2);
      expect(gads!.converted).toBe(1);
      expect(gads!.totalRevenue).toBe(5000);
    });

    it("recognises Subscription and Active as closed stages", () => {
      const journeys: CustomerJourneyRecord[] = [
        journey({ currentStage: "Subscription", touchpoints: [tp("stripe")], value: 2000 }),
        journey({ currentStage: "Active", touchpoints: [tp("stripe")], value: 1000 }),
        journey({ currentStage: "Lead", touchpoints: [tp("stripe")], value: 0 }),
      ];

      const rows = buildSourceConversions(journeys);
      const stripe = rows.find((r) => r.source === "stripe");
      expect(stripe!.converted).toBe(2);
      expect(stripe!.totalRevenue).toBe(3000);
      expect(stripe!.conversionRate).toBeCloseTo(66.7, 0);
    });

    it("skips journeys with no touchpoints", () => {
      const journeys: CustomerJourneyRecord[] = [
        journey({ currentStage: "Lead", touchpoints: [] }),
      ];

      const rows = buildSourceConversions(journeys);
      expect(rows).toHaveLength(0);
    });

    it("sorts by total revenue descending", () => {
      const journeys: CustomerJourneyRecord[] = [
        journey({ currentStage: "Closed Won", touchpoints: [tp("hubspot")], value: 1000 }),
        journey({ currentStage: "Closed Won", touchpoints: [tp("stripe")], value: 9000 }),
      ];

      const rows = buildSourceConversions(journeys);
      expect(rows[0].source).toBe("stripe");
      expect(rows[1].source).toBe("hubspot");
    });
  });

  describe("buildPathConversions", () => {
    it("returns empty array for no journeys", () => {
      expect(buildPathConversions(journeyData([]))).toEqual([]);
    });

    it("groups journeys by unique channel sequence", () => {
      const journeys: CustomerJourneyRecord[] = [
        journey({ currentStage: "Closed Won", touchpoints: [tp("google-ads"), tp("hubspot")], value: 5000 }),
        journey({ currentStage: "Lead", touchpoints: [tp("google-ads"), tp("hubspot")], value: 0 }),
        journey({ currentStage: "Closed Won", touchpoints: [tp("hubspot")], value: 3000 }),
      ];

      const rows = buildPathConversions(journeyData(journeys));

      expect(rows.length).toBeGreaterThanOrEqual(2);

      const gadsToHs = rows.find((r) => r.path === "google-ads → hubspot");
      expect(gadsToHs).toBeDefined();
      expect(gadsToHs!.journeyCount).toBe(2);
      expect(gadsToHs!.convertedCount).toBe(1);
      expect(gadsToHs!.conversionRate).toBe(50);

      const hsOnly = rows.find((r) => r.path === "hubspot");
      expect(hsOnly).toBeDefined();
      expect(hsOnly!.journeyCount).toBe(1);
      expect(hsOnly!.convertedCount).toBe(1);
      expect(hsOnly!.conversionRate).toBe(100);
    });

    it("deduplicates channels within a single journey", () => {
      const journeys: CustomerJourneyRecord[] = [
        journey({
          currentStage: "Closed Won",
          touchpoints: [tp("hubspot"), tp("hubspot"), tp("stripe")],
          value: 4000,
        }),
      ];

      const rows = buildPathConversions(journeyData(journeys));
      expect(rows).toHaveLength(1);
      expect(rows[0].path).toBe("hubspot → stripe");
      expect(rows[0].channels).toEqual(["hubspot", "stripe"]);
    });

    it("limits results to top 10 paths", () => {
      const journeys: CustomerJourneyRecord[] = [];
      const channels: Touchpoint["channel"][] = [
        "hubspot", "stripe", "google-ads", "meta-ads",
        "webflow", "pylon", "slack", "coda",
        "google-analytics", "mercury", "google-workspace", "reddit-ads",
      ];

      // Create 12 distinct single-channel paths
      for (const ch of channels) {
        journeys.push(journey({ currentStage: "Closed Won", touchpoints: [tp(ch)], value: 1000 }));
      }

      const rows = buildPathConversions(journeyData(journeys));
      expect(rows.length).toBeLessThanOrEqual(10);
    });

    it("sorts by conversion rate descending, then journey count descending", () => {
      const journeys: CustomerJourneyRecord[] = [
        // Path A: 1/1 = 100%
        journey({ currentStage: "Closed Won", touchpoints: [tp("stripe")], value: 1000 }),
        // Path B: 2/3 = 66.7%
        journey({ currentStage: "Closed Won", touchpoints: [tp("hubspot")], value: 2000 }),
        journey({ currentStage: "Closed Won", touchpoints: [tp("hubspot")], value: 1000 }),
        journey({ currentStage: "Lead", touchpoints: [tp("hubspot")], value: 0 }),
      ];

      const rows = buildPathConversions(journeyData(journeys));
      expect(rows[0].conversionRate).toBeGreaterThanOrEqual(rows[1].conversionRate);
    });

    it("computes avgValue only from converted journeys", () => {
      const journeys: CustomerJourneyRecord[] = [
        journey({ currentStage: "Closed Won", touchpoints: [tp("hubspot")], value: 6000 }),
        journey({ currentStage: "Closed Won", touchpoints: [tp("hubspot")], value: 4000 }),
        journey({ currentStage: "Lead", touchpoints: [tp("hubspot")], value: 1000 }),
      ];

      const rows = buildPathConversions(journeyData(journeys));
      const hs = rows.find((r) => r.path === "hubspot");
      // avgValue should be (6000+4000)/2 = 5000, not including the Lead deal
      expect(hs!.avgValue).toBe(5000);
    });
  });

  describe("pct helper", () => {
    it("returns 0 when denominator is 0", () => {
      expect(pct(5, 0)).toBe(0);
    });

    it("rounds to one decimal place", () => {
      expect(pct(1, 3)).toBeCloseTo(33.3, 0);
      expect(pct(2, 3)).toBeCloseTo(66.7, 0);
    });

    it("returns exact percentage for clean divisions", () => {
      expect(pct(1, 2)).toBe(50);
      expect(pct(1, 4)).toBe(25);
      expect(pct(3, 4)).toBe(75);
    });
  });
});
