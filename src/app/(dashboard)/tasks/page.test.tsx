import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TasksPage from "@/app/(dashboard)/tasks/page";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/components/board/kanban-board", () => ({
  KanbanBoard: () => <div>Kanban Board</div>,
}));

describe("TasksPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("redirects unauthenticated visitors to /login", async () => {
    const { auth } = await import("@/lib/auth");
    const { redirect } = await import("next/navigation");

    vi.mocked(auth).mockResolvedValue(null as never);
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(TasksPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("renders the kanban board for authenticated users", async () => {
    const { auth } = await import("@/lib/auth");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user_1" } } as never);

    const page = await TasksPage();

    render(page);

    expect(screen.getByText("Kanban Board")).toBeTruthy();
  });
});
