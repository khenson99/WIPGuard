import { describe, expect, it } from "vitest";
import { computeConferenceStats } from "../compute-conference-stats";
import type { ConferenceListItem } from "@/types";

// Minimal stub satisfying ConferenceListItem for testing
function makeConf(
  overrides: Partial<ConferenceListItem> & {
    startDate: string;
    endDate: string;
    leads?: number;
  }
): ConferenceListItem {
  return {
    id: "c1",
    slug: "test",
    name: "Test Conf",
    websiteUrl: null,
    timezone: "UTC",
    city: null,
    region: null,
    country: null,
    venue: null,
    status: "confirmed",
    type: "conference",
    ownerId: null,
    owner: null,
    primaryProjectId: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    _count: {
      deadlines: 0,
      leads: overrides.leads ?? 0,
      expenses: 0,
      tasks: 0,
      projects: 0,
    },
    ...overrides,
  } as ConferenceListItem;
}

const NOW = new Date("2026-06-15T00:00:00Z");

describe("computeConferenceStats", () => {
  it("returns zeroes for empty array", () => {
    expect(computeConferenceStats([], NOW)).toEqual({
      total: 0,
      upcoming: 0,
      inProgress: 0,
      past: 0,
      totalLeads: 0,
    });
  });

  it("classifies a future conference as upcoming", () => {
    const conf = makeConf({ startDate: "2026-07-01", endDate: "2026-07-03" });
    const result = computeConferenceStats([conf], NOW);
    expect(result.upcoming).toBe(1);
    expect(result.inProgress).toBe(0);
    expect(result.past).toBe(0);
  });

  it("classifies a past conference correctly", () => {
    const conf = makeConf({ startDate: "2026-01-01", endDate: "2026-01-05" });
    const result = computeConferenceStats([conf], NOW);
    expect(result.past).toBe(1);
    expect(result.upcoming).toBe(0);
    expect(result.inProgress).toBe(0);
  });

  it("classifies a conference in progress (started, not ended)", () => {
    const conf = makeConf({ startDate: "2026-06-10", endDate: "2026-06-20" });
    const result = computeConferenceStats([conf], NOW);
    expect(result.inProgress).toBe(1);
    expect(result.upcoming).toBe(0);
    expect(result.past).toBe(0);
  });

  it("handles mixed states correctly", () => {
    const conferences = [
      makeConf({ id: "a", startDate: "2026-07-01", endDate: "2026-07-03" }), // upcoming
      makeConf({ id: "b", startDate: "2026-01-01", endDate: "2026-01-05" }), // past
      makeConf({ id: "c", startDate: "2026-06-10", endDate: "2026-06-20" }), // inProgress
    ];
    const result = computeConferenceStats(conferences, NOW);
    expect(result).toEqual({ total: 3, upcoming: 1, inProgress: 1, past: 1, totalLeads: 0 });
  });

  it("sums leads across all conferences", () => {
    const conferences = [
      makeConf({ id: "a", startDate: "2026-07-01", endDate: "2026-07-03", leads: 5 }),
      makeConf({ id: "b", startDate: "2026-01-01", endDate: "2026-01-05", leads: 10 }),
    ];
    expect(computeConferenceStats(conferences, NOW).totalLeads).toBe(15);
  });

  it("counts total correctly", () => {
    const conferences = Array.from({ length: 4 }, (_, i) =>
      makeConf({ id: String(i), startDate: "2026-07-01", endDate: "2026-07-03" })
    );
    expect(computeConferenceStats(conferences, NOW).total).toBe(4);
  });

  it("classifies conference with past start and no valid end as inProgress", () => {
    const conf = makeConf({ startDate: "2026-06-01", endDate: "invalid" });
    const result = computeConferenceStats([conf], NOW);
    expect(result.inProgress).toBe(1);
  });
});
