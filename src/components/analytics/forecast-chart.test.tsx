import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ForecastChart,
  type ForecastChartSeries,
} from "@/components/analytics/forecast-chart";

/* ── Helpers ───────────────────────────────────────────── */

function makeSeries(count = 2): ForecastChartSeries[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `Series ${i + 1}`,
    data: Array.from({ length: 13 }, (_, m) => ({
      month: m,
      label: `M${m}`,
      value: 10000 + m * 1000 + i * 5000,
    })),
    color: i === 0 ? "#10b981" : "#3b82f6",
    dashed: i !== 0,
  }));
}

/* ── Tests ──────────────────────────────────────────────── */

describe("ForecastChart", () => {
  it("returns null for empty series", () => {
    const { container } = render(<ForecastChart series={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders an SVG element with valid data", () => {
    const { container } = render(<ForecastChart series={makeSeries()} />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders legend items for each series", () => {
    render(<ForecastChart series={makeSeries()} />);
    expect(screen.getByText("Series 1")).toBeTruthy();
    expect(screen.getByText("Series 2")).toBeTruthy();
  });

  it("renders with title", () => {
    render(<ForecastChart series={makeSeries()} title="Test Title" />);
    expect(screen.getByText("Test Title")).toBeTruthy();
  });

  it("renders without title when not provided", () => {
    const { container } = render(<ForecastChart series={makeSeries()} />);
    expect(container.querySelector("p")).toBeNull();
  });

  it("renders one polyline per series", () => {
    const { container } = render(<ForecastChart series={makeSeries(3)} />);
    const polylines = container.querySelectorAll("polyline");
    expect(polylines.length).toBe(3);
  });

  it("applies custom formatValue to y-axis labels", () => {
    const format = (v: number): string => `${v.toFixed(0)} units`;
    const { container } = render(
      <ForecastChart series={makeSeries(1)} formatValue={format} />,
    );
    const svg = container.querySelector("svg")!;
    expect(svg.textContent).toContain("units");
  });

  it("renders x-axis labels every 3 months", () => {
    render(<ForecastChart series={makeSeries(1)} />);
    // 13 data points with labels M0..M12, every 3rd: M0, M3, M6, M9, M12
    expect(screen.getByText("M0")).toBeTruthy();
    expect(screen.getByText("M3")).toBeTruthy();
    expect(screen.getByText("M6")).toBeTruthy();
    expect(screen.getByText("M9")).toBeTruthy();
    expect(screen.getByText("M12")).toBeTruthy();
    expect(screen.queryByText("M1")).toBeNull();
  });

  it("sets stroke-dasharray on dashed series", () => {
    const { container } = render(<ForecastChart series={makeSeries()} />);
    const polylines = container.querySelectorAll("polyline");
    const dashed = Array.from(polylines).filter(
      (el) => el.getAttribute("stroke-dasharray") !== null,
    );
    expect(dashed.length).toBe(1);
  });

  it("renders correctly with a single series", () => {
    const { container } = render(<ForecastChart series={makeSeries(1)} />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelectorAll("polyline").length).toBe(1);
    expect(screen.getByText("Series 1")).toBeTruthy();
  });
});
