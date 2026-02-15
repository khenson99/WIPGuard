import { prisma } from "@/lib/prisma";

/**
 * Shape of each entry in SprintCommitment.taskSnapshots JSON.
 */
export interface TaskSnapshot {
  taskId: string;
  title: string;
  status: string;
  priority: string;
  projectId: string | null;
}

export interface SprintTask {
  id: string;
  title: string;
  status: string;
  unplanned: boolean;
  unplannedReason: string | null;
  unplannedNote: string | null;
  addedBy: string | null;
  createdAt: Date;
}

export interface DailyDelta {
  date: string; // ISO date (YYYY-MM-DD)
  planned: { total: number; done: number };
  unplanned: { total: number; done: number; byReason: Record<string, number> };
  additions: Array<{
    taskId: string;
    title: string;
    addedBy: string | null;
    unplannedReason: string | null;
    unplannedNote: string | null;
    addedAt: string;
  }>;
}

export interface PlannedVsUnplannedSummary {
  totalPlanned: number;
  totalUnplanned: number;
  plannedDone: number;
  unplannedDone: number;
  unplannedByReason: Record<string, number>;
}

export interface PlannedVsUnplannedResult {
  sprintId: string;
  commitmentSnapshot: {
    snapshotAt: string;
    committedTaskIds: string[];
    totalCommitted: number;
  } | null;
  summary: PlannedVsUnplannedSummary;
  dailyDeltas: DailyDelta[];
}

const DONE_STATUSES = new Set(["DONE"]);

/**
 * Categorize tasks into planned and unplanned based on the commitment snapshot.
 * A task is "planned" if it was in the original commitment AND not explicitly marked unplanned.
 * A task is "unplanned" if it was NOT in the commitment OR explicitly marked unplanned.
 */
export function categorizeTasks(
  tasks: SprintTask[],
  committedTaskIds: Set<string>,
): { planned: SprintTask[]; unplanned: SprintTask[] } {
  const planned = tasks.filter(
    (t) => committedTaskIds.has(t.id) && !t.unplanned,
  );
  const unplanned = tasks.filter(
    (t) => !committedTaskIds.has(t.id) || t.unplanned,
  );
  return { planned, unplanned };
}

/**
 * Summarize planned vs unplanned throughput.
 */
export function summarizeThroughput(
  planned: SprintTask[],
  unplanned: SprintTask[],
): PlannedVsUnplannedSummary {
  const unplannedByReason: Record<string, number> = {};
  for (const t of unplanned) {
    const reason = t.unplannedReason ?? "UNSPECIFIED";
    unplannedByReason[reason] = (unplannedByReason[reason] ?? 0) + 1;
  }

  return {
    totalPlanned: planned.length,
    totalUnplanned: unplanned.length,
    plannedDone: planned.filter((t) => DONE_STATUSES.has(t.status)).length,
    unplannedDone: unplanned.filter((t) => DONE_STATUSES.has(t.status)).length,
    unplannedByReason,
  };
}

/**
 * Build daily deltas across a date range.
 * Each day shows cumulative planned/unplanned counts and any new unplanned additions that day.
 */
export function buildDailyDeltas(
  startDate: Date,
  endDate: Date,
  tasks: SprintTask[],
  committedTaskIds: Set<string>,
): DailyDelta[] {
  const deltas: DailyDelta[] = [];
  const now = new Date();
  const end = endDate < now ? endDate : now;

  const current = new Date(startDate);
  current.setUTCHours(0, 0, 0, 0);

  while (current <= end) {
    const dayStr = current.toISOString().split("T")[0];
    const nextDay = new Date(current);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    // Tasks added on this day
    const addedToday = tasks.filter((t) => {
      const created = new Date(t.createdAt);
      return created >= current && created < nextDay;
    });

    // Unplanned additions on this day
    const unplannedAdditions = addedToday
      .filter((t) => !committedTaskIds.has(t.id) || t.unplanned)
      .map((t) => ({
        taskId: t.id,
        title: t.title,
        addedBy: t.addedBy,
        unplannedReason: t.unplannedReason,
        unplannedNote: t.unplannedNote,
        addedAt: t.createdAt.toISOString(),
      }));

    // Cumulative counts up to end of this day
    const tasksUpToDay = tasks.filter(
      (t) => new Date(t.createdAt) < nextDay,
    );
    const { planned: plannedUpToDay, unplanned: unplannedUpToDay } =
      categorizeTasks(tasksUpToDay, committedTaskIds);

    const byReason: Record<string, number> = {};
    for (const t of unplannedUpToDay) {
      const reason = t.unplannedReason ?? "UNSPECIFIED";
      byReason[reason] = (byReason[reason] ?? 0) + 1;
    }

    deltas.push({
      date: dayStr,
      planned: {
        total: plannedUpToDay.length,
        done: plannedUpToDay.filter((t) => DONE_STATUSES.has(t.status)).length,
      },
      unplanned: {
        total: unplannedUpToDay.length,
        done: unplannedUpToDay.filter((t) => DONE_STATUSES.has(t.status))
          .length,
        byReason,
      },
      additions: unplannedAdditions,
    });

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return deltas;
}

/**
 * Compute planned vs unplanned throughput for a sprint.
 * Fetches data from the database and delegates to pure functions.
 */
export async function computePlannedVsUnplanned(
  sprintId: string,
): Promise<PlannedVsUnplannedResult> {
  const firstCommitment = await prisma.sprintCommitment.findFirst({
    where: { sprintId },
    orderBy: { snapshotAt: "asc" },
  });

  const sprint = await prisma.sprint.findUniqueOrThrow({
    where: { id: sprintId },
  });

  const currentTasks = await prisma.task.findMany({
    where: { sprintId },
    select: {
      id: true,
      title: true,
      status: true,
      unplanned: true,
      unplannedReason: true,
      unplannedNote: true,
      addedBy: true,
      createdAt: true,
    },
  });

  const committedTaskIds = new Set<string>();
  if (firstCommitment) {
    const snapshots = firstCommitment.taskSnapshots as unknown as TaskSnapshot[];
    for (const s of snapshots) {
      committedTaskIds.add(s.taskId);
    }
  }

  const { planned, unplanned } = categorizeTasks(currentTasks, committedTaskIds);
  const summary = summarizeThroughput(planned, unplanned);
  const dailyDeltas = buildDailyDeltas(
    sprint.startDate,
    sprint.endDate,
    currentTasks,
    committedTaskIds,
  );

  return {
    sprintId,
    commitmentSnapshot: firstCommitment
      ? {
          snapshotAt: firstCommitment.snapshotAt.toISOString(),
          committedTaskIds: Array.from(committedTaskIds),
          totalCommitted: committedTaskIds.size,
        }
      : null,
    summary,
    dailyDeltas,
  };
}
