import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { KanbanBounceBenchmark } from "@/components/analytics/kanban-bounce-benchmark";
import type { KanbanBounceComparison } from "@/lib/analytics/types";

function makeComparison(
  overrides: Partial<KanbanBounceComparison> = {}
): KanbanBounceComparison {
  return {
    matchedPaths: ["/kanban-template"],
    kanbanBounceRate: 0.42,
    kanbanSessions: 1760,
    siteBounceRate: 0.5,
    deltaVsSitePts: -8,
    periodDeltaPts: -3,
    rankAmongPeers: 2,
    peerCount: 9,
    peerPages: [
      { path: "/product", bounceRate: 0.35, sessions: 5120 },
      { path: "/pricing", bounceRate: 0.55, sessions: 1820 },
    ],
    verdict: "better",
    ...overrides,
  };
}

describe("KanbanBounceBenchmark", () => {
  it("renders nothing when no comparison data is provided", () => {
    const { container } = render(<KanbanBounceBenchmark comparison={null} />);
    expect(container.textContent).toBe("");
  });

  it("renders the Kanban bounce-rate value formatted as percent", () => {
    render(<KanbanBounceBenchmark comparison={makeComparison()} />);
    // 42.0% appears both in the stat tile AND in the peer-row entry —
    // assert it shows up at least once in either location.
    const occurrences = screen.getAllByText("42.0%");
    expect(occurrences.length).toBeGreaterThan(0);
  });

  it("renders site bounce + delta vs site with correct sign", () => {
    render(
      <KanbanBounceBenchmark
        comparison={makeComparison({ deltaVsSitePts: -8 })}
      />
    );
    expect(screen.getByText("50.0%")).toBeTruthy(); // site
    expect(screen.getByText("-8.0pts")).toBeTruthy();
  });

  it("renders 'Improving' when periodDeltaPts is negative", () => {
    render(
      <KanbanBounceBenchmark
        comparison={makeComparison({ periodDeltaPts: -3 })}
      />
    );
    expect(screen.getByText("Improving")).toBeTruthy();
  });

  it("renders '—' and 'No prior data' when periodDeltaPts is null", () => {
    render(
      <KanbanBounceBenchmark
        comparison={makeComparison({ periodDeltaPts: null })}
      />
    );
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("No prior data")).toBeTruthy();
  });

  it("highlights the Kanban row in the peer ranking", () => {
    render(<KanbanBounceBenchmark comparison={makeComparison()} />);
    const list = screen.getByTestId("kanban-bounce-peer-list");
    const kanbanRow = within(list).getByText(/\/kanban-template/);
    expect(kanbanRow.textContent).toContain("/kanban-template");
    // Outer row carries the highlight data attribute
    const rowEl = kanbanRow.closest('[data-kanban-row="true"]');
    expect(rowEl).not.toBeNull();
  });

  it("sorts peer ranking by ascending bounce rate", () => {
    render(<KanbanBounceBenchmark comparison={makeComparison()} />);
    const list = screen.getByTestId("kanban-bounce-peer-list");
    // peers: /product 35%, /kanban-template 42%, /pricing 55%
    // Expect that visual order: product first, kanban-template second, pricing third
    const rows = list.querySelectorAll("[data-kanban-row]");
    const paths = Array.from(rows).map((r) =>
      (r.textContent || "").split("★")[0].trim()
    );
    const idxProduct = paths.findIndex((p) => p.startsWith("/product"));
    const idxKanban = paths.findIndex((p) => p.startsWith("/kanban-template"));
    const idxPricing = paths.findIndex((p) => p.startsWith("/pricing"));
    expect(idxProduct).toBeLessThan(idxKanban);
    expect(idxKanban).toBeLessThan(idxPricing);
  });
});
