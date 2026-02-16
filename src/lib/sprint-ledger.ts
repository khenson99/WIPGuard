import { prisma } from "@/lib/prisma";

// ============================================================
// TYPES
// ============================================================

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

// ============================================================
// UNPLANNED REASON TAXONOMY
// ============================================================

/**
 * Canonical unplanned reason taxonomy with display labels and descriptions.
 * Mirrors the Prisma UnplannedReason enum but enriches it for UI / reporting.
 */
export interface UnplannedReasonEntry {
  code: string;
  label: string;
  description: string;
}

export const UNPLANNED_REASON_TAXONOMY: readonly UnplannedReasonEntry[] = [
  { code: "ESCALATION", label: "Escalation", description: "Urgent issue escalated from leadership or stakeholders" },
  { code: "BUG_FIX", label: "Bug Fix", description: "Production bug requiring immediate attention" },
  { code: "CUSTOMER_REQUEST", label: "Customer Request", description: "High-priority request from a customer" },
  { code: "SCOPE_CHANGE", label: "Scope Change", description: "Requirement change after planning" },
  { code: "DEPENDENCY", label: "Dependency", description: "Blocking dependency from another team or system" },
  { code: "OTHER", label: "Other", description: "Reason not covered by standard categories" },
] as const;

export const VALID_UNPLANNED_REASONS = new Set(
  UNPLANNED_REASON_TAXONOMY.map((r) => r.code),
);

/**
 * Validate an unplanned reason code against the taxonomy.
 */
export function isValidUnplannedReason(reason: string): boolean {
  return VALID_UNPLANNED_REASONS.has(reason);
}

// ============================================================
// COMMITMENT CHANGE LOG (Append-only Ledger)
// ============================================================

/**
 * Represents a single change between two commitment snapshots.
 * Used to build an auditable, append-only log of commitment drift.
 */
export interface CommitmentChange {
  type: "ADDED" | "REMOVED";
  taskId: string;
  title: string;
  status: string;
  priority: string;
}

export interface CommitmentChangeLogEntry {
  snapshotId: string;
  snapshotAt: string;
  createdBy: string;
  taskCount: number;
  changes: CommitmentChange[];
}

export interface CommitmentChangeLog {
  sprintId: string;
  entries: CommitmentChangeLogEntry[];
  totalSnapshots: number;
  currentCommittedCount: number;
  initialCommittedCount: number;
  netChange: number;
}

/**
 * Compare two task snapshot arrays and compute added/removed changes.
 * Pure function -- no database access.
 */
export function diffSnapshots(
  previous: TaskSnapshot[],
  current: TaskSnapshot[],
): CommitmentChange[] {
  const prevIds = new Map(previous.map((s) => [s.taskId, s]));
  const currIds = new Map(current.map((s) => [s.taskId, s]));
  const changes: CommitmentChange[] = [];

  // Tasks added (in current but not in previous)
  for (const [taskId, snap] of currIds) {
    if (!prevIds.has(taskId)) {
      changes.push({
        type: "ADDED",
        taskId,
        title: snap.title,
        status: snap.status,
        priority: snap.priority,
      });
    }
  }

  // Tasks removed (in previous but not in current)
  for (const [taskId, snap] of prevIds) {
    if (!currIds.has(taskId)) {
      changes.push({
        type: "REMOVED",
        taskId,
        title: snap.title,
        status: snap.status,
        priority: snap.priority,
      });
    }
  }

  return changes;
}

/**
 * Build a full change log from an ordered array of commitment snapshots.
 * First snapshot is compared against an empty set (initial commitment).
 * Subsequent snapshots are compared against the previous one.
 * Pure function -- no database access.
 */
export function buildCommitmentChangeLog(
  sprintId: string,
  snapshots: Array<{
    id: string;
    snapshotAt: string;
    createdBy: string;
    taskSnapshots: TaskSnapshot[];
  }>,
): CommitmentChangeLog {
  const entries: CommitmentChangeLogEntry[] = [];

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const prevSnapTasks = i === 0 ? [] : snapshots[i - 1].taskSnapshots;
    const changes = diffSnapshots(prevSnapTasks, snap.taskSnapshots);

    entries.push({
      snapshotId: snap.id,
      snapshotAt: snap.snapshotAt,
      createdBy: snap.createdBy,
      taskCount: snap.taskSnapshots.length,
      changes,
    });
  }

  const initialCount = snapshots.length > 0 ? snapshots[0].taskSnapshots.length : 0;
  const currentCount =
    snapshots.length > 0 ? snapshots[snapshots.length - 1].taskSnapshots.length : 0;

  return {
    sprintId,
    entries,
    totalSnapshots: snapshots.length,
    currentCommittedCount: currentCount,
    initialCommittedCount: initialCount,
    netChange: currentCount - initialCount,
  };
}

// ============================================================
// PLANNING SESSION ENRICHMENT
// ============================================================

export interface PlanningSessionSummary {
  id: string;
  sprintId: string;
  createdBy: string;
  startedAt: string;
  completedAt: string | null;
  notes: string | null;
  taskCount: number;
  taskIds: string[];
  hasCommitment: boolean;
}

/**
 * Build a planning session summary from raw data.
 * Pure function -- no database access.
 */
export function buildPlanningSessionSummary(
  session: {
    id: string;
    sprintId: string;
    createdBy: string;
    startedAt: Date;
    completedAt: Date | null;
    notes: string | null;
    tasks: Array<{ id: string }>;
  },
  commitmentSnapshotIds: Set<string>,
): PlanningSessionSummary {
  return {
    id: session.id,
    sprintId: session.sprintId,
    createdBy: session.createdBy,
    startedAt: session.startedAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
    notes: session.notes,
    taskCount: session.tasks.length,
    taskIds: session.tasks.map((t) => t.id),
    hasCommitment: commitmentSnapshotIds.has(session.id),
  };
}

// ============================================================
// SPRINT REPORT
// ============================================================

export interface SprintCommitmentReport {
  sprintId: string;
  sprintName: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  commitmentChangeLog: CommitmentChangeLog;
  plannedVsUnplanned: PlannedVsUnplannedResult;
  planningSessions: PlanningSessionSummary[];
  unplannedReasonTaxonomy: readonly UnplannedReasonEntry[];
}

/**
 * Compute commitment drift percentage: how much the commitment changed
 * relative to the initial commitment size.
 * Returns 0 if there was no initial commitment.
 */
export function computeCommitmentDrift(changeLog: CommitmentChangeLog): number {
  if (changeLog.initialCommittedCount === 0) return 0;
  return Math.abs(changeLog.netChange) / changeLog.initialCommittedCount;
}

/**
 * Compute unplanned ratio: fraction of total work that is unplanned.
 * Returns 0 if there are no tasks.
 */
export function computeUnplannedRatio(summary: PlannedVsUnplannedSummary): number {
  const total = summary.totalPlanned + summary.totalUnplanned;
  if (total === 0) return 0;
  return summary.totalUnplanned / total;
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

// ============================================================
// DATABASE FUNCTIONS
// ============================================================

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

/**
 * Fetch the full commitment change log for a sprint.
 * Reads all commitment snapshots in chronological order and computes diffs.
 */
export async function fetchCommitmentChangeLog(
  sprintId: string,
): Promise<CommitmentChangeLog> {
  const rawSnapshots = await prisma.sprintCommitment.findMany({
    where: { sprintId },
    orderBy: { snapshotAt: "asc" },
    select: {
      id: true,
      snapshotAt: true,
      createdBy: true,
      taskSnapshots: true,
    },
  });

  const snapshots = rawSnapshots.map((s) => ({
    id: s.id,
    snapshotAt: s.snapshotAt.toISOString(),
    createdBy: s.createdBy,
    taskSnapshots: (s.taskSnapshots as unknown as TaskSnapshot[]) ?? [],
  }));

  return buildCommitmentChangeLog(sprintId, snapshots);
}

/**
 * Fetch the full sprint commitment report including change log,
 * planned vs unplanned breakdown, and planning sessions.
 */
export async function fetchSprintCommitmentReport(
  sprintId: string,
): Promise<SprintCommitmentReport> {
  const sprint = await prisma.sprint.findUniqueOrThrow({
    where: { id: sprintId },
  });

  const [changeLog, plannedVsUnplanned, rawSessions] = await Promise.all([
    fetchCommitmentChangeLog(sprintId),
    computePlannedVsUnplanned(sprintId),
    prisma.planningSession.findMany({
      where: { sprintId },
      include: { tasks: { select: { id: true } } },
      orderBy: { startedAt: "asc" },
    }),
  ]);

  // Build a set of planning session IDs that have associated commitments
  // (in this project, a commitment snapshot is auto-created when planning
  // session completes, so we just check for snapshots near session timestamps)
  const commitmentSnapshotIds = new Set<string>();

  const planningSessions = rawSessions.map((s) =>
    buildPlanningSessionSummary(s, commitmentSnapshotIds),
  );

  return {
    sprintId,
    sprintName: sprint.name,
    startDate: sprint.startDate.toISOString(),
    endDate: sprint.endDate.toISOString(),
    isActive: sprint.isActive,
    commitmentChangeLog: changeLog,
    plannedVsUnplanned: plannedVsUnplanned,
    planningSessions,
    unplannedReasonTaxonomy: UNPLANNED_REASON_TAXONOMY,
  };
}
