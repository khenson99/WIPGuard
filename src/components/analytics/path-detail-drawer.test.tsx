import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PathDetailDrawer } from "./path-detail-drawer";
import type { MatchedJourney } from "@/lib/analytics/path-matching";

const mockJourneys: MatchedJourney[] = [
  {
    id: "1",
    dealName: "Acme Corp",
    contactEmail: "acme@example.com",
    value: 50000,
    currentStage: "Closed Won",
    daysInPipeline: 45,
    lastTouch: new Date(Date.now() - 3 * 86400000).toISOString(), // 3 days ago
  },
  {
    id: "2",
    dealName: "Beta Inc",
    contactEmail: null,
    value: 30000,
    currentStage: "Negotiation",
    daysInPipeline: 20,
    lastTouch: new Date(Date.now() - 1 * 86400000).toISOString(), // yesterday
  },
];

const pathStages = ["Google Ads", "Sales Pipeline", "Billing/Trial"];
const onClose = vi.fn();

describe("PathDetailDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <PathDetailDrawer
        open={false}
        onClose={onClose}
        pathStages={pathStages}
        journeys={mockJourneys}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders drawer panel when open", () => {
    render(
      <PathDetailDrawer
        open={true}
        onClose={onClose}
        pathStages={pathStages}
        journeys={mockJourneys}
      />
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Path Detail")).toBeTruthy();
  });

  it("shows path stages in the header", () => {
    render(
      <PathDetailDrawer
        open={true}
        onClose={onClose}
        pathStages={pathStages}
        journeys={mockJourneys}
      />
    );
    expect(screen.getByText("Google Ads")).toBeTruthy();
    expect(screen.getByText("Sales Pipeline")).toBeTruthy();
    expect(screen.getByText("Billing/Trial")).toBeTruthy();
  });

  it("shows matched journeys in the table", () => {
    render(
      <PathDetailDrawer
        open={true}
        onClose={onClose}
        pathStages={pathStages}
        journeys={mockJourneys}
      />
    );
    expect(screen.getByText("Acme Corp")).toBeTruthy();
    expect(screen.getByText("Beta Inc")).toBeTruthy();
    expect(screen.getByText("Closed Won")).toBeTruthy();
    expect(screen.getByText("Negotiation")).toBeTruthy();
  });

  it("shows empty state when no journeys match", () => {
    render(
      <PathDetailDrawer
        open={true}
        onClose={onClose}
        pathStages={pathStages}
        journeys={[]}
      />
    );
    expect(screen.getByText("No matching deals found")).toBeTruthy();
  });

  it("shows loading state when isLoading is true", () => {
    const { container } = render(
      <PathDetailDrawer
        open={true}
        onClose={onClose}
        pathStages={pathStages}
        journeys={[]}
        isLoading={true}
      />
    );
    // Loading skeleton divs
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("calls onClose when close button is clicked", () => {
    render(
      <PathDetailDrawer
        open={true}
        onClose={onClose}
        pathStages={pathStages}
        journeys={mockJourneys}
      />
    );
    const closeBtn = screen.getByLabelText("Close");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked", () => {
    const { container } = render(
      <PathDetailDrawer
        open={true}
        onClose={onClose}
        pathStages={pathStages}
        journeys={mockJourneys}
      />
    );
    // Backdrop is the first div inside the fixed overlay (aria-hidden)
    const backdrop = container.querySelector("[aria-hidden='true']");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on Escape key", () => {
    render(
      <PathDetailDrawer
        open={true}
        onClose={onClose}
        pathStages={pathStages}
        journeys={mockJourneys}
      />
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("has proper ARIA attributes on the dialog", () => {
    render(
      <PathDetailDrawer
        open={true}
        onClose={onClose}
        pathStages={pathStages}
        journeys={mockJourneys}
      />
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
  });

  it("shows deal count in the body", () => {
    render(
      <PathDetailDrawer
        open={true}
        onClose={onClose}
        pathStages={pathStages}
        journeys={mockJourneys}
      />
    );
    expect(screen.getByText(/2 deals matched this path/)).toBeTruthy();
  });
});
