import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WipPressureHeatmap } from "../wip-pressure-heatmap";
import type { FlowRiskIntelligenceReport, PersonWipPressure } from "../types";

// jsdom doesn't implement matchMedia; mock it returning no matches.
// Also pin innerWidth to 0 so getResponsiveCols() consistently returns 2
// (the smallest breakpoint), ensuring all tests use a 2-column layout.
beforeEach(() => {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: 0,
  });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

function makePerson(
  userId: string,
  name: string,
  activeTaskCount: number,
  wipLimit: number,
  pressureScore: number
): PersonWipPressure {
  return {
    userId,
    name,
    email: `${userId}@example.com`,
    activeTaskCount,
    wipLimit,
    pressureScore,
    pressureRatio: activeTaskCount / wipLimit,
    overloaded: activeTaskCount > wipLimit,
    topTaskIds: [],
  };
}

const mockPeople: PersonWipPressure[] = [
  makePerson("u1", "Alice", 2, 4, 50),
  makePerson("u2", "Bob", 3, 4, 75),
  makePerson("u3", "Carol", 4, 3, 133),
  makePerson("u4", "Dave", 1, 4, 25),
  makePerson("u5", "Eve", 5, 3, 166),
  makePerson("u6", "Frank", 2, 4, 50),
];

function makeReport(people: PersonWipPressure[]): FlowRiskIntelligenceReport {
  return {
    generatedAt: "2026-01-01T00:00:00Z",
    asOf: "2026-01-01T00:00:00Z",
    config: {} as FlowRiskIntelligenceReport["config"],
    wipPressure: { people, columns: [] },
    chronicBlockers: [],
    staleDependencyChains: [],
    fixedDateAlerts: [],
    recommendations: [],
    slippageCorrelation: {} as FlowRiskIntelligenceReport["slippageCorrelation"],
    traceability: {
      source:
        "Task + Task.dependsOn + Task.responsible + StatusHistory + BoardSettings",
      taskCount: 0,
      blockerEventCount: 0,
      boardSettingCount: 0,
      taskSampleIds: [],
    },
  };
}

describe("WipPressureHeatmap a11y", () => {
  it("renders with role=grid and aria-label", () => {
    render(<WipPressureHeatmap riskReport={makeReport(mockPeople)} />);
    const grid = screen.getByRole("grid");
    expect(grid).toBeTruthy();
    expect(grid.getAttribute("aria-label")).toBe("WIP pressure by team member");
  });

  it("renders all people as gridcells", () => {
    render(<WipPressureHeatmap riskReport={makeReport(mockPeople)} />);
    const cells = screen.getAllByRole("gridcell");
    expect(cells).toHaveLength(6);
  });

  it("each cell has a descriptive aria-label", () => {
    render(<WipPressureHeatmap riskReport={makeReport(mockPeople)} />);
    const cells = screen.getAllByRole("gridcell");
    // Alice: 50% = Moderate pressure
    expect(cells[0].getAttribute("aria-label")).toContain("Alice");
    expect(cells[0].getAttribute("aria-label")).toContain("Moderate pressure");
    expect(cells[0].getAttribute("aria-label")).toContain("2 active tasks out of 4 WIP limit");
    // Carol: 133% = Over limit pressure
    expect(cells[2].getAttribute("aria-label")).toContain("Carol");
    expect(cells[2].getAttribute("aria-label")).toContain("Over limit pressure");
    // Eve: 166% = Critical pressure
    expect(cells[4].getAttribute("aria-label")).toContain("Eve");
    expect(cells[4].getAttribute("aria-label")).toContain("Critical pressure");
  });

  it("first cell has tabIndex=0, others have tabIndex=-1 initially", () => {
    render(<WipPressureHeatmap riskReport={makeReport(mockPeople)} />);
    const cells = screen.getAllByRole("gridcell");
    expect(cells[0].getAttribute("tabindex")).toBe("0");
    cells.slice(1).forEach((cell) => {
      expect(cell.getAttribute("tabindex")).toBe("-1");
    });
  });

  it("cells have aria-colindex attributes", () => {
    render(<WipPressureHeatmap riskReport={makeReport(mockPeople)} />);
    const cells = screen.getAllByRole("gridcell");
    // Default is 2 cols; first row cells are colindex 1 and 2
    expect(cells[0].getAttribute("aria-colindex")).toBe("1");
    expect(cells[1].getAttribute("aria-colindex")).toBe("2");
    // Second row resets to col 1
    expect(cells[2].getAttribute("aria-colindex")).toBe("1");
  });

  it("cells have aria-rowindex attributes", () => {
    render(<WipPressureHeatmap riskReport={makeReport(mockPeople)} />);
    const cells = screen.getAllByRole("gridcell");
    // Row 1
    expect(cells[0].getAttribute("aria-rowindex")).toBe("1");
    expect(cells[1].getAttribute("aria-rowindex")).toBe("1");
    // Row 2
    expect(cells[2].getAttribute("aria-rowindex")).toBe("2");
    expect(cells[3].getAttribute("aria-rowindex")).toBe("2");
    // Row 3
    expect(cells[4].getAttribute("aria-rowindex")).toBe("3");
    expect(cells[5].getAttribute("aria-rowindex")).toBe("3");
  });

  it("navigates right with ArrowRight", async () => {
    const user = userEvent.setup();
    render(<WipPressureHeatmap riskReport={makeReport(mockPeople)} />);
    const cells = screen.getAllByRole("gridcell");
    cells[0].focus();
    await user.keyboard("{ArrowRight}");
    expect(cells[1]).toBe(document.activeElement);
    expect(cells[1].getAttribute("tabindex")).toBe("0");
    expect(cells[0].getAttribute("tabindex")).toBe("-1");
  });

  it("navigates down with ArrowDown (using 2-col default layout)", async () => {
    const user = userEvent.setup();
    render(<WipPressureHeatmap riskReport={makeReport(mockPeople)} />);
    const cells = screen.getAllByRole("gridcell");
    cells[0].focus();
    await user.keyboard("{ArrowDown}");
    // 2 cols: index 0 → row 0, index 2 → row 1
    expect(cells[2]).toBe(document.activeElement);
  });

  it("does not move past grid boundaries", async () => {
    const user = userEvent.setup();
    render(<WipPressureHeatmap riskReport={makeReport(mockPeople)} />);
    const cells = screen.getAllByRole("gridcell");
    cells[0].focus();
    await user.keyboard("{ArrowLeft}");
    expect(cells[0]).toBe(document.activeElement);
    await user.keyboard("{ArrowUp}");
    expect(cells[0]).toBe(document.activeElement);
  });

  it("Home moves to first cell in row", async () => {
    const user = userEvent.setup();
    render(<WipPressureHeatmap riskReport={makeReport(mockPeople)} />);
    const cells = screen.getAllByRole("gridcell");
    // Navigate to index 3 (row 1, col 1 in 2-col layout)
    cells[0].focus();
    await user.keyboard("{ArrowDown}{ArrowRight}");
    expect(cells[3]).toBe(document.activeElement);
    // Home should go to index 2 (row 1, col 0)
    await user.keyboard("{Home}");
    expect(cells[2]).toBe(document.activeElement);
  });

  it("Ctrl+Home moves to first cell overall", async () => {
    const user = userEvent.setup();
    render(<WipPressureHeatmap riskReport={makeReport(mockPeople)} />);
    const cells = screen.getAllByRole("gridcell");
    cells[5].focus();
    await user.keyboard("{Control>}{Home}{/Control}");
    expect(cells[0]).toBe(document.activeElement);
  });

  it("Ctrl+End moves to last cell overall", async () => {
    const user = userEvent.setup();
    render(<WipPressureHeatmap riskReport={makeReport(mockPeople)} />);
    const cells = screen.getAllByRole("gridcell");
    cells[0].focus();
    await user.keyboard("{Control>}{End}{/Control}");
    expect(cells[5]).toBe(document.activeElement);
  });

  it("renders row wrappers with role=row", () => {
    render(<WipPressureHeatmap riskReport={makeReport(mockPeople)} />);
    const rows = screen.getAllByRole("row");
    // 6 cells in 2-col grid = 3 rows
    expect(rows).toHaveLength(3);
  });

  it("shows loading skeleton when riskReport is null", () => {
    render(<WipPressureHeatmap riskReport={null} />);
    expect(screen.queryByRole("grid")).toBeNull();
  });

  it("shows empty state when no people", () => {
    render(<WipPressureHeatmap riskReport={makeReport([])} />);
    expect(screen.queryByRole("grid")).toBeNull();
    expect(screen.getByText("No active task assignments found.")).toBeTruthy();
  });

  it("marks overloaded cells with an Overloaded badge", () => {
    render(<WipPressureHeatmap riskReport={makeReport(mockPeople)} />);
    // Carol (u3) has 4 tasks with WIP limit 3 = overloaded
    const overloadedBadges = screen.getAllByRole("img", { name: "Overloaded" });
    expect(overloadedBadges.length).toBeGreaterThan(0);
  });

  it("focus ring classes are present on gridcells", () => {
    render(<WipPressureHeatmap riskReport={makeReport(mockPeople)} />);
    const cells = screen.getAllByRole("gridcell");
    cells.forEach((cell) => {
      expect(cell.className).toContain("focus-visible:ring-2");
    });
  });
});
