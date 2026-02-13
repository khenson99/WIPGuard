import { prisma } from "@/lib/prisma";
import {
  checkWipPolicy,
  type PolicyResult,
  type WipPolicyConfig,
} from "@/lib/policy-engine";
import type { TaskStatus } from "@/generated/prisma/client";

/**
 * Load all WIP policies from the database.
 * Results are read fresh each call — policy changes take effect without restart.
 */
export async function loadPolicies(): Promise<WipPolicyConfig[]> {
  const rows = await prisma.wipPolicy.findMany();
  return rows.map((r) => ({
    columnName: r.columnName,
    wipLimit: r.wipLimit,
    enforcement: r.enforcement as WipPolicyConfig["enforcement"],
    overrideRoles: r.overrideRoles,
  }));
}

/**
 * Count tasks currently in a given column, optionally excluding a specific task
 * (useful when moving a task from one column to another).
 */
export async function countTasksInColumn(
  column: TaskStatus,
  excludeTaskId?: string
): Promise<number> {
  const where: Record<string, unknown> = { status: column };
  if (excludeTaskId) {
    where.id = { not: excludeTaskId };
  }
  return prisma.task.count({ where });
}

/**
 * Full policy enforcement check for a single status transition.
 * Loads policies from DB, counts tasks in the target column, and returns the result.
 */
export async function enforcePolicy(
  targetColumn: TaskStatus,
  userRole: string,
  excludeTaskId?: string
): Promise<PolicyResult> {
  const [policies, count] = await Promise.all([
    loadPolicies(),
    countTasksInColumn(targetColumn, excludeTaskId),
  ]);

  return checkWipPolicy({
    targetColumn,
    currentColumnTaskCount: count,
    userRole,
    policies,
  });
}

/**
 * Record a policy override in the audit trail.
 */
export async function recordPolicyOverride(params: {
  taskId: string;
  action: string;
  reason: string;
  actorId: string;
  actorName?: string;
  actorRole?: string;
  column: string;
  wipCount: number;
  wipLimit: number;
}) {
  return prisma.policyOverride.create({ data: params });
}

/**
 * Get the user's role from the database. Falls back to "member".
 */
export async function getUserRole(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role ?? "member";
}
