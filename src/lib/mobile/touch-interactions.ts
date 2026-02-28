/**
 * Touch interaction utilities for mobile field workflows.
 * All touch targets enforce the 44px minimum per WCAG 2.5.5.
 */

export type SwipeDirection = "left" | "right" | "up" | "down";
export interface TouchGesture { type: "swipe" | "long-press" | "tap"; direction?: SwipeDirection; startX: number; startY: number; endX: number; endY: number; duration: number; }
export interface TouchTargetSize { minWidth: number; minHeight: number; padding: number; }

export const MIN_TOUCH_TARGET_PX = 44;
const SWIPE_THRESHOLD_PX = 30;
const LONG_PRESS_THRESHOLD_MS = 500;

export function detectSwipe(startX: number, startY: number, endX: number, endY: number): SwipeDirection | null {
  const dx = endX - startX;
  const dy = endY - startY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx < SWIPE_THRESHOLD_PX && absDy < SWIPE_THRESHOLD_PX) return null;
  if (absDx >= absDy) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

export function classifyGesture(startX: number, startY: number, endX: number, endY: number, duration: number): TouchGesture {
  const direction = detectSwipe(startX, startY, endX, endY);
  if (direction) return { type: "swipe", direction, startX, startY, endX, endY, duration };
  if (duration >= LONG_PRESS_THRESHOLD_MS) return { type: "long-press", startX, startY, endX, endY, duration };
  return { type: "tap", startX, startY, endX, endY, duration };
}

export function handleLongPress(durationMs: number): boolean {
  return durationMs >= LONG_PRESS_THRESHOLD_MS;
}

export function getTouchTargetSize(contentWidth: number, contentHeight: number): TouchTargetSize {
  const minWidth = Math.max(contentWidth, MIN_TOUCH_TARGET_PX);
  const minHeight = Math.max(contentHeight, MIN_TOUCH_TARGET_PX);
  const padding = Math.max(0, Math.ceil((MIN_TOUCH_TARGET_PX - Math.min(contentWidth, contentHeight)) / 2));
  return { minWidth, minHeight, padding };
}
