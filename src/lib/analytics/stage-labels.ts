function normalizeStageMetricKey(value: string | null | undefined): string {
  return value?.trim().toLowerCase().replace(/[\s_-]+/g, "") ?? "";
}

export function isClosedWonStageLabel(value: string | null | undefined): boolean {
  return normalizeStageMetricKey(value) === "closedwon";
}
