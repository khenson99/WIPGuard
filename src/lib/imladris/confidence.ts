import { parseImladrisNumber } from "@/lib/imladris/number-parsing";

function parseConfidenceNumber(value: string): number | null {
  if (/^[-+]?\d+,\d+$/.test(value)) {
    const parsedDecimalComma = Number(value.replace(",", "."));
    if (Number.isFinite(parsedDecimalComma)) return parsedDecimalComma;
  }
  return parseImladrisNumber(value);
}

export function normalizeMetricConfidence(value: unknown, fallback = 0): number {
  const unwrappedValue = confidenceValue(value);
  let percentageSuffix = false;
  let stringInput = false;
  const numericValue = (() => {
    if (typeof unwrappedValue === "number") return unwrappedValue;
    if (typeof unwrappedValue !== "string") return fallback;

    stringInput = true;
    const normalized = unwrappedValue.trim();
    if (!normalized) return fallback;
    const textPercent = normalized.match(/^(.+?)\s*(?:percent|pct)$/i);
    percentageSuffix = normalized.endsWith("%") || textPercent !== null;
    const parseable = textPercent
      ? textPercent[1].trim()
      : percentageSuffix
        ? normalized.slice(0, -1).trim()
        : normalized;
    const parsed = parseConfidenceNumber(parseable);
    return parsed ?? fallback;
  })();

  if (!Number.isFinite(numericValue)) return fallback;
  const ratio = percentageSuffix ||
    (stringInput && numericValue >= 2 && numericValue <= 100)
    ? numericValue / 100
    : numericValue;
  return Math.min(Math.max(ratio, 0), 1);
}

function confidenceValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "number" || typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    const normalized = value.length === 1 ? confidenceValue(value[0], seen) : null;
    seen.delete(value);
    return normalized;
  }

  const record = value as Record<string, unknown>;
  const data = record.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? (record.data as Record<string, unknown>)
    : {};
  const candidates = [
    record.confidence,
    record.metricConfidence,
    record.metric_confidence,
    record.confidenceScore,
    record.confidence_score,
    record.score,
    data.confidence,
    data.metricConfidence,
    data.metric_confidence,
    data.confidenceScore,
    data.confidence_score,
    data.score,
    data.attributes,
    data.value,
    record.value,
    record.metricValue,
    record.metric_value,
  ];
  for (const candidate of candidates) {
    const normalized = confidenceValue(candidate, seen);
    if (typeof normalized === "number" || typeof normalized === "string") {
      seen.delete(value);
      return normalized;
    }
  }

  seen.delete(value);
  return null;
}

export function normalizeMetricWarnings(value: unknown): string[] {
  const normalized = warningValues(value)
    .filter((warning): warning is string => typeof warning === "string")
    .map((warning) => warning.trim())
    .filter((warning) => warning.length > 0);
  return [...new Set(normalized)];
}

function warningValues(value: unknown, seen = new WeakSet<object>()): unknown[] {
  if (Array.isArray(value)) {
    if (seen.has(value)) return [];
    seen.add(value);
    const values = value.flatMap((item) => warningValues(item, seen));
    seen.delete(value);
    return values;
  }
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const record = value as Record<string, unknown>;
  const data = record.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? (record.data as Record<string, unknown>)
    : {};
  const values = [
    data.attributes,
    data.value,
    data.warnings,
    data.warning,
    data.messages,
    data.message,
    data.errors,
    data.error,
    data.issues,
    data.issue,
    data.details,
    data.detail,
    record.warnings,
    record.warning,
    record.messages,
    record.message,
    record.errors,
    record.error,
    record.issues,
    record.issue,
    record.details,
    record.detail,
    record.value,
    record.metricValue,
    record.metric_value,
  ].flatMap((item) => warningValues(item, seen));

  seen.delete(value);
  return values;
}

export function normalizeMetricStatus(value: unknown): "ready" | "missing" | "partial" | "stale" | "error" {
  const status = statusValue(value);
  if (typeof status !== "string") return "missing";
  switch (status.trim().toUpperCase().replace(/[\s_-]+/g, "_")) {
    case "READY":
    case "SUCCESS":
    case "SUCCEEDED":
    case "COMPLETE":
    case "COMPLETED":
    case "DONE":
    case "OK":
      return "ready";
    case "PARTIAL":
    case "READY_WITH_WARNINGS":
    case "READY_WITH_ERRORS":
    case "COMPLETED_WITH_WARNINGS":
    case "COMPLETED_WITH_ERRORS":
    case "SUCCESS_WITH_WARNINGS":
    case "SUCCESS_WITH_ERRORS":
    case "WARNING":
    case "WARN":
    case "DEGRADED":
    case "PENDING":
    case "QUEUED":
    case "RUNNING":
    case "IN_PROGRESS":
    case "PROCESSING":
      return "partial";
    case "STALE":
    case "EXPIRED":
    case "OUTDATED":
      return "stale";
    case "ERROR":
    case "FAILED":
    case "FAILURE":
    case "TIMED_OUT":
    case "TIMEOUT":
    case "CANCELED":
    case "CANCELLED":
    case "ABORTED":
      return "error";
    case "MISSING":
    case "NOT_FOUND":
    case "UNAVAILABLE":
    case "NONE":
    case "NULL":
    case "":
      return "missing";
    default:
      return "missing";
  }
}

function statusValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    const normalized = value.length === 1 ? statusValue(value[0], seen) : null;
    seen.delete(value);
    return normalized;
  }

  const record = value as Record<string, unknown>;
  const data = record.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? (record.data as Record<string, unknown>)
    : {};
  const candidates = [
    record.status,
    record.state,
    record.result,
    record.name,
    data.status,
    data.state,
    data.result,
    data.name,
    data.attributes,
    data.value,
    record.value,
    record.metricStatus,
    record.metric_status,
  ];
  for (const candidate of candidates) {
    const normalized = statusValue(candidate, seen);
    if (typeof normalized === "string" && normalized.trim().length > 0) {
      seen.delete(value);
      return normalized;
    }
  }

  seen.delete(value);
  return null;
}
