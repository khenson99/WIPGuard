import type { TaskStatus } from "@/generated/prisma/client";

// ─── Types ──────────────────────────────────────────────────

export type EnforcementMode = "WARN" | "BLOCK";

export interface WipPolicyConfig {
  columnName: string;
  wipLimit: number;
  enforcement: EnforcementMode;
  overrideRoles: string[];
}

export interface PolicyCheckInput {
  targetColumn: TaskStatus;
  currentColumnTaskCount: number;
  userRole: string;
  policies: WipPolicyConfig[];
}

export interface PolicyResult {
  allowed: boolean;
  warning?: string;
  requiresOverride: boolean;
  enforcement: EnforcementMode | null;
  wipLimit: number;
  currentCount: number;
}

// Columns that are considered "terminal" or "buffer" — no WIP enforcement
const EXEMPT_COLUMNS: Set<TaskStatus> = new Set(["BACKLOG", "DONE", "NOT_DONE"]);

// ─── Pure policy check ─────────────────────────────────────

/**
 * Evaluate whether a status transition into `targetColumn` is allowed
 * given the current WIP count and the user's role.
 *
 * Pure function: (state, action, role) → PolicyResult
 */
export function checkWipPolicy(input: PolicyCheckInput): PolicyResult {
  const { targetColumn, currentColumnTaskCount, userRole, policies } = input;

  // Exempt columns never enforce WIP limits
  if (EXEMPT_COLUMNS.has(targetColumn)) {
    return {
      allowed: true,
      requiresOverride: false,
      enforcement: null,
      wipLimit: 0,
      currentCount: currentColumnTaskCount,
    };
  }

  const policy = policies.find((p) => p.columnName === targetColumn);

  // No policy configured → allow freely
  if (!policy || policy.wipLimit <= 0) {
    return {
      allowed: true,
      requiresOverride: false,
      enforcement: null,
      wipLimit: 0,
      currentCount: currentColumnTaskCount,
    };
  }

  const wouldExceed = currentColumnTaskCount >= policy.wipLimit;

  if (!wouldExceed) {
    return {
      allowed: true,
      requiresOverride: false,
      enforcement: policy.enforcement,
      wipLimit: policy.wipLimit,
      currentCount: currentColumnTaskCount,
    };
  }

  // WIP limit would be exceeded
  const canOverride = policy.overrideRoles.includes(userRole);

  if (policy.enforcement === "WARN") {
    // Soft warning: allowed but flagged
    return {
      allowed: true,
      warning: `WIP limit (${policy.wipLimit}) reached for ${targetColumn}. Current count: ${currentColumnTaskCount}.`,
      requiresOverride: false,
      enforcement: "WARN",
      wipLimit: policy.wipLimit,
      currentCount: currentColumnTaskCount,
    };
  }

  // BLOCK mode
  if (canOverride) {
    return {
      allowed: true,
      warning: `WIP limit (${policy.wipLimit}) reached for ${targetColumn}. Override allowed for role "${userRole}".`,
      requiresOverride: true,
      enforcement: "BLOCK",
      wipLimit: policy.wipLimit,
      currentCount: currentColumnTaskCount,
    };
  }

  return {
    allowed: false,
    warning: `WIP limit (${policy.wipLimit}) reached for ${targetColumn}. Your role "${userRole}" cannot override.`,
    requiresOverride: false,
    enforcement: "BLOCK",
    wipLimit: policy.wipLimit,
    currentCount: currentColumnTaskCount,
  };
}

// ─── Batch check for reorder operations ─────────────────────

export interface BatchPolicyCheckInput {
  /** Map of columnName → net new tasks being added to that column */
  columnDeltas: Map<string, number>;
  /** Map of columnName → current task count in that column */
  columnCounts: Map<string, number>;
  userRole: string;
  policies: WipPolicyConfig[];
}

export interface BatchPolicyResult {
  allowed: boolean;
  violations: Array<{
    column: string;
    result: PolicyResult;
  }>;
}

/**
 * Check WIP policy for a batch of status changes (reorder/bulk move).
 * Returns violations for each column that would exceed its WIP limit.
 */
export function checkBatchWipPolicy(input: BatchPolicyCheckInput): BatchPolicyResult {
  const { columnDeltas, columnCounts, userRole, policies } = input;
  const violations: BatchPolicyResult["violations"] = [];

  for (const [column, delta] of columnDeltas) {
    if (delta <= 0) continue; // Only check columns gaining tasks

    const currentCount = columnCounts.get(column) ?? 0;
    const projectedCount = currentCount + delta;

    const result = checkWipPolicy({
      targetColumn: column as TaskStatus,
      currentColumnTaskCount: projectedCount,
      userRole,
      policies,
    });

    if (result.warning || !result.allowed) {
      violations.push({ column, result });
    }
  }

  const blocked = violations.some((v) => !v.result.allowed);

  return {
    allowed: !blocked,
    violations,
  };
}
