export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadPolicies } from "@/lib/policy-check";
import type { TaskStatus } from "@/generated/prisma/client";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
} as const;

const TASK_INCLUDE = {
  project: { select: { id: true, name: true } },
  responsible: { select: USER_SELECT },
  dependsOn: { select: { id: true, title: true, status: true } },
  dependedBy: { select: { id: true, title: true, status: true } },
} as const;

/**
 * GET /api/standup
 *
 * Returns data structured for the daily standup cockpit:
 * - Active tasks grouped by owner
 * - Blocked tasks (tasks whose dependencies aren't done)
 * - Stale tasks (not updated in 21+ days)
 * - WIP policy state per column
 * - Flow coaching signals
 */
export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const [activeTasks, policies, statusCounts] = await Promise.all([
      // All non-backlog, non-done tasks
      prisma.task.findMany({
        where: {
          status: { in: ["QUEUED", "WORKING_ON_TODAY", "ACTIVE", "NOT_DONE"] },
        },
        include: TASK_INCLUDE,
        orderBy: [{ priority: "asc" }, { columnOrder: "asc" }],
      }),

      loadPolicies(),

      // Count tasks per status for WIP analysis
      prisma.task.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
    ]);

    // Build status count map
    const countByStatus: Record<string, number> = {};
    for (const row of statusCounts) {
      countByStatus[row.status] = row._count.id;
    }

    // Build WIP state per column
    const wipState: Array<{
      column: TaskStatus;
      count: number;
      limit: number;
      exceeded: boolean;
    }> = [];
    for (const policy of policies) {
      const count = countByStatus[policy.columnName] ?? 0;
      wipState.push({
        column: policy.columnName as TaskStatus,
        count,
        limit: policy.wipLimit,
        exceeded: policy.wipLimit > 0 && count > policy.wipLimit,
      });
    }

    // Identify blocked tasks: depend on tasks that aren't DONE
    const blocked = activeTasks.filter(
      (t) =>
        t.dependsOn &&
        t.dependsOn.length > 0 &&
        t.dependsOn.some((dep) => dep.status !== "DONE")
    );
    const blockedIds = new Set(blocked.map((t) => t.id));

    // Identify stale tasks: not updated in 3+ days
    const stale = activeTasks.filter(
      (t) => new Date(t.updatedAt) < threeDaysAgo
    );
    const staleIds = new Set(stale.map((t) => t.id));

    // Group active tasks by owner
    type OwnerGroup = {
      userId: string;
      userName: string | null;
      userEmail: string;
      tasks: typeof activeTasks;
      wipCount: number;
      blockedCount: number;
      staleCount: number;
    };

    const ownerMap = new Map<string, OwnerGroup>();
    const unassigned: typeof activeTasks = [];

    for (const task of activeTasks) {
      if (!task.responsible || task.responsible.length === 0) {
        unassigned.push(task);
        continue;
      }
      for (const user of task.responsible) {
        let group = ownerMap.get(user.id);
        if (!group) {
          group = {
            userId: user.id,
            userName: user.name,
            userEmail: user.email,
            tasks: [],
            wipCount: 0,
            blockedCount: 0,
            staleCount: 0,
          };
          ownerMap.set(user.id, group);
        }
        group.tasks.push(task);
        if (
          task.status === "WORKING_ON_TODAY" ||
          task.status === "ACTIVE"
        ) {
          group.wipCount++;
        }
        if (blockedIds.has(task.id)) group.blockedCount++;
        if (staleIds.has(task.id)) group.staleCount++;
      }
    }

    // Generate flow coaching signals
    const coachingPrompts: Array<{
      type: "finish_before_start" | "stale_warning" | "blocked_alert" | "wip_exceeded";
      severity: "info" | "warning" | "critical";
      message: string;
      targetUserId?: string;
      targetTaskId?: string;
    }> = [];

    // Per-owner coaching: finish-before-start when WIP > personal limit
    for (const group of ownerMap.values()) {
      if (group.wipCount > 2) {
        coachingPrompts.push({
          type: "finish_before_start",
          severity: "warning",
          message: `${group.userName || group.userEmail} has ${group.wipCount} tasks in progress. Focus on finishing before starting new work.`,
          targetUserId: group.userId,
        });
      }
      if (group.blockedCount > 0) {
        coachingPrompts.push({
          type: "blocked_alert",
          severity: "critical",
          message: `${group.userName || group.userEmail} has ${group.blockedCount} blocked task(s). Unblock or defer to restore flow.`,
          targetUserId: group.userId,
        });
      }
    }

    // Global coaching: WIP exceeded
    for (const wip of wipState) {
      if (wip.exceeded) {
        coachingPrompts.push({
          type: "wip_exceeded",
          severity: "critical",
          message: `${wip.column.replace(/_/g, " ")} has ${wip.count} tasks (limit: ${wip.limit}). Reduce WIP to improve flow.`,
        });
      }
    }

    // Stale task coaching
    if (stale.length > 0) {
      coachingPrompts.push({
        type: "stale_warning",
        severity: "warning",
        message: `${stale.length} task(s) haven't been updated in 3+ days. Review and unblock or re-prioritize.`,
      });
    }

    return NextResponse.json({
      owners: Array.from(ownerMap.values()).sort(
        (a, b) => b.blockedCount - a.blockedCount || b.wipCount - a.wipCount
      ),
      unassigned,
      blocked,
      stale,
      wipState,
      coachingPrompts,
      totalActive: activeTasks.length,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("GET /api/standup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
