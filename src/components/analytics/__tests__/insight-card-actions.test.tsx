import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InsightCardActions } from "../insight-card-actions";

const baseProps = {
  insightId: "test-insight",
  isPinned: false,
  onTogglePin: vi.fn(),
  onDismiss: vi.fn(),
  onCreateTask: vi.fn(),
  isCreatingTask: false,
};

describe("InsightCardActions", () => {
  it("renders three action buttons", () => {
    render(<InsightCardActions {...baseProps} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(3);
  });

  it("pin button has correct aria-label when unpinned", () => {
    render(<InsightCardActions {...baseProps} isPinned={false} />);
    const pinBtn = screen.getByRole("button", { name: "Pin insight" });
    expect(pinBtn).toBeTruthy();
    expect(pinBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("pin button has correct aria-label when pinned", () => {
    render(<InsightCardActions {...baseProps} isPinned={true} />);
    const pinBtn = screen.getByRole("button", { name: "Unpin insight" });
    expect(pinBtn).toBeTruthy();
    expect(pinBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("pin button calls onTogglePin on click", () => {
    const onTogglePin = vi.fn();
    render(<InsightCardActions {...baseProps} onTogglePin={onTogglePin} />);
    fireEvent.click(screen.getByRole("button", { name: "Pin insight" }));
    expect(onTogglePin).toHaveBeenCalledTimes(1);
  });

  it("dismiss button calls onDismiss on click", () => {
    const onDismiss = vi.fn();
    render(<InsightCardActions {...baseProps} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss insight" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("create task button calls onCreateTask on click", () => {
    const onCreateTask = vi.fn();
    render(<InsightCardActions {...baseProps} onCreateTask={onCreateTask} />);
    fireEvent.click(screen.getByRole("button", { name: "Create task from this insight" }));
    expect(onCreateTask).toHaveBeenCalledTimes(1);
  });

  it("create task button is disabled when isCreatingTask is true", () => {
    render(<InsightCardActions {...baseProps} isCreatingTask={true} />);
    const btn = screen.getByRole("button", { name: "Create task from this insight" });
    expect(btn.hasAttribute("disabled")).toBe(true);
  });

  it("create task button shows spinner when isCreatingTask is true", () => {
    const { container } = render(<InsightCardActions {...baseProps} isCreatingTask={true} />);
    // Loader2 renders with animate-spin class
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeTruthy();
  });

  it("all buttons are keyboard-accessible (have button role)", () => {
    render(<InsightCardActions {...baseProps} />);
    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => {
      expect(btn.tagName).toBe("BUTTON");
    });
  });

  it("group wrapper has aria-label for screen reader context", () => {
    const { container } = render(<InsightCardActions {...baseProps} />);
    const group = container.querySelector('[role="group"]');
    expect(group).toBeTruthy();
    expect(group?.getAttribute("aria-label")).toBe("Insight actions");
  });
});
