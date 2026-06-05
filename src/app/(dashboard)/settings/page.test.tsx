import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "@/app/(dashboard)/settings/page";

const replace = vi.fn();
let mockSearchParams = new URLSearchParams();
let mockRole = "member";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/settings",
  useSearchParams: () => mockSearchParams,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: { id: "user-1", role: mockRole } },
  }),
}));

vi.mock("@/components/settings/team-tab", () => ({
  TeamTab: () => <div>Team</div>,
}));

vi.mock("@/components/settings/operations-tab", () => ({
  OperationsTab: () => <div>Operations</div>,
}));

vi.mock("@/components/settings/integrations-tab", () => ({
  IntegrationsTab: () => <div>Integrations panel</div>,
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockRole = "member";
    replace.mockReset();
  });

  it("renders settings tabs including integrations", () => {
    const { queryByRole } = render(<SettingsPage />);

    expect(queryByRole("tab", { name: "Team" })).toBeTruthy();
    expect(queryByRole("tab", { name: "Integrations" })).toBeTruthy();
    expect(queryByRole("tab", { name: "Operations" })).toBeTruthy();
    expect(queryByRole("tab", { name: "Board & WIP Limits" })).toBeNull();
    expect(queryByRole("tab", { name: "Sprints" })).toBeNull();
    expect(queryByRole("tab", { name: "Projects" })).toBeNull();
    expect(queryByRole("tab", { name: "Departments" })).toBeNull();
    expect(queryByRole("tab", { name: "Company Priorities" })).toBeNull();
    expect(queryByRole("tab", { name: "Design Interview" })).toBeNull();
  });

  it("renders the integrations tab from direct links", () => {
    mockSearchParams = new URLSearchParams("tab=integrations&status=connected&integration=slack");

    render(<SettingsPage />);

    expect(screen.getByRole("tab", { name: "Integrations" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Integrations panel")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects legacy task-management tabs to team settings", async () => {
    mockSearchParams = new URLSearchParams("tab=board&source=old-link");

    render(<SettingsPage />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(
        "/settings?tab=team&source=old-link",
        { scroll: false },
      );
    });
  });

  it("redirects investor users away from settings", async () => {
    mockRole = "investor";

    const { queryByRole } = render(<SettingsPage />);

    expect(queryByRole("tab", { name: "Team" })).toBeNull();
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/investor");
    });
  });
});
