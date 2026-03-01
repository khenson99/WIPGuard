import { describe, expect, it } from "vitest";
import {
  buildPathConversions,
  buildSourceConversions,
  buildStageConversions,
  pct,
} from "@/lib/analytics/customer-journey-conversion";
import type {
  CustomerJourneyData,
  CustomerJourneyRecord,
  Touchpoint,
} from "@/lib/analytics/types";

function tp(
  channel: Touchpoint["channel"],
  type: Touchpoint["type"] = "engagement",
  detail = "",
): Touchpoint {
  return {
    timestamp: "2026-01-15T00:00:00Z",
    channel,
    type,
    detail,
    value: null,
  };
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

describe("customer journey conversion helpers", () => {
  describe("pct", () => {
    it("returns 0 when denominator is 0", () => {
      expect(pct(5, 0)).toBe(0);
    });

    it("rounds to one decimal place", () => {
      expect(pct(1, 3)).toBeCloseTo(33.3, 0);
      expect(pct(2, 3)).toBeCloseTo(66.7, 0);
    });
  });

  describe("buildStageConversions", () => {
    it("returns empty array for no journeys", () => {
      expect(buildStageConversions([])).toEqual([]);
    });

    it("uses canonical stage order instead of encounter order", () => {
      const rows = buildStageConversions([
        // Deliberately unsorted, Closed Won appears first.
        journey({ currentStage: "Closed Won", touchpoints: [tp("hubspot")], value: 4000 }),
        journey({ currentStage: "Lead", touchpoints: [tp("hubspot")], value: 1000 }),
        journey({ currentStage: "Lead", touchpoints: [tp("hubspot")], value: 2000 }),
        journey({ currentStage: "Lead", touchpoints: [tp("hubspot")], value: 1500 }),
        journey({ currentStage: "Demo Scheduled", touchpoints: [tp("hubspot")], value: 3000 }),
        journey({ currentStage: "Demo Scheduled", touchpoints: [tp("hubspot")], value: 2500 }),
      ]);

      expect(rows).toHaveLength(2);
      expect(rows[0].fromStage).toBe("Lead");
      expect(rows[0].toStage).toBe("Demo Scheduled");
      expect(rows[0].conversionRate).toBeCloseTo(66.7, 0);
      expect(rows[1].fromStage).toBe("Demo Scheduled");
      expect(rows[1].toStage).toBe("Closed Won");
      expect(rows[1].conversionRate).toBe(50);
    });

    it("caps conversion rate at 100 when later-stage count exceeds earlier-stage count", () => {
      const rows = buildStageConversions([
        journey({ currentStage: "Lead", touchpoints: [tp("hubspot")] }),
        journey({ currentStage: "Demo Scheduled", touchpoints: [tp("hubspot")] }),
        journey({ currentStage: "Demo Scheduled", touchpoints: [tp("hubspot")] }),
      ]);

      expect(rows[0].conversionRate).toBe(100);
    });

    it("calculates revenue at risk and average days in stage", () => {
      const rows = buildStageConversions([
        journey({ currentStage: "Lead", touchpoints: [tp("hubspot")], value: 10000, daysInPipeline: 10 }),
        journey({ currentStage: "Lead", touchpoints: [tp("hubspot")], value: 2000, daysInPipeline: 20 }),
        journey({ currentStage: "Demo Scheduled", touchpoints: [tp("hubspot")], value: 3000, daysInPipeline: 5 }),
      ]);

      expect(rows[0].avgDaysInStage).toBe(15);
      expect(rows[0].revenueAtRisk).toBe(9000);
    });
  });

  describe("buildSourceConversions", () => {
    it("groups by first-touch channel and sorts by revenue", () => {
      const rows = buildSourceConversions([
        journey({ currentStage: "Lead", touchpoints: [tp("google-ads"), tp("hubspot")], value: 0 }),
        journey({ currentStage: "Closed Won", touchpoints: [tp("google-ads"), tp("stripe")], value: 5000 }),
        journey({ currentStage: "Closed Won", touchpoints: [tp("hubspot")], value: 3000 }),
        journey({ currentStage: "Lead", touchpoints: [tp("hubspot")], value: 0 }),
      ]);

      expect(rows[0].source).toBe("Google Ads");
      expect(rows[0].totalRevenue).toBe(5000);

      const hubspot = rows.find((row) => row.source === "HubSpot");
      expect(hubspot).toBeDefined();
      expect(hubspot?.totalJourneys).toBe(2);
      expect(hubspot?.converted).toBe(1);
      expect(hubspot?.conversionRate).toBe(50);
      expect(hubspot?.totalRevenue).toBe(3000);
    });

    it("treats Subscription and Active as closed stages", () => {
      const rows = buildSourceConversions([
        journey({ currentStage: "Subscription", touchpoints: [tp("stripe")], value: 2000 }),
        journey({ currentStage: "Active", touchpoints: [tp("stripe")], value: 1000 }),
        journey({ currentStage: "Lead", touchpoints: [tp("stripe")], value: 0 }),
      ]);

      expect(rows[0].source).toBe("Stripe");
      expect(rows[0].converted).toBe(2);
      expect(rows[0].totalRevenue).toBe(3000);
      expect(rows[0].conversionRate).toBeCloseTo(66.7, 0);
    });

    it("skips journeys with no touchpoints", () => {
      const rows = buildSourceConversions([
        journey({ currentStage: "Lead", touchpoints: [] }),
      ]);

      expect(rows).toEqual([]);
    });
  });

  describe("buildPathConversions", () => {
    it("groups by unique channel sequence", () => {
      const rows = buildPathConversions(journeyData([
        journey({ currentStage: "Closed Won", touchpoints: [tp("google-ads"), tp("hubspot")], value: 5000 }),
        journey({ currentStage: "Lead", touchpoints: [tp("google-ads"), tp("hubspot")], value: 0 }),
        journey({ currentStage: "Closed Won", touchpoints: [tp("hubspot")], value: 3000 }),
      ]));

      const gadsToHs = rows.find((row) => row.path === "google-ads → hubspot");
      expect(gadsToHs?.journeyCount).toBe(2);
      expect(gadsToHs?.convertedCount).toBe(1);
      expect(gadsToHs?.conversionRate).toBe(50);

      const hsOnly = rows.find((row) => row.path === "hubspot");
      expect(hsOnly?.journeyCount).toBe(1);
      expect(hsOnly?.convertedCount).toBe(1);
      expect(hsOnly?.conversionRate).toBe(100);
    });

    it("deduplicates channels within a single journey", () => {
      const rows = buildPathConversions(journeyData([
        journey({
          currentStage: "Closed Won",
          touchpoints: [tp("hubspot"), tp("hubspot"), tp("stripe")],
          value: 4000,
        }),
      ]));

      expect(rows).toHaveLength(1);
      expect(rows[0].path).toBe("hubspot → stripe");
      expect(rows[0].channels).toEqual(["hubspot", "stripe"]);
    });

    it("limits output to top 10 paths", () => {
      const channels: Touchpoint["channel"][] = [
        "hubspot",
        "stripe",
        "google-ads",
        "meta-ads",
        "webflow",
        "pylon",
        "slack",
        "coda",
        "google-analytics",
        "mercury",
        "google-workspace",
        "reddit-ads",
      ];

      const journeys = channels.map((channel) =>
        journey({ currentStage: "Closed Won", touchpoints: [tp(channel)], value: 1000 }),
      );

      const rows = buildPathConversions(journeyData(journeys));
      expect(rows.length).toBeLessThanOrEqual(10);
    });

    it("computes avgValue using only converted journeys", () => {
      const rows = buildPathConversions(journeyData([
        journey({ currentStage: "Closed Won", touchpoints: [tp("hubspot")], value: 6000 }),
        journey({ currentStage: "Closed Won", touchpoints: [tp("hubspot")], value: 4000 }),
        journey({ currentStage: "Lead", touchpoints: [tp("hubspot")], value: 1000 }),
      ]));

      const hs = rows.find((row) => row.path === "hubspot");
      expect(hs?.avgValue).toBe(5000);
    });
  });
});
