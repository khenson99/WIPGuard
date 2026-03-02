import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LogbookExportDropdown from "../LogbookExportDropdown";

vi.mock("@/lib/export/logbook-export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/export/logbook-export")>();
  return {
    ...actual,
    downloadCSV: vi.fn(),
    downloadJSON: vi.fn(),
  };
});

import { downloadCSV, downloadJSON } from "@/lib/export/logbook-export";

const mockEntries = [
  {
    id: "1",
    taskTitle: "Test Task",
    taskNotes: null,
    projectName: "Project A",
    sprintName: null,
    priority: "P1",
    status: "DONE",
    responsible: "Alice",
    accountable: null,
    completedOn: "2026-01-01T00:00:00Z",
    archivedAt: "2026-01-01T01:00:00Z",
  },
];

describe("LogbookExportDropdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a button with correct aria attributes when closed", () => {
    render(<LogbookExportDropdown entries={mockEntries} />);
    const btn = screen.getByRole("button", { name: /export/i });
    expect(btn.getAttribute("aria-haspopup")).toBe("true");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(btn.getAttribute("aria-controls")).toBe("logbook-export-menu");
  });

  it("aria-label includes entry count", () => {
    render(<LogbookExportDropdown entries={mockEntries} />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toBe("Export 1 logbook entries");
  });

  it("is disabled when entries is empty", () => {
    render(<LogbookExportDropdown entries={[]} />);
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("opens menu on click and sets aria-expanded to true", async () => {
    render(<LogbookExportDropdown entries={mockEntries} />);
    const btn = screen.getByRole("button", { name: /export/i });
    await userEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  });

  it("menu has aria-labelledby pointing to trigger", async () => {
    render(<LogbookExportDropdown entries={mockEntries} />);
    await userEvent.click(screen.getByRole("button", { name: /export/i }));
    const menu = screen.getByRole("menu");
    expect(menu.getAttribute("aria-labelledby")).toBe("logbook-export-trigger");
  });

  it("closes menu on Escape and returns focus to trigger", async () => {
    render(<LogbookExportDropdown entries={mockEntries} />);
    const btn = screen.getByRole("button", { name: /export/i });
    await userEvent.click(btn);
    expect(screen.getByRole("menu")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(btn);
  });

  it("opens menu and focuses first item on ArrowDown from trigger", async () => {
    render(<LogbookExportDropdown entries={mockEntries} />);
    const btn = screen.getByRole("button", { name: /export/i });
    btn.focus();
    await userEvent.keyboard("{ArrowDown}");
    const items = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(items[0]);
  });

  it("navigates between menu items with ArrowDown/ArrowUp", async () => {
    render(<LogbookExportDropdown entries={mockEntries} />);
    await userEvent.click(screen.getByRole("button", { name: /export/i }));
    await userEvent.keyboard("{ArrowDown}");
    const items = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(items[0]);
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[1]);
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(items[0]);
  });

  it("triggers CSV download on CSV menuitem click", async () => {
    render(<LogbookExportDropdown entries={mockEntries} />);
    await userEvent.click(screen.getByRole("button", { name: /export/i }));
    await userEvent.click(screen.getByText(/csv/i));
    expect(downloadCSV).toHaveBeenCalledWith(mockEntries, undefined);
  });

  it("triggers JSON download on JSON menuitem click", async () => {
    render(<LogbookExportDropdown entries={mockEntries} />);
    await userEvent.click(screen.getByRole("button", { name: /export/i }));
    await userEvent.click(screen.getByText(/json/i));
    expect(downloadJSON).toHaveBeenCalledWith(mockEntries, undefined);
  });

  it("closes menu after export selection", async () => {
    render(<LogbookExportDropdown entries={mockEntries} />);
    const btn = screen.getByRole("button", { name: /export/i });
    await userEvent.click(btn);
    await userEvent.click(screen.getByText(/csv/i));
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("passes dateRange through to download function", async () => {
    const range = { from: new Date("2026-01-01"), to: new Date("2026-01-31") };
    render(<LogbookExportDropdown entries={mockEntries} dateRange={range} />);
    await userEvent.click(screen.getByRole("button", { name: /export/i }));
    await userEvent.click(screen.getByText(/json/i));
    expect(downloadJSON).toHaveBeenCalledWith(mockEntries, range);
  });

  it("does not open menu when disabled prop is true", async () => {
    render(<LogbookExportDropdown entries={mockEntries} disabled />);
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    await userEvent.click(btn);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
