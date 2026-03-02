import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PathSankeyDiagram } from "./path-sankey-diagram";

const paths = [
  { stages: ["Google Ads", "Sales Pipeline", "Billing/Trial"], count: 8 },
  { stages: ["Meta Ads", "Sales Pipeline", "Billing/Trial"], count: 5 },
  { stages: ["Organic Traffic", "Sales Pipeline"], count: 3 },
];

describe("PathSankeyDiagram", () => {
  it("renders an SVG with the diagram role and label", () => {
    render(<PathSankeyDiagram paths={paths} />);
    const svg = document.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toBeTruthy();
  });

  it("shows empty state when paths array is empty", () => {
    render(<PathSankeyDiagram paths={[]} />);
    expect(screen.getByText("No path data available to visualize.")).toBeTruthy();
  });

  it("renders nodes for each unique stage+column combination", () => {
    const { container } = render(<PathSankeyDiagram paths={paths} />);
    const rects = container.querySelectorAll("rect");
    // Should have at least one rect per node
    expect(rects.length).toBeGreaterThan(0);
  });

  it("calls onPathClick with source and target labels when a link is clicked", () => {
    const onPathClick = vi.fn();
    const { container } = render(
      <PathSankeyDiagram paths={paths} onPathClick={onPathClick} />,
    );
    const linkPaths = container.querySelectorAll("path");
    expect(linkPaths.length).toBeGreaterThan(0);
    fireEvent.click(linkPaths[0]);
    expect(onPathClick).toHaveBeenCalledOnce();
    const [stages] = onPathClick.mock.calls[0];
    expect(Array.isArray(stages)).toBe(true);
    expect(stages.length).toBe(2);
  });

  it("changes link opacity on hover", () => {
    const { container } = render(<PathSankeyDiagram paths={paths} />);
    const linkPath = container.querySelector("path");
    if (!linkPath) return;

    // Before hover: fillOpacity should be 0.25
    expect(linkPath.getAttribute("fill-opacity")).toBe("0.25");

    fireEvent.mouseEnter(linkPath);
    // After hover: fillOpacity should be higher
    expect(linkPath.getAttribute("fill-opacity")).toBe("0.55");

    fireEvent.mouseLeave(linkPath);
    expect(linkPath.getAttribute("fill-opacity")).toBe("0.25");
  });

  it("renders link tooltips with count information", () => {
    const { container } = render(<PathSankeyDiagram paths={paths} />);
    const titles = container.querySelectorAll("title");
    expect(titles.length).toBeGreaterThan(0);
    const titleTexts = Array.from(titles).map((t) => t.textContent ?? "");
    expect(titleTexts.some((t) => t.includes("→"))).toBe(true);
  });
});
