// ─── Funnel Data Access Layer ──────────────────────────────────────────────────
// Queries Prisma for the raw counts needed by the pure funnel engine.
// Separating this from funnel-analytics.ts enables clean unit testing of the
// computation without DB access.

import { PrismaClient } from "@/generated/prisma/client";
import type { FunnelInput } from "./funnel-analytics";

// TaskStatus enum values from prisma/schema.prisma
// BACKLOG | QUEUED | WORKING_ON_TODAY | ACTIVE | NOT_DONE | DONE
const TERMINAL_STATUSES = ["DONE"] as const;

export interface FunnelQueryParams {
  from: Date;
  to: Date;
  projectId?: string;
}

export async function fetchFunnelInput(
  prisma: PrismaClient,
  params: FunnelQueryParams,
): Promise<FunnelInput> {
  const { from, to, projectId } = params;
  const dateFilter = { gte: from, lte: to };

  // 1. Count submission events in range
  const submissions = await prisma.submissionEvent.count({
    where: {
      createdAt: dateFilter,
      ...(projectId
        ? { metadata: { path: ["projectId"], equals: projectId } }
        : {}),
    },
  });

  // 2. Count tasks created in range
  const taskWhere: Record<string, unknown> = { createdAt: dateFilter };
  if (projectId) taskWhere.projectId = projectId;

  const created = await prisma.task.count({ where: taskWhere });

  // 3. Count completed tasks (those with a terminal status, created in range)
  const completed = await prisma.task.count({
    where: {
      ...taskWhere,
      status: { in: TERMINAL_STATUSES as unknown as string[] },
    },
  });

  // 4. Get status breakdown for all tasks created in range
  const statusGroups = await prisma.task.groupBy({
    by: ["status"],
    where: taskWhere,
    _count: { status: true },
  });

  const statusBreakdown: Record<string, number> = {};
  for (const group of statusGroups) {
    statusBreakdown[group.status] = group._count.status;
  }

  return {
    submissions,
    created,
    completed,
    statusBreakdown,
    terminalStatuses: [...TERMINAL_STATUSES],
  };
}
