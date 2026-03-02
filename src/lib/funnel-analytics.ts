// ─── Funnel Analytics — Pure Computation Engine ───────────────────────────────
// No DB access. Takes pre-fetched counts/data as input, returns deterministic
// results for a given input state. Safe to test without mocking.

export interface FunnelStage {
  name: string;
  count: number;
  conversionFromPrevious: number | null; // null for first stage
  conversionFromTop: number;             // always relative to submissions
  dropOffCount: number | null;           // null for last stage
  dropOffRate: number | null;            // null for last stage
}

export interface DropOffReason {
  status: string;
  count: number;
  percentage: number;
}

export interface FunnelResult {
  dateRange: { from: string; to: string };
  stages: FunnelStage[];
  topDropOffStatuses: DropOffReason[];
  totalSubmissions: number;
  totalCreated: number;
  totalCompleted: number;
  overallConversionRate: number;
}

export interface FunnelInput {
  submissions: number;
  created: number;
  completed: number;
  statusBreakdown: Record<string, number>; // status -> count of tasks with that status
  terminalStatuses: string[];              // which statuses count as "completed"
}

/**
 * Compute a conversion rate, rounded to 4 decimal places for determinism.
 * Returns 0 when denominator is <= 0.
 */
export function computeConversionRate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

/**
 * Compute drop-off reasons from a status breakdown, excluding terminal statuses.
 * Results are sorted by count descending and limited to topN entries.
 * Percentage is relative to totalCreated.
 */
export function computeDropOffReasons(
  statusBreakdown: Record<string, number>,
  terminalStatuses: string[],
  totalCreated: number,
  topN = 5,
): DropOffReason[] {
  const terminalSet = new Set(terminalStatuses);

  return Object.entries(statusBreakdown)
    .filter(([status]) => !terminalSet.has(status))
    .map(([status, count]) => ({
      status,
      count,
      percentage: computeConversionRate(count, totalCreated),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

/**
 * Compute the full funnel from pre-fetched counts.
 * All inputs are sanitized (NaN/undefined/negative → 0).
 */
export function computeFunnel(
  input: FunnelInput,
): Omit<FunnelResult, "dateRange"> {
  const { statusBreakdown, terminalStatuses } = input;

  // Guard: treat negatives/NaN/undefined as 0
  const safeSubmissions = Math.max(0, input.submissions || 0);
  const safeCreated = Math.max(0, input.created || 0);
  const safeCompleted = Math.max(0, input.completed || 0);

  const stages: FunnelStage[] = [
    {
      name: "submissions",
      count: safeSubmissions,
      conversionFromPrevious: null,
      conversionFromTop: 1,
      dropOffCount: safeSubmissions - safeCreated,
      dropOffRate: computeConversionRate(
        safeSubmissions - safeCreated,
        safeSubmissions,
      ),
    },
    {
      name: "created",
      count: safeCreated,
      conversionFromPrevious: computeConversionRate(safeCreated, safeSubmissions),
      conversionFromTop: computeConversionRate(safeCreated, safeSubmissions),
      dropOffCount: safeCreated - safeCompleted,
      dropOffRate: computeConversionRate(
        safeCreated - safeCompleted,
        safeCreated,
      ),
    },
    {
      name: "completed",
      count: safeCompleted,
      conversionFromPrevious: computeConversionRate(safeCompleted, safeCreated),
      conversionFromTop: computeConversionRate(safeCompleted, safeSubmissions),
      dropOffCount: null,
      dropOffRate: null,
    },
  ];

  const topDropOffStatuses = computeDropOffReasons(
    statusBreakdown,
    terminalStatuses,
    safeCreated,
    5,
  );

  return {
    stages,
    topDropOffStatuses,
    totalSubmissions: safeSubmissions,
    totalCreated: safeCreated,
    totalCompleted: safeCompleted,
    overallConversionRate: computeConversionRate(safeCompleted, safeSubmissions),
  };
}
