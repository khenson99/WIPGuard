/**
 * Deterministic calculators for Imladris derived metrics.
 *
 * Derived metrics (net new ARR, ARR growth rate, burn multiple, ARPA, and the
 * Healthy ARR Growth composite) are computed on read from canonical metric
 * values — they are never materialized themselves, never AI-generated, and
 * their status/confidence always degrades from the input metrics so a missing
 * or stale source only affects the metrics that actually depend on it.
 */

import {
  IMLADRIS_DERIVED_CALCULATION_VERSION,
  IMLADRIS_DERIVED_METRIC_DEFINITIONS,
  derivedMetricSourceKeys,
  getImladrisMetricDefinition,
} from "@/lib/imladris/catalog";
import { parseImladrisNumber } from "@/lib/imladris/number-parsing";

export type DerivedMetricStatus = "ready" | "missing" | "partial" | "stale" | "error";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/**
 * Extract a scalar number from a canonical metric value (matches the key
 * descent used by `history.ts#extractNumber` and the client `num()` helper).
 */
export function extractImladrisScalar(value: unknown, seen = new WeakSet<object>()): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string") return parseImladrisNumber(value);
  if (typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.length === 1 ? extractImladrisScalar(value[0], seen) : null;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["value", "amount", "months", "rate", "score", "ratio", "count", "balance", "total", "metricValue", "metric_value"]) {
    if (key in record) {
      const extracted = extractImladrisScalar(record[key], seen);
      if (extracted != null) return extracted;
    }
  }
  if ("data" in record) return extractImladrisScalar(record.data, seen);
  return null;
}

// ---- numeric calculators (shared by the service and history layers) --------

export function deriveNetNewArr(arr: number | null, previousArr: number | null): number | null {
  if (arr == null || previousArr == null) return null;
  return round2(arr - previousArr);
}

export function deriveArrGrowthRate(arr: number | null, previousArr: number | null): number | null {
  if (arr == null || previousArr == null || previousArr <= 0) return null;
  return round2(((arr - previousArr) / previousArr) * 100);
}

/**
 * Burn multiple = net burn ÷ net-new ARR. Undefined (null) when net-new ARR is
 * not positive — dividing by shrinking ARR produces a meaningless negative
 * ratio. A non-positive net burn (cash-flow positive) reports 0 (best case).
 */
export function deriveBurnMultiple(netBurn: number | null, netNewArr: number | null): number | null {
  if (netBurn == null || netNewArr == null || netNewArr <= 0) return null;
  if (netBurn <= 0) return 0;
  return round2(netBurn / netNewArr);
}

export function deriveArpa(mrr: number | null, customerCount: number | null): number | null {
  if (mrr == null || customerCount == null || customerCount <= 0) return null;
  return round2(mrr / customerCount);
}

/**
 * Healthy ARR Growth composite (0–100). Deterministic linear bands:
 *   growth     0–40 pts: 0 at ≤0% MoM ARR growth, max at ≥15%
 *   efficiency 0–25 pts: max at burn multiple ≤1, 0 at ≥4 (or no net-new ARR)
 *   retention  0–20 pts: 0 at NRR ≤85%, max at ≥120%
 *   runway     0–15 pts: 0 at ≤3 months, max at ≥18 months
 */
export function deriveHealthyArrGrowthScore(input: {
  arrGrowthRatePct: number | null;
  netNewArr: number | null;
  burnMultiple: number | null;
  nrrPct: number | null;
  runwayMonths: number | null;
}): number | null {
  const { arrGrowthRatePct, netNewArr, burnMultiple, nrrPct, runwayMonths } = input;
  if (arrGrowthRatePct == null || netNewArr == null || nrrPct == null || runwayMonths == null) {
    return null;
  }
  // Positive net-new ARR without a burn multiple means net burn is unknown.
  if (netNewArr > 0 && burnMultiple == null) return null;
  const growthPts = clamp01(arrGrowthRatePct / 15) * 40;
  const efficiencyPts =
    netNewArr <= 0 || burnMultiple == null ? 0 : clamp01((4 - burnMultiple) / 3) * 25;
  const retentionPts = clamp01((nrrPct - 85) / 35) * 20;
  const runwayPts = clamp01((runwayMonths - 3) / 15) * 15;
  return round2(growthPts + efficiencyPts + retentionPts + runwayPts);
}

// ---- service-layer row builder ----------------------------------------------

/** The slice of a built base metric a derived calculation needs. */
export interface DerivedMetricInput {
  key: string;
  status: DerivedMetricStatus;
  confidence: number;
  value: number | null;
  /** Scalar value for the calendar month immediately before the current period. */
  previousValue: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  computedAt: string | null;
}

const STATUS_SEVERITY: Record<DerivedMetricStatus, number> = {
  ready: 0,
  stale: 1,
  partial: 2,
  missing: 3,
  error: 4,
};

function worstStatus(statuses: DerivedMetricStatus[]): DerivedMetricStatus {
  return statuses.reduce<DerivedMetricStatus>(
    (worst, status) => (STATUS_SEVERITY[status] > STATUS_SEVERITY[worst] ? status : worst),
    "ready",
  );
}

function inputLabel(key: string): string {
  return getImladrisMetricDefinition(key)?.label ?? key;
}

interface DerivedComputation {
  value: number | null;
  /** Why the value is undefined even though inputs may be healthy. */
  undefinedReason?: string;
}

function computeDerivedValue(
  key: string,
  inputs: Map<string, DerivedMetricInput>,
): DerivedComputation {
  const arr = inputs.get("revenue.arr");
  const netNewArr = deriveNetNewArr(arr?.value ?? null, arr?.previousValue ?? null);
  const noPriorArr =
    arr?.value != null && arr.previousValue == null
      ? "No ARR value exists for the previous period, so the period-over-period delta is undefined."
      : undefined;
  switch (key) {
    case "revenue.net_new_arr":
      return { value: netNewArr, undefinedReason: noPriorArr };
    case "revenue.arr_growth_rate":
      return {
        value: deriveArrGrowthRate(arr?.value ?? null, arr?.previousValue ?? null),
        undefinedReason: noPriorArr,
      };
    case "finance.burn_multiple": {
      const netBurn = inputs.get("finance.net_burn")?.value ?? null;
      const value = deriveBurnMultiple(netBurn, netNewArr);
      return {
        value,
        undefinedReason:
          value == null && netNewArr != null && netNewArr <= 0
            ? "Net-new ARR was not positive this period, so burn multiple is undefined."
            : noPriorArr,
      };
    }
    case "revenue.arpa":
      return {
        value: deriveArpa(
          inputs.get("revenue.mrr")?.value ?? null,
          inputs.get("revenue.customer_count")?.value ?? null,
        ),
      };
    case "company.healthy_arr_growth": {
      const netBurn = inputs.get("finance.net_burn")?.value ?? null;
      return {
        value: deriveHealthyArrGrowthScore({
          arrGrowthRatePct: deriveArrGrowthRate(arr?.value ?? null, arr?.previousValue ?? null),
          netNewArr,
          burnMultiple: deriveBurnMultiple(netBurn, netNewArr),
          nrrPct: inputs.get("customer_success.retention_rate")?.value ?? null,
          runwayMonths: inputs.get("finance.cash_runway_months")?.value ?? null,
        }),
        undefinedReason: noPriorArr,
      };
    }
    default:
      return { value: null };
  }
}

/**
 * Build derived metric rows in the same shape `buildImladrisMetrics` returns
 * for canonical metrics, degrading status/confidence from the input metrics.
 */
export function buildDerivedImladrisMetricRows(input: {
  inputsByKey: Map<string, DerivedMetricInput>;
  sourceStatuses: Map<string, string>;
}) {
  return IMLADRIS_DERIVED_METRIC_DEFINITIONS.map((definition) => {
    const inputMetrics = definition.inputs.map(
      (key) =>
        input.inputsByKey.get(key) ?? {
          key,
          status: "missing" as const,
          confidence: 0,
          value: null,
          previousValue: null,
          periodStart: null,
          periodEnd: null,
          computedAt: null,
        },
    );
    const { value, undefinedReason } = computeDerivedValue(definition.key, input.inputsByKey);

    const inputStatus = worstStatus(inputMetrics.map((metric) => metric.status));
    const status: DerivedMetricStatus =
      value == null && inputStatus === "ready" ? "missing" : inputStatus;
    const confidence =
      value == null ? 0 : Math.min(...inputMetrics.map((metric) => metric.confidence));

    const warnings: string[] = [];
    for (const metric of inputMetrics) {
      if (metric.status !== "ready") {
        warnings.push(`Input metric ${inputLabel(metric.key)} is ${metric.status}.`);
      } else if (metric.value == null) {
        warnings.push(`Input metric ${inputLabel(metric.key)} has no usable value.`);
      }
    }
    if (undefinedReason && value == null) warnings.push(undefinedReason);

    // Anchor the derived period to the first input that has one (ARR for the
    // growth family); derived values are only as current as their inputs.
    const anchor = inputMetrics.find((metric) => metric.periodEnd != null);

    return {
      key: definition.key,
      label: definition.label,
      department: definition.department,
      unit: definition.unit,
      value,
      periodStart: anchor?.periodStart ?? null,
      periodEnd: anchor?.periodEnd ?? null,
      status,
      confidence,
      calculationVersion: IMLADRIS_DERIVED_CALCULATION_VERSION,
      computedAt: anchor?.computedAt ?? null,
      derivedFrom: definition.inputs.slice(),
      formula: definition.formula,
      sourceLineage: derivedMetricSourceKeys(definition).map((sourceKey) => ({
        sourceKey,
        status: input.sourceStatuses.get(sourceKey) ?? "missing",
      })),
      warnings,
    };
  });
}
