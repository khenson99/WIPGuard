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

vi.mock("@/components/settings/board-settings-tab", () => ({
  BoardSettingsTab: () => <div>Board Settings</div>,
}));

vi.mock("@/components/settings/sprints-tab", () => ({
  SprintsTab: () => <div>Sprints</div>,
}));

vi.mock("@/components/settings/projects-tab", () => ({
  ProjectsTab: () => <div>Projects</div>,
}));

vi.mock("@/components/settings/priorities-tab", () => ({
  PrioritiesTab: () => <div>Priorities</div>,
}));

vi.mock("@/components/settings/team-tab", () => ({
  TeamTab: () => <div>Team</div>,
}));

vi.mock("@/components/settings/departments-tab", () => ({
  DepartmentsTab: () => <div>Departments</div>,
}));

vi.mock("@/components/settings/operations-tab", () => ({
  OperationsTab: () => <div>Operations</div>,
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    replace.mockReset();
  });

  it("renders settings tabs without an integrations tab", () => {
    const { queryByRole, getByText } = render(<SettingsPage />);

    expect(getByText("Board Settings")).toBeTruthy();
    expect(queryByRole("tab", { name: "Integrations" })).toBeNull();
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
});
