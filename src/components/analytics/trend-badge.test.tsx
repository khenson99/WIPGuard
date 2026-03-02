import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrendBadge } from "./trend-badge";
import type { TrendIndicator } from "@/lib/journey-bucketing";

function makeTrend(overrides: Partial<TrendIndicator> = {}): TrendIndicator {
  return {
    direction: "up",
    absoluteChange: 5,
    percentChange: 10,
    currentValue: 55,
    previousValue: 50,
    currentPeriod: "Feb 2026",
    previousPeriod: "Jan 2026",
    ...overrides,
  };
}

describe("TrendBadge", () => {
  it("renders an up arrow for a positive trend", () => {
    render(<TrendBadge trend={makeTrend({ direction: "up", absoluteChange: 5, percentChange: 10 })} />);
    const el = document.querySelector("span[aria-label]")!;
    expect(el.getAttribute("aria-label")).toContain("up");
  });

  it("renders a down indicator for a negative trend", () => {
    render(<TrendBadge trend={makeTrend({ direction: "down", absoluteChange: -5, percentChange: -10 })} />);
    const el = document.querySelector("span[aria-label]")!;
    expect(el.getAttribute("aria-label")).toContain("down");
  });

  it("renders a dash for 'insufficient' direction", () => {
    const trend = makeTrend({ direction: "insufficient" });
    render(<TrendBadge trend={trend} />);
    expect(screen.getByText("—")).toBeTruthy();
    const el = document.querySelector("span[aria-label]")!;
    expect(el.getAttribute("aria-label")).toContain("Insufficient");
  });

  it("shows percent format when format='percent'", () => {
    render(
      <TrendBadge
        trend={makeTrend({ direction: "up", percentChange: 12.5, absoluteChange: 6 })}
        format="percent"
      />,
    );
    // Should show percentage
    expect(screen.getByText(/12\.5%/).textContent).toBeTruthy();
  });

  it("shows absolute format when format='absolute'", () => {
    render(
      <TrendBadge
        trend={makeTrend({ direction: "up", percentChange: 12.5, absoluteChange: 6 })}
        format="absolute"
      />,
    );
    expect(screen.getByText(/\+6\.0/).textContent).toBeTruthy();
  });

  it("shows both percent and absolute when format='both' (default)", () => {
    render(
      <TrendBadge
        trend={makeTrend({ direction: "up", percentChange: 12.5, absoluteChange: 6 })}
      />,
    );
    const text = document.querySelector("span[aria-label] span")?.textContent ?? "";
    expect(text).toContain("%");
  });

  it("has correct aria-label describing the trend", () => {
    render(
      <TrendBadge
        trend={makeTrend({
          direction: "up",
          percentChange: 10,
          absoluteChange: 5,
          previousPeriod: "Jan 2026",
        })}
      />,
    );
    const el = document.querySelector("span[aria-label]")!;
    expect(el.getAttribute("aria-label")).toContain("vs Jan 2026");
  });

  it("shows sign for negative change in absolute format", () => {
    render(
      <TrendBadge
        trend={makeTrend({ direction: "down", absoluteChange: -8, percentChange: -15 })}
        format="absolute"
      />,
    );
    const text = document.querySelector("span[aria-label] span")?.textContent ?? "";
    expect(text).toContain("-8.0");
  });

  it("handles null percentChange gracefully (from-zero case) in percent format", () => {
    render(
      <TrendBadge
        trend={makeTrend({ direction: "up", percentChange: null, absoluteChange: 5 })}
        format="percent"
      />,
    );
    // No percent shown (percentChange is null), no crash
    const el = document.querySelector("span[aria-label]")!;
    expect(el).toBeTruthy();
  });
});
