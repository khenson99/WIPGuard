import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/(dashboard)/dashboard/page";
import TasksPage from "@/app/(dashboard)/tasks/page";
import BoardPage from "@/app/(dashboard)/board/page";
import MyTasksPage from "@/app/(dashboard)/my-tasks/page";
import ProjectsPage from "@/app/(dashboard)/projects/page";
import StandupPage from "@/app/(dashboard)/standup/page";
import TodayPage from "@/app/(dashboard)/today/page";
import WhipPage from "@/app/(dashboard)/whip/page";
import TablePage from "@/app/(dashboard)/table/page";
import LogbookPage from "@/app/(dashboard)/logbook/page";
import { ANALYTICS_HOME } from "@/lib/platform/routes";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  }),
}));

const routes = [
  ["dashboard", DashboardPage],
  ["tasks", TasksPage],
  ["board", BoardPage],
  ["my-tasks", MyTasksPage],
  ["projects", ProjectsPage],
  ["standup", StandupPage],
  ["today", TodayPage],
  ["whip", WhipPage],
  ["table", TablePage],
  ["logbook", LogbookPage],
] as const;

describe("legacy product routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(routes)("redirects /%s to analytics", async (_name, Page) => {
    const { redirect } = await import("next/navigation");

    await expect(async () => Page()).rejects.toThrow(`NEXT_REDIRECT:${ANALYTICS_HOME}`);
    expect(redirect).toHaveBeenCalledWith(ANALYTICS_HOME);
  });
});
