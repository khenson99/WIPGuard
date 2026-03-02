import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { DemoVolumeChart } from "./demo-volume-chart";
import type { DemoWeeklyTrend, DemoRecord } from "@/lib/analytics/types";

vi.mock("recharts", async () => import("@/lib/__mocks__/recharts"));

const mockWeeklyTrend: DemoWeeklyTrend[] = [
  { week: "2026-01-05", scheduled: 5, completed: 3, noShows: 1 },
  { week: "2026-01-12", scheduled: 8, completed: 6, noShows: 2 },
  { week: "2026-01-19", scheduled: 4, completed: 4, noShows: 0 },
];

const mockDemos: DemoRecord[] = [
  {
    dealId: "1",
    dealName: "Deal A",
    contactEmail: null,
    scheduledAt: "2026-01-07T10:00:00Z",
    source: "Organic",
    outcome: "completed",
    followUpSent: false,
    daysToNextStage: null,
    resultingStage: null,
  },
  {
    dealId: "2",
    dealName: "Deal B",
    contactEmail: null,
    scheduledAt: "2026-01-08T10:00:00Z",
    source: "Organic",
    outcome: "no-show",
    followUpSent: false,
    daysToNextStage: null,
    resultingStage: null,
  },
  {
    dealId: "3",
    dealName: "Deal C",
    contactEmail: null,
    scheduledAt: "2026-01-07T10:00:00Z",
    source: "Paid",
    outcome: "completed",
    followUpSent: false,
    daysToNextStage: null,
    resultingStage: null,
  },
  {
    dealId: "4",
    dealName: "Deal D",
    contactEmail: null,
    scheduledAt: "2026-01-14T10:00:00Z",
    source: "Paid",
    outcome: "completed",
    followUpSent: false,
    daysToNextStage: null,
    resultingStage: null,
  },
  {
    dealId: "5",
    dealName: "Deal E",
    contactEmail: null,
    scheduledAt: "2026-01-14T10:00:00Z",
    source: "Referral",
    outcome: "completed",
    followUpSent: false,
    daysToNextStage: null,
    resultingStage: null,
  },
];

describe("DemoVolumeChart", () => {
  it("renders chart header when weeklyTrend data exists", () => {
    render(<DemoVolumeChart weeklyTrend={mockWeeklyTrend} />);
    expect(screen.getByText("Demo Volume Over Time")).toBeTruthy();
  });

  it("renders chart container with aria-label", () => {
    render(<DemoVolumeChart weeklyTrend={mockWeeklyTrend} />);
    expect(screen.getByLabelText("Demo volume time series chart")).toBeTruthy();
  });

  it("renders chart when only demos data exists", () => {
    render(<DemoVolumeChart demos={mockDemos} />);
    expect(screen.getByText("Demo Volume Over Time")).toBeTruthy();
    expect(screen.getByLabelText("Demo volume time series chart")).toBeTruthy();
  });

  it("returns null when both weeklyTrend and demos are empty", () => {
    const { container } = render(
      <DemoVolumeChart weeklyTrend={[]} demos={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when no props are provided", () => {
    const { container } = render(<DemoVolumeChart />);
    expect(container.firstChild).toBeNull();
  });

  it("shows toggle when both data sources are available", () => {
    render(<DemoVolumeChart weeklyTrend={mockWeeklyTrend} demos={mockDemos} />);
    expect(screen.getByText("By Outcome")).toBeTruthy();
    expect(screen.getByText("By Source")).toBeTruthy();
  });

  it("hides toggle when only weeklyTrend is provided", () => {
    render(<DemoVolumeChart weeklyTrend={mockWeeklyTrend} />);
    expect(screen.queryByText("By Outcome")).toBeNull();
    expect(screen.queryByText("By Source")).toBeNull();
  });

  it("hides toggle when only demos are provided", () => {
    render(<DemoVolumeChart demos={mockDemos} />);
    expect(screen.queryByText("By Outcome")).toBeNull();
    expect(screen.queryByText("By Source")).toBeNull();
  });

  it("has accessible radiogroup for view toggle", () => {
    render(<DemoVolumeChart weeklyTrend={mockWeeklyTrend} demos={mockDemos} />);
    const radiogroup = screen.getByRole("radiogroup");
    expect(radiogroup.getAttribute("aria-label")).toBe("Chart view mode");
  });

  it("defaults to by-outcome view (By Outcome button aria-checked=true)", () => {
    render(<DemoVolumeChart weeklyTrend={mockWeeklyTrend} demos={mockDemos} />);
    const byOutcomeBtn = screen.getByText("By Outcome");
    expect(byOutcomeBtn.getAttribute("aria-checked")).toBe("true");
    const bySourceBtn = screen.getByText("By Source");
    expect(bySourceBtn.getAttribute("aria-checked")).toBe("false");
  });

  it("switches to by-source view when toggle is clicked", async () => {
    const user = userEvent.setup();
    render(<DemoVolumeChart weeklyTrend={mockWeeklyTrend} demos={mockDemos} />);

    await user.click(screen.getByText("By Source"));

    expect(screen.getByText("By Source").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("By Outcome").getAttribute("aria-checked")).toBe("false");
  });

  it("switches back to by-outcome when By Outcome is clicked after switching", async () => {
    const user = userEvent.setup();
    render(<DemoVolumeChart weeklyTrend={mockWeeklyTrend} demos={mockDemos} />);

    await user.click(screen.getByText("By Source"));
    await user.click(screen.getByText("By Outcome"));

    expect(screen.getByText("By Outcome").getAttribute("aria-checked")).toBe("true");
  });

  it("shows 'by source' subtitle when only demos available", () => {
    render(<DemoVolumeChart demos={mockDemos} />);
    expect(screen.getByText(/by source/i)).toBeTruthy();
  });

  it("shows 'by outcome' subtitle when only weeklyTrend available", () => {
    render(<DemoVolumeChart weeklyTrend={mockWeeklyTrend} />);
    expect(screen.getByText(/by outcome/i)).toBeTruthy();
  });
});
