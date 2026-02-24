import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RepScoreboardCard } from "@/components/analytics/rep-scoreboard-card";

describe("RepScoreboardCard", () => {
  it("renders empty state when rows are missing", () => {
    render(<RepScoreboardCard />);
    expect(screen.getByText("No rep data available")).toBeTruthy();
  });

  it("renders table headers", () => {
    render(
      <RepScoreboardCard
        rows={[
          { repName: "Alice", count: 1, value: 1000, closedWon: 0, closedWonValue: 0 },
        ]}
      />
    );

    expect(screen.getByText("Rep Name")).toBeTruthy();
    expect(screen.getByText("Total Deals")).toBeTruthy();
    expect(screen.getByText("Total Pipeline")).toBeTruthy();
    expect(screen.getByText("Won Count")).toBeTruthy();
    expect(screen.getByText("Won Revenue")).toBeTruthy();
  });

  it("sorts reps by pipeline value descending", () => {
    render(
      <RepScoreboardCard
        rows={[
          { repName: "Low", count: 2, value: 100, closedWon: 1, closedWonValue: 50 },
          { repName: "High", count: 3, value: 5000, closedWon: 2, closedWonValue: 2000 },
          { repName: "Mid", count: 1, value: 900, closedWon: 0, closedWonValue: 0 },
        ]}
      />
    );

    const tableRows = screen.getAllByRole("row");
    expect(tableRows[1]?.textContent).toContain("High");
    expect(tableRows[2]?.textContent).toContain("Mid");
    expect(tableRows[3]?.textContent).toContain("Low");
  });
});

