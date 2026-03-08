export function normalizePercentValue(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value >= -1 && value <= 1 ? value * 100 : value;
}
