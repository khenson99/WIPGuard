import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRovingTabindex } from "../useRovingTabindex";

describe("useRovingTabindex", () => {
  it("initializes focused index to 0", () => {
    const { result } = renderHook(() => useRovingTabindex(6, 3));
    expect(result.current.focusedIndex).toBe(0);
  });

  it("returns tabIndex 0 for focused cell, -1 for others", () => {
    const { result } = renderHook(() => useRovingTabindex(6, 3));
    expect(result.current.getCellProps(0).tabIndex).toBe(0);
    expect(result.current.getCellProps(1).tabIndex).toBe(-1);
    expect(result.current.getCellProps(5).tabIndex).toBe(-1);
  });

  it("setFocusedIndex updates focused index", () => {
    const { result } = renderHook(() => useRovingTabindex(6, 3));
    act(() => result.current.setFocusedIndex(4));
    expect(result.current.focusedIndex).toBe(4);
    expect(result.current.getCellProps(4).tabIndex).toBe(0);
    expect(result.current.getCellProps(0).tabIndex).toBe(-1);
  });

  it("clamps to bounds without wrap", () => {
    const { result } = renderHook(() => useRovingTabindex(6, 3));
    act(() => result.current.setFocusedIndex(-1));
    expect(result.current.focusedIndex).toBe(0);
    act(() => result.current.setFocusedIndex(100));
    expect(result.current.focusedIndex).toBe(5);
  });

  it("wraps around with wrap option", () => {
    const { result } = renderHook(() => useRovingTabindex(6, 3, { wrap: true }));
    act(() => result.current.setFocusedIndex(-1));
    expect(result.current.focusedIndex).toBe(5);
    act(() => result.current.setFocusedIndex(6));
    expect(result.current.focusedIndex).toBe(0);
  });

  it("fires onFocusChange callback", () => {
    const cb = vi.fn();
    const { result } = renderHook(() =>
      useRovingTabindex(6, 3, { onFocusChange: cb })
    );
    act(() => result.current.setFocusedIndex(3));
    expect(cb).toHaveBeenCalledWith(3);
  });

  it("ArrowRight moves forward by 1", () => {
    const { result } = renderHook(() => useRovingTabindex(6, 3));
    const mockEvent = {
      key: "ArrowRight",
      ctrlKey: false,
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent;
    act(() => {
      result.current.getCellProps(0).onKeyDown(mockEvent);
    });
    expect(result.current.focusedIndex).toBe(1);
    expect(mockEvent.preventDefault).toHaveBeenCalled();
  });

  it("ArrowLeft moves back by 1", () => {
    const { result } = renderHook(() => useRovingTabindex(6, 3));
    act(() => result.current.setFocusedIndex(2));
    const mockEvent = {
      key: "ArrowLeft",
      ctrlKey: false,
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent;
    act(() => {
      result.current.getCellProps(2).onKeyDown(mockEvent);
    });
    expect(result.current.focusedIndex).toBe(1);
  });

  it("ArrowDown moves forward by cols", () => {
    const { result } = renderHook(() => useRovingTabindex(6, 3));
    // Index 1 is row 0, col 1. ArrowDown -> row 1, col 1 -> index 4
    act(() => result.current.setFocusedIndex(1));
    const mockEvent = {
      key: "ArrowDown",
      ctrlKey: false,
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent;
    act(() => {
      result.current.getCellProps(1).onKeyDown(mockEvent);
    });
    expect(result.current.focusedIndex).toBe(4);
  });

  it("ArrowUp moves back by cols", () => {
    const { result } = renderHook(() => useRovingTabindex(6, 3));
    act(() => result.current.setFocusedIndex(4));
    const mockEvent = {
      key: "ArrowUp",
      ctrlKey: false,
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent;
    act(() => {
      result.current.getCellProps(4).onKeyDown(mockEvent);
    });
    expect(result.current.focusedIndex).toBe(1);
  });

  it("Home moves to first cell in current row", () => {
    const { result } = renderHook(() => useRovingTabindex(6, 3));
    // Index 4 is row 1, col 1. Home -> row 1, col 0 -> index 3
    act(() => result.current.setFocusedIndex(4));
    const mockEvent = {
      key: "Home",
      ctrlKey: false,
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent;
    act(() => {
      result.current.getCellProps(4).onKeyDown(mockEvent);
    });
    expect(result.current.focusedIndex).toBe(3);
  });

  it("End moves to last cell in current row", () => {
    const { result } = renderHook(() => useRovingTabindex(6, 3));
    // Index 3 is row 1, col 0. End -> row 1, col 2 -> index 5
    act(() => result.current.setFocusedIndex(3));
    const mockEvent = {
      key: "End",
      ctrlKey: false,
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent;
    act(() => {
      result.current.getCellProps(3).onKeyDown(mockEvent);
    });
    expect(result.current.focusedIndex).toBe(5);
  });

  it("Ctrl+Home moves to first cell overall", () => {
    const { result } = renderHook(() => useRovingTabindex(6, 3));
    act(() => result.current.setFocusedIndex(5));
    const mockEvent = {
      key: "Home",
      ctrlKey: true,
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent;
    act(() => {
      result.current.getCellProps(5).onKeyDown(mockEvent);
    });
    expect(result.current.focusedIndex).toBe(0);
  });

  it("Ctrl+End moves to last cell overall", () => {
    const { result } = renderHook(() => useRovingTabindex(6, 3));
    const mockEvent = {
      key: "End",
      ctrlKey: true,
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent;
    act(() => {
      result.current.getCellProps(0).onKeyDown(mockEvent);
    });
    expect(result.current.focusedIndex).toBe(5);
  });

  it("does not move past grid boundaries without wrap", () => {
    const { result } = renderHook(() => useRovingTabindex(6, 3));
    // At index 0: ArrowLeft and ArrowUp should stay at 0
    const leftEvent = {
      key: "ArrowLeft",
      ctrlKey: false,
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent;
    act(() => {
      result.current.getCellProps(0).onKeyDown(leftEvent);
    });
    expect(result.current.focusedIndex).toBe(0);

    const upEvent = {
      key: "ArrowUp",
      ctrlKey: false,
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent;
    act(() => {
      result.current.getCellProps(0).onKeyDown(upEvent);
    });
    expect(result.current.focusedIndex).toBe(0);

    // At last index: ArrowRight and ArrowDown should stay at last
    act(() => result.current.setFocusedIndex(5));
    const rightEvent = {
      key: "ArrowRight",
      ctrlKey: false,
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent;
    act(() => {
      result.current.getCellProps(5).onKeyDown(rightEvent);
    });
    expect(result.current.focusedIndex).toBe(5);
  });

  it("onFocus sets focus to that cell", () => {
    const { result } = renderHook(() => useRovingTabindex(6, 3));
    act(() => {
      result.current.getCellProps(3).onFocus();
    });
    expect(result.current.focusedIndex).toBe(3);
  });
});
