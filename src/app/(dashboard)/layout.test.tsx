import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardLayout from "@/app/(dashboard)/layout";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/components/layout/sidebar", () => ({
  Sidebar: () => <div>Sidebar</div>,
}));

vi.mock("@/components/layout/header", () => ({
  Header: () => <div>Header</div>,
}));

vi.mock("@/components/layout/socket-provider", () => ({
  SocketProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("DashboardLayout", () => {
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

    await expect(
      DashboardLayout({
        children: <div>Child</div>,
      })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("renders the dashboard shell for authenticated users", async () => {
    const { auth } = await import("@/lib/auth");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user_1" } } as never);

    const layout = await DashboardLayout({
      children: <div>Child</div>,
    });

    render(layout);

    expect(screen.getByText("Sidebar")).toBeTruthy();
    expect(screen.getByText("Header")).toBeTruthy();
    expect(screen.getByText("Child")).toBeTruthy();
  });
});
