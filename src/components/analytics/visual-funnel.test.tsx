import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { VisualFunnel, type FunnelStageData } from "@/components/analytics/visual-funnel";

// Only stages in MAIN_PATH are rendered by VisualFunnel.
// MAIN_PATH = ["Prospect","Lead","Demo Scheduled","Demo Follow-Up","Budgetary Quote Sent","Payment Link Sent","Subscription"]

const baseStages: FunnelStageData[] = [
  { id: "prospect", label: "Prospect", count: 100, value: 50000, avgDays: 3.2 },
  { id: "lead", label: "Lead", count: 80, value: 40000, avgDays: 0.5 },
  { id: "demo", label: "Demo Scheduled", count: 40, value: 20000 },
];

describe("VisualFunnel", () => {
  it("renders stage labels", () => {
    render(<VisualFunnel stages={baseStages} />);
    expect(screen.getByText("Prospect")).toBeTruthy();
    expect(screen.getByText("Lead")).toBeTruthy();
    expect(screen.getByText("Demo Scheduled")).toBeTruthy();
  });

  it("renders conversion badges between stages", () => {
    render(<VisualFunnel stages={baseStages} />);
    // Lead/Prospect → 80/100 = 80%
    expect(screen.getByText("80% conversion")).toBeTruthy();
    // Demo Scheduled/Lead → 40/80 = 50%
    expect(screen.getByText("50% conversion")).toBeTruthy();
  });

  it("shows tooltip with avgDays in days format on focus", () => {
    render(<VisualFunnel stages={baseStages} />);
    // Badge between Prospect→Lead shows Prospect's avgDays (3.2)
    const badge = screen.getByRole("button", { name: /80% conversion/ });
    fireEvent.focus(badge);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    expect(screen.getByRole("tooltip").textContent).toContain("Avg: 3.2 days in stage");
  });

  it("shows tooltip with avgDays in hours format on focus", () => {
    render(<VisualFunnel stages={baseStages} />);
    // Badge between Lead→Demo Scheduled shows Lead's avgDays (0.5 → 12 hours)
    const badge = screen.getByRole("button", { name: /50% conversion/ });
    fireEvent.focus(badge);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    expect(screen.getByRole("tooltip").textContent).toContain("Avg: 12 hours in stage");
  });

  it("hides tooltip after blur", () => {
    render(<VisualFunnel stages={baseStages} />);
    const badge = screen.getByRole("button", { name: /80% conversion/ });
    fireEvent.focus(badge);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.blur(badge);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows tooltip on mouse enter and hides on mouse leave", () => {
    render(<VisualFunnel stages={baseStages} />);
    const badge = screen.getByRole("button", { name: /80% conversion/ });
    fireEvent.mouseEnter(badge);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.mouseLeave(badge);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("does not render tooltip when avgDays is undefined", () => {
    const stagesWithoutAvg: FunnelStageData[] = [
      { id: "prospect", label: "Prospect", count: 100, value: 50000 },
      { id: "lead", label: "Lead", count: 50, value: 25000 },
    ];
    render(<VisualFunnel stages={stagesWithoutAvg} />);
    const badge = screen.getByRole("button", { name: /50% conversion/ });
    fireEvent.focus(badge);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("has aria-describedby linking badge to tooltip id when avgDays present", () => {
    render(<VisualFunnel stages={baseStages} />);
    const badge = screen.getByRole("button", { name: /80% conversion/ });
    expect(badge.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("does not have aria-describedby when avgDays is absent", () => {
    const stagesWithoutAvg: FunnelStageData[] = [
      { id: "prospect", label: "Prospect", count: 100, value: 50000 },
      { id: "lead", label: "Lead", count: 50, value: 25000 },
    ];
    render(<VisualFunnel stages={stagesWithoutAvg} />);
    const badge = screen.getByRole("button", { name: /50% conversion/ });
    expect(badge.getAttribute("aria-describedby")).toBeNull();
  });

  it("shows empty state when no matching MAIN_PATH stages provided", () => {
    render(<VisualFunnel stages={[{ id: "x", label: "Unknown Stage", count: 5, value: 0 }]} />);
    expect(screen.getByText("No pipeline stages available")).toBeTruthy();
  });

  it("calls onStageClick when a stage card is clicked", () => {
    let clicked: FunnelStageData | null = null;
    render(<VisualFunnel stages={baseStages} onStageClick={(s) => { clicked = s; }} />);
    // The stage card is a div with onClick — find by role or by clicking the stage label area
    fireEvent.click(screen.getByText("Prospect").closest("div[class*='cursor-pointer']")!);
    expect(clicked).not.toBeNull();
    expect((clicked as FunnelStageData | null)?.label).toBe("Prospect");
  });
});
