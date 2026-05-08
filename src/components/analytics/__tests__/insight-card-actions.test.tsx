import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InsightCardActions } from "../insight-card-actions";

const baseProps = {
  isPinned: false,
  onTogglePin: vi.fn(),
  onDismiss: vi.fn(),
};

describe("InsightCardActions", () => {
  it("renders two action buttons", () => {
    render(<InsightCardActions {...baseProps} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(2);
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
