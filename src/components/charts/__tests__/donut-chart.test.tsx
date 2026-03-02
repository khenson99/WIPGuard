import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DonutChart } from "@/components/charts/donut-chart";

vi.mock("recharts", async () => import("@/lib/__mocks__/recharts"));

const segments = [
  { name: "Blocked", value: 3, color: "#FC5A29" },
  { name: "Active", value: 7, color: "#3b82f6" },
];

describe("DonutChart", () => {
  it("renders center label and value when provided", () => {
    render(
      <DonutChart segments={segments} centerLabel="Total" centerValue="10" />
    );
    expect(screen.getByText("Total")).toBeTruthy();
    expect(screen.getByText("10")).toBeTruthy();
  });

  it("renders without center overlay when neither prop is provided", () => {
    const { queryByText } = render(<DonutChart segments={segments} />);
    expect(queryByText("Total")).toBeNull();
  });

  it("uses the given size for the container", () => {
    const { container } = render(<DonutChart segments={segments} size={120} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.width).toBe("120px");
    expect(wrapper.style.height).toBe("120px");
  });

  it("renders with a single segment without crashing", () => {
    render(
      <DonutChart
        segments={[{ name: "All", value: 10 }]}
        centerLabel="Tasks"
        centerValue="10"
      />
    );
    expect(screen.getByText("Tasks")).toBeTruthy();
  });
});
