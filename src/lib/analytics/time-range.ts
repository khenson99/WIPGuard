export type AnalyticsRangePreset = "7d" | "30d" | "90d" | "180d" | "365d" | "custom";

export interface AnalyticsTimeRange {
  preset: AnalyticsRangePreset;
  from: string;
  to: string;
  days: number;
  label: string;
}

const PRESET_DAYS: Record<Exclude<AnalyticsRangePreset, "custom">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "365d": 365,
};

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date): Date {
  const value = new Date(date);
  value.setUTCHours(23, 59, 59, 999);
  return value;
}

function parseFlexibleDate(value: string | null, boundary: "start" | "end"): Date | null {
  if (!value) return null;
  if (DATE_ONLY_REGEX.test(value)) {
    return boundary === "start"
      ? new Date(`${value}T00:00:00.000Z`)
      : new Date(`${value}T23:59:59.999Z`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return boundary === "start" ? startOfDay(parsed) : endOfDay(parsed);
}

function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toLabel(preset: AnalyticsRangePreset, days: number): string {
  if (preset === "custom") return "Custom range";
  if (preset === "7d") return "Last 7 days";
  if (preset === "30d") return "Last 30 days";
  if (preset === "90d") return "Last 90 days";
  if (preset === "180d") return "Last 180 days";
  if (preset === "365d") return "Last 12 months";
  return `Last ${days} days`;
}

export function parseAnalyticsTimeRange(params: URLSearchParams, now = new Date()): AnalyticsTimeRange {
  const presetValue = (params.get("range") || "30d").toLowerCase();
  const preset: AnalyticsRangePreset =
    presetValue === "7d" ||
    presetValue === "30d" ||
    presetValue === "90d" ||
    presetValue === "180d" ||
    presetValue === "365d" ||
    presetValue === "custom"
      ? (presetValue as AnalyticsRangePreset)
      : "30d";

  const end = endOfDay(now);

  if (preset === "custom") {
    const parsedFrom = parseFlexibleDate(params.get("from"), "start");
    const parsedTo = parseFlexibleDate(params.get("to"), "end");
    if (parsedFrom && parsedTo && parsedFrom <= parsedTo) {
      const days = Math.max(
        1,
        Math.ceil((parsedTo.getTime() - parsedFrom.getTime()) / (1000 * 60 * 60 * 24))
      );
      return {
        preset,
        from: toDateKey(parsedFrom),
        to: toDateKey(parsedTo),
        days,
        label: toLabel(preset, days),
      };
    }
  }

  const days = PRESET_DAYS[preset as Exclude<AnalyticsRangePreset, "custom">] ?? 30;
  const start = startOfDay(new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000));
  return {
    preset: preset === "custom" ? "30d" : preset,
    from: toDateKey(start),
    to: toDateKey(end),
    days,
    label: toLabel(preset === "custom" ? "30d" : preset, days),
  };
}

export function buildRangeQuery(searchParams: URLSearchParams | null): string {
  const params = new URLSearchParams();
  const range = searchParams?.get("range");
  const from = searchParams?.get("from");
  const to = searchParams?.get("to");
  if (range) params.set("range", range);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return params.toString();
}

export function buildAnalyticsRangeSearchParams(range: AnalyticsTimeRange): URLSearchParams {
  const params = new URLSearchParams();
  params.set("range", range.preset);
  params.set("from", range.from);
  params.set("to", range.to);
  return params;
}

