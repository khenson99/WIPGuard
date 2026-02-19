import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectDashboard } from "@/components/projects/project-dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("ProjectDashboard", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows explicit load error when base dashboard requests fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/projects")) {
          return { ok: false, status: 500, json: async () => ({}) } as Response;
        }
        return { ok: true, status: 200, json: async () => [] } as Response;
      })
    );

    render(<ProjectDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Projects dashboard unavailable")).toBeTruthy();
    });

    expect(screen.getByText("Projects request failed (500)")).toBeTruthy();
  });
});
