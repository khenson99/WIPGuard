import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PathExploration } from "./sub-dashboards/path-exploration";
import type { CustomerJourneyRecord, JourneyPath } from "@/lib/analytics/types";

// Minimal mock paths
const mockPaths: JourneyPath[] = [
  {
    sequence: ["google-ads", "hubspot", "stripe"] as never,
    count: 5,
    kanbanCards: 2,
    freeTrials: 1,
    demos: 3,
    avgDaysToClose: 30,
    avgValue: 15000,
  },
  {
    sequence: ["meta-ads", "hubspot"] as never,
    count: 2,
    kanbanCards: 0,
    freeTrials: 0,
    demos: 1,
    avgDaysToClose: 20,
    avgValue: 8000,
  },
];

function makeJourney(id: string, channels: string[]): CustomerJourneyRecord {
  return {
    dealId: id,
    dealName: `Deal ${id}`,
    contactEmail: `contact-${id}@example.com`,
    currentStage: "Closed Won",
    value: 12000,
    touchpoints: channels.map((ch, i) => ({
      timestamp: `2026-01-0${i + 1}T00:00:00Z`,
      phase: "crm",
      channel: ch as never,
      type: "engagement",
      detail: ch,
      value: null,
    })),
    firstTouch: "2026-01-01T00:00:00Z",
    lastTouch: "2026-01-10T00:00:00Z",
    daysInPipeline: 10,
  };
}

const mockJourneys: CustomerJourneyRecord[] = [
  makeJourney("j1", ["google-ads", "hubspot", "stripe"]),
  makeJourney("j2", ["meta-ads", "hubspot"]),
  makeJourney("j3", ["google-ads", "hubspot"]),
];

describe("PathExploration Drilldown", () => {
  it("renders path rows in a table", () => {
    render(<PathExploration paths={mockPaths} journeys={mockJourneys} />);
    // Rows have role="button"
    const rows = document.querySelectorAll('[role="button"]');
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it("opens drawer when a path row is clicked", () => {
    render(<PathExploration paths={mockPaths} journeys={mockJourneys} />);
    const rows = document.querySelectorAll('[role="button"]');
    fireEvent.click(rows[0]);
    // Drawer should be open — check for dialog role
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
  });

  it("shows matching journeys in the drawer after click", () => {
    render(<PathExploration paths={mockPaths} journeys={mockJourneys} />);
    const rows = document.querySelectorAll('[role="button"]');
    fireEvent.click(rows[0]);
    // Should show deal names for journeys matching "google-ads → hubspot → stripe"
    expect(screen.getByText("Deal j1")).toBeTruthy();
  });

  it("closes drawer when close button is clicked", () => {
    render(<PathExploration paths={mockPaths} journeys={mockJourneys} />);
    const rows = document.querySelectorAll('[role="button"]');
    fireEvent.click(rows[0]);

    const closeBtn = screen.getByLabelText("Close");
    fireEvent.click(closeBtn);

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeNull();
  });

  it("closes drawer on Escape key", () => {
    render(<PathExploration paths={mockPaths} journeys={mockJourneys} />);
    const rows = document.querySelectorAll('[role="button"]');
    fireEvent.click(rows[0]);

    fireEvent.keyDown(document, { key: "Escape" });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeNull();
  });

  it("closes drawer when backdrop is clicked", () => {
    render(<PathExploration paths={mockPaths} journeys={mockJourneys} />);
    const rows = document.querySelectorAll('[role="button"]');
    fireEvent.click(rows[0]);

    // Backdrop is the first div in the fixed overlay container
    const backdrop = document.querySelector('.fixed.inset-0 > [aria-hidden="true"]');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeNull();
  });

  it("shows empty state message when no journeys match", () => {
    render(<PathExploration paths={mockPaths} journeys={[]} />);
    const rows = document.querySelectorAll('[role="button"]');
    fireEvent.click(rows[0]);
    expect(screen.getByText(/No matching deals found/i)).toBeTruthy();
  });

  it("path rows are keyboard accessible with Enter key", () => {
    render(<PathExploration paths={mockPaths} journeys={mockJourneys} />);
    const rows = document.querySelectorAll('[role="button"]');
    fireEvent.keyDown(rows[0], { key: "Enter" });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
  });

  it("shows empty state when paths array is empty", () => {
    render(<PathExploration paths={[]} />);
    expect(screen.getByText("No journey path data available.")).toBeTruthy();
  });
});
