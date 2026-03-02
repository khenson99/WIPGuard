// ── Types ──────────────────────────────────────────────────────────────────

export interface JourneyRecord {
  id: string;
  /** ISO date string or Date — used to assign the record to a calendar month */
  createdAt: string | Date;
  /** Current pipeline stage (e.g. "Closed Won", "Lead") */
  stage: string;
  /** Whether this journey counts as converted */
  isConverted: boolean;
}

export type BucketKey = string; // "2026-01", "2026-02", etc.

export interface MonthBucket {
  key: BucketKey;
  label: string; // "Jan 2026"
  totalJourneys: number;
  conversions: number;
  conversionRate: number; // 0–1
  stageBreakdown: Record<
    string,
    { entered: number; converted: number; conversionRate: number }
  >;
}

export type TrendDirection = "up" | "down" | "flat" | "insufficient";

export interface TrendIndicator {
  direction: TrendDirection;
  absoluteChange: number;
  percentChange: number | null; // null when previous period is 0 (and current > 0)
  currentValue: number;
  previousValue: number;
  currentPeriod: string;
  previousPeriod: string;
}

export interface KPITrends {
  totalJourneys: TrendIndicator;
  overallConversion: TrendIndicator;
}

export type StageTrendMap = Record<string, TrendIndicator>;

export interface TrendResult {
  buckets: MonthBucket[];
  kpiTrends: KPITrends;
  stageTrends: StageTrendMap;
  hasEnoughData: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function monthKey(d: Date): BucketKey {
  // Use UTC methods so ISO date strings always bucket consistently regardless of local timezone
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: BucketKey): string {
  const [year, month] = key.split("-").map(Number);
  // Use UTC date to avoid DST/timezone shifts in the label
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ── Core bucketing ─────────────────────────────────────────────────────────

/**
 * Groups journeys into calendar-month buckets sorted chronologically.
 * O(n) single pass over the input array.
 */
export function bucketJourneysByMonth(journeys: JourneyRecord[]): MonthBucket[] {
  const map = new Map<BucketKey, JourneyRecord[]>();

  for (const j of journeys) {
    const d = new Date(j.createdAt);
    // Skip invalid dates (NaN)
    if (isNaN(d.getTime())) continue;
    const key = monthKey(d);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = [];
      map.set(key, bucket);
    }
    bucket.push(j);
  }

  const sortedKeys = Array.from(map.keys()).sort();

  return sortedKeys.map((key) => {
    const group = map.get(key)!;
    const stageMap: Record<string, { entered: number; converted: number }> = {};
    let conversions = 0;

    for (const j of group) {
      if (!stageMap[j.stage]) stageMap[j.stage] = { entered: 0, converted: 0 };
      stageMap[j.stage].entered++;
      if (j.isConverted) {
        stageMap[j.stage].converted++;
        conversions++;
      }
    }

    const stageBreakdown: MonthBucket["stageBreakdown"] = {};
    for (const [stage, counts] of Object.entries(stageMap)) {
      stageBreakdown[stage] = {
        ...counts,
        conversionRate: counts.entered > 0 ? counts.converted / counts.entered : 0,
      };
    }

    return {
      key,
      label: monthLabel(key),
      totalJourneys: group.length,
      conversions,
      conversionRate: group.length > 0 ? conversions / group.length : 0,
      stageBreakdown,
    };
  });
}

// ── Trend computation ──────────────────────────────────────────────────────

/**
 * Computes a directional TrendIndicator comparing two scalar values.
 */
export function computeTrendIndicator(
  current: number,
  previous: number,
  currentPeriod: string,
  previousPeriod: string,
): TrendIndicator {
  if (previous === 0 && current === 0) {
    return {
      direction: "flat",
      absoluteChange: 0,
      percentChange: 0,
      currentValue: current,
      previousValue: previous,
      currentPeriod,
      previousPeriod,
    };
  }

  const absoluteChange = current - previous;
  const percentChange = previous !== 0 ? (absoluteChange / previous) * 100 : null;
  const direction: TrendDirection =
    absoluteChange > 0 ? "up" : absoluteChange < 0 ? "down" : "flat";

  return {
    direction,
    absoluteChange,
    percentChange,
    currentValue: current,
    previousValue: previous,
    currentPeriod,
    previousPeriod,
  };
}

/**
 * Compares the two most recent *complete* calendar months.
 *
 * The current in-progress month is intentionally excluded from trend
 * comparison to prevent misleading downward trends early in a month.
 */
export function computeTrends(buckets: MonthBucket[]): TrendResult {
  const insufficientIndicator: TrendIndicator = {
    direction: "insufficient",
    absoluteChange: 0,
    percentChange: null,
    currentValue: 0,
    previousValue: 0,
    currentPeriod: "",
    previousPeriod: "",
  };

  // Exclude the current in-progress calendar month from comparison (UTC-based for consistency)
  const now = new Date();
  const currentMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const completeBuckets = buckets.filter((b) => b.key < currentMonthKey);

  if (completeBuckets.length < 2) {
    return {
      buckets,
      kpiTrends: {
        totalJourneys: insufficientIndicator,
        overallConversion: insufficientIndicator,
      },
      stageTrends: {},
      hasEnoughData: false,
    };
  }

  const current = completeBuckets[completeBuckets.length - 1];
  const previous = completeBuckets[completeBuckets.length - 2];

  const kpiTrends: KPITrends = {
    totalJourneys: computeTrendIndicator(
      current.totalJourneys,
      previous.totalJourneys,
      current.label,
      previous.label,
    ),
    overallConversion: computeTrendIndicator(
      current.conversionRate * 100,
      previous.conversionRate * 100,
      current.label,
      previous.label,
    ),
  };

  // Stage-level trends — union of all stages in both comparison periods
  const allStages = new Set([
    ...Object.keys(current.stageBreakdown),
    ...Object.keys(previous.stageBreakdown),
  ]);

  const stageTrends: StageTrendMap = {};
  for (const stage of allStages) {
    const curRate = (current.stageBreakdown[stage]?.conversionRate ?? 0) * 100;
    const prevRate = (previous.stageBreakdown[stage]?.conversionRate ?? 0) * 100;
    stageTrends[stage] = computeTrendIndicator(
      curRate,
      prevRate,
      current.label,
      previous.label,
    );
  }

  return { buckets, kpiTrends, stageTrends, hasEnoughData: true };
}
