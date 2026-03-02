import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TrendsToggle } from "./trends-toggle";

describe("TrendsToggle", () => {
  it("renders both Snapshot and Trends buttons", () => {
    render(<TrendsToggle value="snapshot" onChange={() => {}} />);
    expect(screen.getByText("Snapshot")).toBeTruthy();
    expect(screen.getByText("Trends")).toBeTruthy();
  });

  it("has role='radiogroup' with accessible label", () => {
    render(<TrendsToggle value="snapshot" onChange={() => {}} />);
    const group = screen.getByRole("radiogroup");
    expect(group).toBeTruthy();
    expect(group.getAttribute("aria-label")).toBe("View mode");
  });

  it("marks the active mode button as aria-checked='true'", () => {
    render(<TrendsToggle value="snapshot" onChange={() => {}} />);
    const snapshotBtn = screen.getByText("Snapshot").closest("button")!;
    const trendsBtn = screen.getByText("Trends").closest("button")!;
    expect(snapshotBtn.getAttribute("aria-checked")).toBe("true");
    expect(trendsBtn.getAttribute("aria-checked")).toBe("false");
  });

  it("marks Trends button as aria-checked='true' when value is 'trends'", () => {
    render(<TrendsToggle value="trends" onChange={() => {}} />);
    const snapshotBtn = screen.getByText("Snapshot").closest("button")!;
    const trendsBtn = screen.getByText("Trends").closest("button")!;
    expect(snapshotBtn.getAttribute("aria-checked")).toBe("false");
    expect(trendsBtn.getAttribute("aria-checked")).toBe("true");
  });

  it("calls onChange with 'trends' when Trends button is clicked", () => {
    const onChange = vi.fn();
    render(<TrendsToggle value="snapshot" onChange={onChange} />);
    fireEvent.click(screen.getByText("Trends"));
    expect(onChange).toHaveBeenCalledWith("trends");
  });

  it("calls onChange with 'snapshot' when Snapshot button is clicked", () => {
    const onChange = vi.fn();
    render(<TrendsToggle value="trends" onChange={onChange} />);
    fireEvent.click(screen.getByText("Snapshot"));
    expect(onChange).toHaveBeenCalledWith("snapshot");
  });

  it("does not crash when onChange is not called (same mode clicked)", () => {
    const onChange = vi.fn();
    render(<TrendsToggle value="snapshot" onChange={onChange} />);
    fireEvent.click(screen.getByText("Snapshot"));
    // onChange is still called (button stays in 'snapshot' mode, parent handles dedup)
    expect(onChange).toHaveBeenCalledWith("snapshot");
  });
});
