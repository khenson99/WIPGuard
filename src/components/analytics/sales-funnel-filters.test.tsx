import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SalesFunnelFilters } from "./sales-funnel-filters";

const reps = [
  { id: "r1", name: "Alice" },
  { id: "r2", name: "Bob" },
];

const defaultProps = {
  reps,
  dateRange: "all" as const,
  selectedRepId: null,
  filteredCount: 10,
  totalCount: 10,
  onDateRangeChange: vi.fn(),
  onRepChange: vi.fn(),
};

describe("SalesFunnelFilters", () => {
  it("renders date range label and select", () => {
    render(<SalesFunnelFilters {...defaultProps} />);
    expect(screen.getByText("Date range")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Date range" })).toBeTruthy();
  });

  it("renders rep label and select", () => {
    render(<SalesFunnelFilters {...defaultProps} />);
    expect(screen.getByText("Rep")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Rep" })).toBeTruthy();
  });

  it("renders all date preset options", () => {
    render(<SalesFunnelFilters {...defaultProps} />);
    const select = screen.getByRole("combobox", { name: "Date range" });
    const options = select.querySelectorAll("option");
    const labels = Array.from(options).map((o) => o.textContent);
    expect(labels).toContain("Last 7 days");
    expect(labels).toContain("Last 30 days");
    expect(labels).toContain("Last 90 days");
    expect(labels).toContain("All time");
  });

  it("renders All reps option plus provided reps", () => {
    render(<SalesFunnelFilters {...defaultProps} />);
    const select = screen.getByRole("combobox", { name: "Rep" });
    const options = select.querySelectorAll("option");
    const labels = Array.from(options).map((o) => o.textContent);
    expect(labels).toContain("All reps");
    expect(labels).toContain("Alice");
    expect(labels).toContain("Bob");
  });

  it("calls onDateRangeChange with preset when date select changes", () => {
    const onDateRangeChange = vi.fn();
    render(<SalesFunnelFilters {...defaultProps} onDateRangeChange={onDateRangeChange} />);
    const select = screen.getByRole("combobox", { name: "Date range" });
    fireEvent.change(select, { target: { value: "30d" } });
    expect(onDateRangeChange).toHaveBeenCalledWith("30d");
  });

  it("calls onRepChange with rep id when rep select changes", () => {
    const onRepChange = vi.fn();
    render(<SalesFunnelFilters {...defaultProps} onRepChange={onRepChange} />);
    const select = screen.getByRole("combobox", { name: "Rep" });
    fireEvent.change(select, { target: { value: "r1" } });
    expect(onRepChange).toHaveBeenCalledWith("r1");
  });

  it("calls onRepChange with null when All reps is selected", () => {
    const onRepChange = vi.fn();
    render(
      <SalesFunnelFilters {...defaultProps} selectedRepId="r1" onRepChange={onRepChange} />
    );
    const select = screen.getByRole("combobox", { name: "Rep" });
    fireEvent.change(select, { target: { value: "" } });
    expect(onRepChange).toHaveBeenCalledWith(null);
  });

  it("shows active-filter indicator when filteredCount < totalCount", () => {
    render(
      <SalesFunnelFilters {...defaultProps} filteredCount={3} totalCount={10} />
    );
    expect(screen.getByRole("status").textContent).toContain("Showing 3 of 10 deals");
  });

  it("hides active-filter indicator when filteredCount equals totalCount", () => {
    render(
      <SalesFunnelFilters {...defaultProps} filteredCount={10} totalCount={10} />
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("reflects current dateRange value in select", () => {
    render(<SalesFunnelFilters {...defaultProps} dateRange="7d" />);
    const select = screen.getByRole("combobox", { name: "Date range" }) as HTMLSelectElement;
    expect(select.value).toBe("7d");
  });

  it("reflects current selectedRepId value in rep select", () => {
    render(<SalesFunnelFilters {...defaultProps} selectedRepId="r2" />);
    const select = screen.getByRole("combobox", { name: "Rep" }) as HTMLSelectElement;
    expect(select.value).toBe("r2");
  });

  it("renders with empty reps list (no reps connected)", () => {
    render(<SalesFunnelFilters {...defaultProps} reps={[]} />);
    const select = screen.getByRole("combobox", { name: "Rep" });
    const options = select.querySelectorAll("option");
    // Only "All reps" option
    expect(options.length).toBe(1);
  });
});
