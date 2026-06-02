import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import DashboardPage from "@/app/(dashboard)/dashboard/page";
import { METRICS_HOME } from "@/lib/platform/routes";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  }),
}));

const redirectRoutes = [
  ["dashboard", DashboardPage],
] as const;

const retiredRoutes = [
  "tasks",
  "board",
  "my-tasks",
  "projects",
  "standup",
  "today",
  "whip",
  "table",
  "logbook",
] as const;

describe("legacy product routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(redirectRoutes)("redirects /%s to metrics", async (_name, Page) => {
    const { redirect } = await import("next/navigation");

    await expect(async () => Page()).rejects.toThrow(`NEXT_REDIRECT:${METRICS_HOME}`);
    expect(redirect).toHaveBeenCalledWith(METRICS_HOME);
  });

  it.each(retiredRoutes)("does not ship a visible /%s page", (route) => {
    expect(existsSync(join(process.cwd(), "src/app/(dashboard)", route, "page.tsx"))).toBe(false);
  });
});
