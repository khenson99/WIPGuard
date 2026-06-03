export function normalizeMetricConfidence(value: unknown, fallback = 0): number {
  let percentageSuffix = false;
  let stringInput = false;
  const numericValue = (() => {
    if (typeof value === "number") return value;
    if (typeof value !== "string") return fallback;

    stringInput = true;
    const normalized = value.trim();
    if (!normalized) return fallback;
    percentageSuffix = normalized.endsWith("%");
    const parsed = Number(percentageSuffix ? normalized.slice(0, -1).trim() : normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  })();

  if (!Number.isFinite(numericValue)) return fallback;
  const ratio = percentageSuffix ||
    (stringInput && numericValue >= 2 && numericValue <= 100)
    ? numericValue / 100
    : numericValue;
  return Math.min(Math.max(ratio, 0), 1);
}

export function normalizeMetricWarnings(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  const normalized = values
    .filter((warning): warning is string => typeof warning === "string")
    .map((warning) => warning.trim())
    .filter((warning) => warning.length > 0);
  return [...new Set(normalized)];
}

export function normalizeMetricStatus(value: unknown): "ready" | "missing" | "partial" | "stale" | "error" {
  if (typeof value !== "string") return "missing";
  switch (value.trim().toUpperCase()) {
    case "READY":
      return "ready";
    case "PARTIAL":
      return "partial";
    case "STALE":
      return "stale";
    case "ERROR":
      return "error";
    default:
      return "missing";
  }
}
