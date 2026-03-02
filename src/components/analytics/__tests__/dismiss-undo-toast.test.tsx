import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DismissUndoToast } from "../dismiss-undo-toast";

describe("DismissUndoToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the insight title in the message", () => {
    render(
      <DismissUndoToast
        insightTitle="Pipeline conversion risk"
        onUndo={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/Pipeline conversion risk/)).toBeTruthy();
  });

  it("has role=alert for screen reader announcement", () => {
    const { container } = render(
      <DismissUndoToast insightTitle="Test" onUndo={vi.fn()} onClose={vi.fn()} />
    );
    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
  });

  it("undo button calls onUndo and onClose", () => {
    const onUndo = vi.fn();
    const onClose = vi.fn();
    render(
      <DismissUndoToast insightTitle="Test" onUndo={onUndo} onClose={onClose} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("auto-closes after durationMs", () => {
    const onClose = vi.fn();
    render(
      <DismissUndoToast
        insightTitle="Test"
        onUndo={vi.fn()}
        onClose={onClose}
        durationMs={3000}
      />
    );
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not auto-close before durationMs elapses", () => {
    const onClose = vi.fn();
    render(
      <DismissUndoToast
        insightTitle="Test"
        onUndo={vi.fn()}
        onClose={onClose}
        durationMs={5000}
      />
    );
    vi.advanceTimersByTime(4999);
    expect(onClose).not.toHaveBeenCalled();
  });
});
