/**
 * SLO Breach Detection Engine
 *
 * Time-windowed breach detection with history tracking.
 * Breaches are detectable within 5 minutes per acceptance criteria.
 *
 * Pure functions -- no side effects, no database access.
 * All state is injected for testability.
 *
 * @module observability/breach-detector
 */

import type { ObservabilitySloReport, SloSeverity } from "./slo";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BreachRecord {
  sloKey: string;
  severity: SloSeverity;
  detectedAt: string;
  resolvedAt: string | null;
  durationSeconds: number | null;
  value: string;
  threshold: string;
  runbookIds: string[];
}

export interface BreachWindow {
  windowStartedAt: string;
  windowDurationMinutes: number;
  records: BreachRecord[];
}

export interface BreachDetectionResult {
  evaluatedAt: string;
  activeBreaches: BreachRecord[];
  recentlyResolved: BreachRecord[];
  breachWindow: BreachWindow;
  detectionLatencySeconds: number;
  isHealthy: boolean;
  escalationRequired: boolean;
  summary: string;
}

export interface BreachDetectorConfig {
  /** How far back to look for breaches (minutes). Default: 60 */
  windowMinutes: number;
  /** Maximum detection latency target (seconds). Default: 300 (5 min) */
  detectionTargetSeconds: number;
  /** Number of consecutive breach checks before escalation. Default: 2 */
  escalationThreshold: number;
}

export const DEFAULT_BREACH_CONFIG: BreachDetectorConfig = {
  windowMinutes: 60,
  detectionTargetSeconds: 300,
  escalationThreshold: 2,
};

// ---------------------------------------------------------------------------
// Breach history management (pure)
// ---------------------------------------------------------------------------

/**
 * Merge a new SLO report into an existing breach history.
 * Returns updated breach records reflecting current state.
 */
export function updateBreachHistory(
  previousRecords: BreachRecord[],
  report: ObservabilitySloReport,
  now: Date,
  config: BreachDetectorConfig = DEFAULT_BREACH_CONFIG
): BreachRecord[] {
  const nowIso = now.toISOString();
  const windowCutoff = new Date(now.getTime() - config.windowMinutes * 60 * 1000);
  const updated: BreachRecord[] = [];

  // Process each SLO in the report
  for (const slo of report.slos) {
    const existingActive = previousRecords.find(
      (r) => r.sloKey === slo.key && r.resolvedAt === null
    );

    if (slo.breached) {
      if (existingActive) {
        // Continue existing breach -- update duration
        const detectedAt = new Date(existingActive.detectedAt);
        updated.push({
          ...existingActive,
          durationSeconds: Math.floor((now.getTime() - detectedAt.getTime()) / 1000),
          value: slo.value,
          severity: slo.severity ?? existingActive.severity,
        });
      } else {
        // New breach detected
        updated.push({
          sloKey: slo.key,
          severity: slo.severity ?? "warning",
          detectedAt: nowIso,
          resolvedAt: null,
          durationSeconds: 0,
          value: slo.value,
          threshold: slo.thresholdLabel,
          runbookIds: slo.runbookIds,
        });
      }
    } else if (existingActive) {
      // Breach resolved
      const detectedAt = new Date(existingActive.detectedAt);
      updated.push({
        ...existingActive,
        resolvedAt: nowIso,
        durationSeconds: Math.floor((now.getTime() - detectedAt.getTime()) / 1000),
      });
    }
  }

  // Keep resolved records that are within the window
  for (const record of previousRecords) {
    const alreadyUpdated = updated.some(
      (u) => u.sloKey === record.sloKey && u.detectedAt === record.detectedAt
    );

    if (!alreadyUpdated && record.resolvedAt !== null) {
      const resolvedAt = new Date(record.resolvedAt);
      if (resolvedAt >= windowCutoff) {
        updated.push(record);
      }
    }
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Breach detection (pure)
// ---------------------------------------------------------------------------

/**
 * Detect active and recently-resolved breaches from the current report
 * and breach history. Returns a structured detection result.
 */
export function detectBreaches(
  report: ObservabilitySloReport,
  breachHistory: BreachRecord[],
  now: Date,
  config: BreachDetectorConfig = DEFAULT_BREACH_CONFIG
): BreachDetectionResult {
  const nowIso = now.toISOString();
  const windowStart = new Date(now.getTime() - config.windowMinutes * 60 * 1000);

  // Update history with current report
  const updatedRecords = updateBreachHistory(breachHistory, report, now, config);

  const activeBreaches = updatedRecords.filter((r) => r.resolvedAt === null);
  const recentlyResolved = updatedRecords.filter(
    (r) => r.resolvedAt !== null && new Date(r.resolvedAt) >= windowStart
  );

  // Check if escalation is required based on consecutive breach windows
  const criticalBreaches = activeBreaches.filter((b) => b.severity === "critical");
  const longRunningBreaches = activeBreaches.filter(
    (b) =>
      b.durationSeconds !== null &&
      b.durationSeconds >= config.detectionTargetSeconds * config.escalationThreshold
  );
  const escalationRequired = criticalBreaches.length > 0 || longRunningBreaches.length > 0;

  // Compute detection latency (time since last check -- simulated as 0 for real-time)
  const detectionLatencySeconds = 0;

  const isHealthy = activeBreaches.length === 0;

  const summary = buildBreachSummary(activeBreaches, recentlyResolved, report.overallStatus);

  return {
    evaluatedAt: nowIso,
    activeBreaches,
    recentlyResolved,
    breachWindow: {
      windowStartedAt: windowStart.toISOString(),
      windowDurationMinutes: config.windowMinutes,
      records: updatedRecords,
    },
    detectionLatencySeconds,
    isHealthy,
    escalationRequired,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildBreachSummary(
  active: BreachRecord[],
  resolved: BreachRecord[],
  overallStatus: string
): string {
  if (active.length === 0 && resolved.length === 0) {
    return "All SLOs healthy. No active or recently resolved breaches.";
  }

  const parts: string[] = [];

  if (active.length > 0) {
    const critical = active.filter((b) => b.severity === "critical").length;
    const warning = active.filter((b) => b.severity === "warning").length;
    parts.push(
      `${active.length} active breach(es): ${critical} critical, ${warning} warning. System status: ${overallStatus}.`
    );
  }

  if (resolved.length > 0) {
    parts.push(`${resolved.length} breach(es) resolved in the current window.`);
  }

  return parts.join(" ");
}

/**
 * Compute the time since the oldest unresolved breach in seconds.
 * Returns null if there are no active breaches.
 */
export function oldestBreachAgeSeconds(
  activeBreaches: BreachRecord[],
  now: Date
): number | null {
  if (activeBreaches.length === 0) return null;

  const oldest = activeBreaches.reduce((min, b) => {
    const t = new Date(b.detectedAt).getTime();
    return t < min ? t : min;
  }, Infinity);

  return Math.floor((now.getTime() - oldest) / 1000);
}

/**
 * Check whether the detection SLO itself is being met:
 * "SLO breaches are detectable within 5 minutes."
 */
export function isDetectionSloMet(
  checkIntervalSeconds: number,
  config: BreachDetectorConfig = DEFAULT_BREACH_CONFIG
): boolean {
  return checkIntervalSeconds <= config.detectionTargetSeconds;
}
