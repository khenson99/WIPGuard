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

vi.mock("@/components/settings/priorities-tab", () => ({
  PrioritiesTab: () => <div>Priorities</div>,
}));

vi.mock("@/components/settings/design-interview-tab", () => ({
  DesignInterviewTab: () => <div>Design Interview</div>,
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
    const { queryByRole } = render(<SettingsPage />);

    expect(queryByRole("tabpanel")?.textContent).toContain("Departments");
    expect(queryByRole("tab", { name: "Design Interview" })).toBeTruthy();
    expect(queryByRole("tab", { name: "Integrations" })).toBeNull();
    expect(queryByRole("tab", { name: "Board & WIP Limits" })).toBeNull();
    expect(queryByRole("tab", { name: "Sprints" })).toBeNull();
    expect(queryByRole("tab", { name: "Projects" })).toBeNull();
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

  it("redirects legacy work-management tabs to departments", async () => {
    mockSearchParams = new URLSearchParams("tab=board");

    render(<SettingsPage />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/settings?tab=departments", { scroll: false });
    });
  });

  it("redirects legacy sprint and project tabs to departments", async () => {
    mockSearchParams = new URLSearchParams("tab=sprints");

    render(<SettingsPage />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/settings?tab=departments", { scroll: false });
    });
  });
});
