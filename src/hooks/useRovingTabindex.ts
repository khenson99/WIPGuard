"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface RovingOptions {
  /** Wrap around at edges? Default false */
  wrap?: boolean;
  /** Callback when focused cell changes */
  onFocusChange?: (index: number) => void;
}

interface CellProps {
  tabIndex: number;
  ref: (el: HTMLElement | null) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onFocus: () => void;
}

interface RovingTabindexReturn {
  /** The currently focused linear index */
  focusedIndex: number;
  /** Get props for a cell at linear index */
  getCellProps: (index: number) => CellProps;
  /** Imperatively set focus by linear index */
  setFocusedIndex: (index: number) => void;
}

/**
 * Manages roving tabindex for a flat array displayed in a 2D grid.
 *
 * @param count - Total number of cells
 * @param cols  - Number of columns in the grid layout
 * @param options - Optional config (wrap, onFocusChange)
 */
export function useRovingTabindex(
  count: number,
  cols: number,
  options: RovingOptions = {}
): RovingTabindexReturn {
  const { wrap = false, onFocusChange } = options;
  const [focusedIndex, setFocusedIndexState] = useState(0);
  const cellRefs = useRef<Map<number, HTMLElement>>(new Map());
  // Track the latest count/cols without invalidating callbacks
  const countRef = useRef(count);
  const colsRef = useRef(cols);
  useEffect(() => {
    countRef.current = count;
    colsRef.current = cols;
  }, [count, cols]);

  const clamp = useCallback((index: number): number => {
    const n = countRef.current;
    if (n === 0) return 0;
    if (wrap) return ((index % n) + n) % n;
    return Math.max(0, Math.min(n - 1, index));
  }, [wrap]);

  const setFocusedIndex = useCallback(
    (index: number) => {
      const clamped = clamp(index);
      setFocusedIndexState(clamped);
      onFocusChange?.(clamped);
    },
    [clamp, onFocusChange]
  );

  // Focus the DOM element when focusedIndex changes
  useEffect(() => {
    const el = cellRefs.current.get(focusedIndex);
    if (el && document.activeElement !== el) {
      el.focus();
    }
  }, [focusedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      const cols = colsRef.current;
      const count = countRef.current;
      const row = Math.floor(index / cols);
      const lastCol = cols - 1;

      let nextIndex = index;
      let handled = true;

      switch (e.key) {
        case "ArrowRight":
          nextIndex = index + 1;
          break;
        case "ArrowLeft":
          nextIndex = index - 1;
          break;
        case "ArrowDown":
          nextIndex = index + cols;
          break;
        case "ArrowUp":
          nextIndex = index - cols;
          break;
        case "Home":
          if (e.ctrlKey) {
            nextIndex = 0;
          } else {
            nextIndex = row * cols; // first cell in current row
          }
          break;
        case "End":
          if (e.ctrlKey) {
            nextIndex = count - 1;
          } else {
            // Last cell in current row (clamped to count)
            nextIndex = Math.min(row * cols + lastCol, count - 1);
          }
          break;
        default:
          handled = false;
      }

      if (handled) {
        e.preventDefault();
        setFocusedIndex(nextIndex);
      }
    },
    [setFocusedIndex]
  );

  const getCellProps = useCallback(
    (index: number): CellProps => ({
      tabIndex: index === focusedIndex ? 0 : -1,
      ref: (el: HTMLElement | null) => {
        if (el) {
          cellRefs.current.set(index, el);
        } else {
          cellRefs.current.delete(index);
        }
      },
      onKeyDown: (e: React.KeyboardEvent) => handleKeyDown(e, index),
      onFocus: () => setFocusedIndexState(index),
    }),
    [focusedIndex, handleKeyDown]
  );

  return { focusedIndex, getCellProps, setFocusedIndex };
}
