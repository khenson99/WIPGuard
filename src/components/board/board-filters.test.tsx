import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { BoardFilters } from "@/components/board/board-filters";
import { useBoardStore } from "@/store/board-store";

describe("BoardFilters", () => {
  beforeEach(() => {
    useBoardStore.setState({
      teamMembers: [{ id: "user_1", name: "Kyle", email: "kyle@arda.cards", image: null }],
      projects: [
        {
          id: "project_ralph",
          name: "Arda GTM Operators",
          status: "ACTIVE",
          projectType: "PERPETUAL",
          companyPriorityId: null,
        },
      ],
      sprints: [],
      filterAssignee: "user_1",
      filterProject: "project_ralph",
      filterPriority: "P1",
      filterSprint: null,
    });
  });

  it("disables the project selector when the board is pinned to a project", () => {
    render(<BoardFilters lockedProjectId="project_ralph" />);

    const projectSelect = screen.getByLabelText("Filter by project") as HTMLSelectElement;
    expect(projectSelect.disabled).toBe(true);
    expect(projectSelect.value).toBe("project_ralph");
    expect(screen.getByRole("option", { name: "Arda GTM Operators" })).toBeTruthy();
  });

  it("clears other filters without clearing the locked project filter", () => {
    render(<BoardFilters lockedProjectId="project_ralph" />);

    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));

    const state = useBoardStore.getState();
    expect(state.filterAssignee).toBeNull();
    expect(state.filterPriority).toBeNull();
    expect(state.filterProject).toBe("project_ralph");
  });
});
