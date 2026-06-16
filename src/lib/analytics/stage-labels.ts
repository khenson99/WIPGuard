import { normalizeStageKey as normalizeStageMetricKey } from "@/lib/analytics/stage-key";

export function isClosedWonStageLabel(value: string | null | undefined): boolean {
  return normalizeStageMetricKey(value) === "closedwon";
}
