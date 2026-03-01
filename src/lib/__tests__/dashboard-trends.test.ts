import { describe, expect, it } from "vitest";
import { buildDailyCountSeriesUtc } from "@/lib/dashboard-trends";

describe("buildDailyCountSeriesUtc", () => {
  it("returns a stable, zero-filled series for the last N UTC days", () => {
    const now = new Date("2026-02-28T20:00:00.000Z");
    const timestamps = [
      new Date("2026-02-28T01:00:00.000Z"),
      new Date("2026-02-28T23:59:59.000Z"),
      new Date("2026-02-27T12:00:00.000Z"),
    ];

    const series = buildDailyCountSeriesUtc({ now, days: 3, timestamps });

    expect(series).toEqual([
      { date: "2026-02-26", count: 0 },
      { date: "2026-02-27", count: 1 },
      { date: "2026-02-28", count: 2 },
    ]);
  });

  it("ignores timestamps outside the window", () => {
    const now = new Date("2026-02-28T20:00:00.000Z");
    const timestamps = [
      new Date("2026-02-25T23:59:59.000Z"),
      new Date("2026-03-01T00:00:00.000Z"),
    ];

    const series = buildDailyCountSeriesUtc({ now, days: 2, timestamps });

    expect(series).toEqual([
      { date: "2026-02-27", count: 0 },
      { date: "2026-02-28", count: 0 },
    ]);
  });
});

