import type { KpiDelta } from "@/lib/analytics/types";

export function computeKpiDelta(input: {
  current: number | null;
  previous: number | null;
  currentCapturedAt?: string | null;
  previousCapturedAt?: string | null;
  epsilon?: number;
}): KpiDelta {
  const epsilon = input.epsilon ?? 1e-9;
  const current = input.current;
  const previous = input.previous;

  if (current == null || previous == null) {
    return {
      current,
      previous,
      delta: null,
      deltaPct: null,
      direction: "flat",
      dataRecency: {
        currentCapturedAt: input.currentCapturedAt ?? null,
        previousCapturedAt: input.previousCapturedAt ?? null,
      },
    };
  }

  const delta = current - previous;
  const direction =
    Math.abs(delta) <= epsilon ? "flat" : delta > 0 ? "up" : "down";

  let deltaPct: number | null = null;
  if (previous !== 0) {
    deltaPct = (delta / previous) * 100;
  } else if (current === 0) {
    deltaPct = 0;
  }

  return {
    current,
    previous,
    delta,
    deltaPct,
    direction,
    dataRecency: {
      currentCapturedAt: input.currentCapturedAt ?? null,
      previousCapturedAt: input.previousCapturedAt ?? null,
    },
  };
}

