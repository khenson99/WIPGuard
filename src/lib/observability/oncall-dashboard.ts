/**
 * On-Call Dashboard Data Aggregation
 *
 * Aggregates SLO status, breach detection, runbook suggestions,
 * recent logs/metrics, and system health into a single view
 * for product + engineering on-call use.
 *
 * Pure aggregation functions -- no database access.
 *
 * @module observability/oncall-dashboard
 */

import type { ObservabilitySloReport } from "./slo";
import type { BreachDetectionResult, BreachRecord } from "./breach-detector";
import type {
  StructuredLogEntry,
  MetricPoint,
  TraceSpan,
} from "./structured-logger";
import type { Runbook, RunbookExecutionResult } from "./runbooks";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SystemComponentStatus = "healthy" | "degraded" | "down" | "unknown";

export interface SystemComponentHealth {
  component: string;
  status: SystemComponentStatus;
  lastCheckedAt: string;
  details: string;
}

export interface OnCallDashboardData {
  generatedAt: string;
  /** Overall system status */
  systemStatus: "healthy" | "degraded" | "critical";
  /** SLO report from the evaluation engine */
  sloReport: ObservabilitySloReport;
  /** Breach detection results */
  breachDetection: BreachDetectionResult;
  /** Recent structured log entries (most recent first) */
  recentLogs: StructuredLogEntry[];
  /** Recent metric data points */
  recentMetrics: MetricPoint[];
  /** Recent trace spans */
  recentTraces: TraceSpan[];
  /** Suggested runbooks for active breaches */
  suggestedRunbooks: Runbook[];
  /** Recent runbook execution results */
  runbookExecutions: RunbookExecutionResult[];
  /** System component health checks */
  systemHealth: SystemComponentHealth[];
  /** Time since last SLO check in seconds */
  timeSinceLastCheckSeconds: number | null;
  /** Quick summary for on-call engineer */
  onCallSummary: string;
}

export interface DashboardInput {
  sloReport: ObservabilitySloReport;
  breachDetection: BreachDetectionResult;
  recentLogs: StructuredLogEntry[];
  recentMetrics: MetricPoint[];
  recentTraces: TraceSpan[];
  suggestedRunbooks: Runbook[];
  runbookExecutions: RunbookExecutionResult[];
  systemHealth: SystemComponentHealth[];
  lastCheckAt: Date | null;
  now?: Date;
}

// ---------------------------------------------------------------------------
// Dashboard assembly (pure)
// ---------------------------------------------------------------------------

/**
 * Assemble the on-call dashboard view from pre-collected data.
 */
export function assembleOnCallDashboard(input: DashboardInput): OnCallDashboardData {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  const systemStatus = deriveSystemStatus(
    input.sloReport,
    input.breachDetection,
    input.systemHealth
  );

  const timeSinceLastCheckSeconds = input.lastCheckAt
    ? Math.floor((now.getTime() - input.lastCheckAt.getTime()) / 1000)
    : null;

  const onCallSummary = buildOnCallSummary(
    systemStatus,
    input.breachDetection,
    input.suggestedRunbooks,
    timeSinceLastCheckSeconds
  );

  return {
    generatedAt: nowIso,
    systemStatus,
    sloReport: input.sloReport,
    breachDetection: input.breachDetection,
    recentLogs: input.recentLogs.slice(0, 50), // Cap at 50 entries
    recentMetrics: input.recentMetrics.slice(0, 100),
    recentTraces: input.recentTraces.slice(0, 30),
    suggestedRunbooks: input.suggestedRunbooks,
    runbookExecutions: input.runbookExecutions,
    systemHealth: input.systemHealth,
    timeSinceLastCheckSeconds,
    onCallSummary,
  };
}

// ---------------------------------------------------------------------------
// System status derivation
// ---------------------------------------------------------------------------

function deriveSystemStatus(
  sloReport: ObservabilitySloReport,
  breachDetection: BreachDetectionResult,
  systemHealth: SystemComponentHealth[]
): "healthy" | "degraded" | "critical" {
  // Critical if any component is down or any critical breach
  const anyDown = systemHealth.some((c) => c.status === "down");
  if (anyDown || sloReport.overallStatus === "critical") {
    return "critical";
  }

  // Degraded if any component is degraded or escalation required
  const anyDegraded = systemHealth.some((c) => c.status === "degraded");
  if (anyDegraded || sloReport.overallStatus === "degraded" || breachDetection.escalationRequired) {
    return "degraded";
  }

  return "healthy";
}

// ---------------------------------------------------------------------------
// On-call summary generation
// ---------------------------------------------------------------------------

function buildOnCallSummary(
  status: "healthy" | "degraded" | "critical",
  breachDetection: BreachDetectionResult,
  suggestedRunbooks: Runbook[],
  timeSinceLastCheck: number | null
): string {
  const parts: string[] = [];

  // Status line
  if (status === "healthy") {
    parts.push("All systems operational. No active SLO breaches.");
  } else if (status === "degraded") {
    parts.push(`System degraded. ${breachDetection.activeBreaches.length} active breach(es).`);
  } else {
    parts.push(
      `CRITICAL: ${breachDetection.activeBreaches.length} active breach(es) requiring immediate attention.`
    );
  }

  // Breach details
  if (breachDetection.activeBreaches.length > 0) {
    const breachKeys = breachDetection.activeBreaches.map((b) => b.sloKey).join(", ");
    parts.push(`Affected SLOs: ${breachKeys}.`);
  }

  // Runbook suggestion
  if (suggestedRunbooks.length > 0) {
    const runbookNames = suggestedRunbooks.map((rb) => rb.title).join(", ");
    parts.push(`Suggested runbooks: ${runbookNames}.`);
  }

  // Escalation
  if (breachDetection.escalationRequired) {
    parts.push("ESCALATION REQUIRED. See runbook escalation procedures.");
  }

  // Staleness warning
  if (timeSinceLastCheck !== null && timeSinceLastCheck > 300) {
    parts.push(
      `Warning: Last SLO check was ${Math.floor(timeSinceLastCheck / 60)} minutes ago. ` +
      "Detection latency may be degraded."
    );
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Filtering helpers
// ---------------------------------------------------------------------------

/**
 * Filter log entries by category.
 */
export function filterLogsByCategory(
  logs: StructuredLogEntry[],
  category: string
): StructuredLogEntry[] {
  return logs.filter((l) => l.category === category);
}

/**
 * Filter metrics by name prefix.
 */
export function filterMetricsByPrefix(
  metrics: MetricPoint[],
  prefix: string
): MetricPoint[] {
  return metrics.filter((m) => m.name.startsWith(prefix));
}

/**
 * Get active breach SLO keys.
 */
export function getActiveBreachSloKeys(
  breaches: BreachRecord[]
): string[] {
  return breaches
    .filter((b) => b.resolvedAt === null)
    .map((b) => b.sloKey);
}

/**
 * Compute the mean time to resolution (MTTR) from resolved breaches.
 * Returns null if there are no resolved breaches.
 */
export function computeMTTR(resolvedBreaches: BreachRecord[]): number | null {
  const withDuration = resolvedBreaches.filter(
    (b) => b.resolvedAt !== null && b.durationSeconds !== null
  );

  if (withDuration.length === 0) return null;

  const totalSeconds = withDuration.reduce(
    (sum, b) => sum + (b.durationSeconds ?? 0),
    0
  );

  return Math.floor(totalSeconds / withDuration.length);
}
