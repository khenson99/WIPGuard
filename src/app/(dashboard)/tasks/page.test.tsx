import { beforeEach, describe, expect, it, vi } from "vitest";
import TasksPage from "@/app/(dashboard)/tasks/page";
import { ANALYTICS_HOME } from "@/lib/platform/routes";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  }),
}));

describe("TasksPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects legacy task traffic to analytics", async () => {
    const { redirect } = await import("next/navigation");

    await expect(async () => TasksPage()).rejects.toThrow(`NEXT_REDIRECT:${ANALYTICS_HOME}`);
    expect(redirect).toHaveBeenCalledWith(ANALYTICS_HOME);
  });
});
