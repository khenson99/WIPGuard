import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SparkLine } from "@/components/charts/spark-line";

vi.mock("recharts", async () => import("@/lib/__mocks__/recharts"));

describe("SparkLine", () => {
  it("renders a container element with the given dimensions", () => {
    const { container } = render(<SparkLine data={[1, 3, 2, 5, 4]} width={56} height={20} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.style.width).toBe("56px");
    expect(wrapper.style.height).toBe("20px");
  });

  it("returns null when data has fewer than 2 points", () => {
    const { container } = render(<SparkLine data={[5]} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null for empty data", () => {
    const { container } = render(<SparkLine data={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders when given exactly 2 data points", () => {
    const { container } = render(<SparkLine data={[1, 2]} />);
    expect(container.firstChild).not.toBeNull();
  });

  it("accepts a custom color prop without crashing", () => {
    const { container } = render(<SparkLine data={[1, 2, 3]} color="#FF0000" />);
    expect(container.firstChild).not.toBeNull();
  });
});
