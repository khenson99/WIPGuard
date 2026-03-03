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
    expect(screen.getByText("Avg Deal")).toBeTruthy();
    expect(screen.getByText("Demos")).toBeTruthy();
    expect(screen.getByText("No-Shows")).toBeTruthy();
    expect(screen.getByText("No-Show %")).toBeTruthy();
    expect(screen.getByText("Won Count")).toBeTruthy();
    expect(screen.getByText("Won Revenue")).toBeTruthy();
    expect(screen.getByText("Avg Won")).toBeTruthy();
    expect(screen.getByText("Lost Count")).toBeTruthy();
    expect(screen.getByText("Win Rate")).toBeTruthy();
    expect(screen.getByText("Demo→Won %")).toBeTruthy();
    expect(screen.getByText("Churned Won")).toBeTruthy();
    expect(screen.getByText("Churn %")).toBeTruthy();
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

  it("derives demo + win + churn metrics when deal data is provided", () => {
    render(
      <RepScoreboardCard
        rows={[{ repName: "Alice", count: 4, value: 4000, closedWon: 2, closedWonValue: 2000 }]}
        deals={[
          {
            dealId: "1",
            dealName: "Demo",
            stageId: "presentationscheduled",
            stageLabel: "Demo Scheduled",
            amount: 1000,
            source: "Unknown",
            ownerId: "owner-1",
            repName: "Alice",
            updatedAt: null,
            createdAt: null,
            stripeCustomerId: "cus_1",
            pipelineId: null,
            contactIds: [],
            primaryContactId: null,
            primaryContactEmail: null,
          },
          {
            dealId: "2",
            dealName: "No-show",
            stageId: "1955958510",
            stageLabel: "No-Show/Reschedule",
            amount: 0,
            source: "Unknown",
            ownerId: "owner-1",
            repName: "Alice",
            updatedAt: null,
            createdAt: null,
            stripeCustomerId: null,
            pipelineId: null,
            contactIds: [],
            primaryContactId: null,
            primaryContactEmail: null,
          },
          {
            dealId: "3",
            dealName: "Lost",
            stageId: "closedlost",
            stageLabel: "Closed Lost",
            amount: 0,
            source: "Unknown",
            ownerId: "owner-1",
            repName: "Alice",
            updatedAt: null,
            createdAt: null,
            stripeCustomerId: null,
            pipelineId: null,
            contactIds: [],
            primaryContactId: null,
            primaryContactEmail: null,
          },
          {
            dealId: "4",
            dealName: "Won churn",
            stageId: "closedwon",
            stageLabel: "Closed Won",
            amount: 2000,
            source: "Unknown",
            ownerId: "owner-1",
            repName: "Alice",
            updatedAt: null,
            createdAt: null,
            stripeCustomerId: "cus_churn",
            pipelineId: null,
            contactIds: [],
            primaryContactId: null,
            primaryContactEmail: null,
          },
        ]}
        stripeChurnEvents={[{ customer: "cus_churn", canceledAt: new Date().toISOString(), amount: 99 }]}
      />
    );

    const aliceRow = screen.getByText("Alice").closest("tr");
    expect(aliceRow?.textContent).toContain("4"); // demos (approx proxy: demo scheduled or later)
    expect(aliceRow?.textContent).toContain("25.0%"); // no-show % (1 / 4)
    expect(aliceRow?.textContent).toContain("66.7%"); // win rate (2 won / 3 decided)
    expect(aliceRow?.textContent).toContain("1"); // churned won
    expect(aliceRow?.textContent).toContain("50.0%"); // churn %
  });
});
