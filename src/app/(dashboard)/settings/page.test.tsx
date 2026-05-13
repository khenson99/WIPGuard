import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "@/app/(dashboard)/settings/page";

const replace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/settings",
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/components/settings/team-tab", () => ({
  TeamTab: () => <div>Team</div>,
}));

vi.mock("@/components/settings/operations-tab", () => ({
  OperationsTab: () => <div>Operations</div>,
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    replace.mockReset();
  });

  it("renders only analytics-era settings tabs", () => {
    const { queryByRole } = render(<SettingsPage />);

    expect(queryByRole("tab", { name: "Team" })).toBeTruthy();
    expect(queryByRole("tab", { name: "Operations" })).toBeTruthy();
    expect(queryByRole("tab", { name: "Integrations" })).toBeNull();
    expect(queryByRole("tab", { name: "Board & WIP Limits" })).toBeNull();
    expect(queryByRole("tab", { name: "Sprints" })).toBeNull();
    expect(queryByRole("tab", { name: "Projects" })).toBeNull();
    expect(queryByRole("tab", { name: "Departments" })).toBeNull();
    expect(queryByRole("tab", { name: "Company Priorities" })).toBeNull();
    expect(queryByRole("tab", { name: "Design Interview" })).toBeNull();
  });

  it("redirects legacy integrations tab links into the integrations workspace", async () => {
    mockSearchParams = new URLSearchParams("tab=integrations&status=connected&integration=slack");

    render(<SettingsPage />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(
        "/integrations?status=connected&integration=slack",
        { scroll: false },
      );
    });
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
});
