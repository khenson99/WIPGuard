import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RalphBoardView } from "@/components/automations/ralph-board-view";

const kanbanBoardMock = vi.fn();

vi.mock("@/components/board/kanban-board", () => ({
  KanbanBoard: (props: Record<string, unknown>) => {
    kanbanBoardMock(props);
    return <div data-testid="kanban-board" />;
  },
}));

describe("RalphBoardView", () => {
  it("renders the rollout header and pins the board to the seeded project", () => {
    render(
      <RalphBoardView
        projectId="project_ralph"
        projectName="Arda GTM Operators"
      />
    );

    expect(screen.getByText("Ralph Board")).toBeTruthy();
    expect(screen.getByText(/Arda GTM Operators/)).toBeTruthy();
    expect(screen.getByTestId("kanban-board")).toBeTruthy();
    expect(kanbanBoardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filterByProject: "project_ralph",
        lockProjectFilter: true,
      })
    );
  });
});
