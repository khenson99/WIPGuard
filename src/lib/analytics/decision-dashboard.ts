import type { TaskStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
const WIP_STATUSES = new Set<TaskStatus>(["QUEUED", "WORKING_ON_TODAY", "ACTIVE", "NOT_DONE"]);

export interface DecisionDashboardConfig {
  lookbackDays: number;
  monthlyWindowMonths: number;
  staleTaskDays: number;
}

export interface DecisionEventDefinition {
  key: string;
  name: string;
  source: string;
  description: string;
  usedByMetrics: string[];
}

export interface DecisionCohortSummary {
  cohort: "CEO" | "MARKETING" | "SALES" | "OPS" | "OTHER";
  memberCount: number;
  activeTasks: number;
  overdueTasks: number;
  completedLast30d: number;
  staleActiveTasks: number;
  unplannedCompletedLast30d: number;
}

export interface MonthlyDecisionExportRow {
  month: string;
  created: number;
  completed: number;
  netFlow: number;
  overdueCarryover: number;
  unplannedCompleted: number;
}

export interface DecisionDashboardReport {
  generatedAt: string;
  asOf: string;
  config: DecisionDashboardConfig;
  eventDefinitions: DecisionEventDefinition[];
  northStar: {
    flowReliabilityScore: number;
    throughput30d: number;
    throughputTrendPct: number | null;
    onTimeCompletionRate: number | null;
    activeContributors30d: number;
  };
  supportingMetrics: {
    openTasks: number;
    blockedTasks: number;
    overdueOpenTasks: number;
    staleActiveTasks: number;
    reblockedTaskCount30d: number;
    wipBreachColumns: Array<{
      columnName: string;
      currentCount: number;
      wipLimit: number;
      breachBy: number;
    }>;
    unplannedCompletionRate30d: number | null;
  };
  instrumentation: {
    eventsLast30d: number;
    actionsByType: Array<{ eventKey: string; count: number }>;
    frictionSignals: Array<{ signal: string; count: number; description: string }>;
  };
  cohorts: DecisionCohortSummary[];
  monthlyExport: {
    windowMonths: number;
    rows: MonthlyDecisionExportRow[];
    narrativeAnnotations: string[];
    markdown: string;
  };
  traceability: {
    source: "Task + StatusHistory + BoardSettings + User";
    taskCount: number;
    statusEventCount: number;
    userCount: number;
    taskSampleIds: string[];
  };
}

interface DecisionTaskRecord {
  id: string;
  status: TaskStatus;
  dueDate: Date | null;
  completedOn: Date | null;
  createdAt: Date;
  updatedAt: Date;
  unplanned: boolean;
  addedBy: string | null;
  responsible: Array<{ id: string }>;
  project: {
    department: { name: string } | null;
    sponsor: Array<{ id: string }>;
  } | null;
}

interface DecisionStatusEvent {
  taskId: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  changedAt: Date;
  changedBy: string | null;
}

interface DecisionUserRecord {
  id: string;
  role: string;
}

const EVENT_DEFINITIONS: DecisionEventDefinition[] = [
  {
    key: "task.created",
    name: "Task Created",
    source: "Task.createdAt",
    description: "New work item was added to the system.",
    usedByMetrics: ["eventsLast30d", "created", "netFlow"],
  },
  {
    key: "task.status_changed",
    name: "Task Status Changed",
    source: "StatusHistory.changedAt / fromStatus / toStatus",
    description: "A user moved a task between workflow states.",
    usedByMetrics: ["eventsLast30d", "actionsByType", "reblockedTaskCount30d"],
  },
  {
    key: "task.completed",
    name: "Task Completed",
    source: "Task.completedOn OR StatusHistory.toStatus = DONE",
    description: "A task finished delivery.",
    usedByMetrics: ["throughput30d", "onTimeCompletionRate", "completed"],
  },
  {
    key: "task.blocked",
    name: "Task Blocked",
    source: "StatusHistory.toStatus = NOT_DONE",
    description: "Task entered blocked/not-done state.",
    usedByMetrics: ["reblockedTaskCount30d", "frictionSignals"],
  },
  {
    key: "task.overdue_open",
    name: "Open Task Overdue",
    source: "Task.dueDate < now AND Task.status != DONE",
    description: "Open task has crossed due date and contributes to slippage risk.",
    usedByMetrics: ["overdueOpenTasks", "flowReliabilityScore", "frictionSignals"],
  },
];

export function defaultDecisionDashboardConfig(): DecisionDashboardConfig {
  return {
    lookbackDays: 30,
    monthlyWindowMonths: 6,
    staleTaskDays: 5,
  };
}

function toIntegerInRange(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export function normalizeDecisionDashboardConfig(
  raw?: Partial<DecisionDashboardConfig>
): DecisionDashboardConfig {
  const fallback = defaultDecisionDashboardConfig();
  if (!raw) return fallback;
  return {
    lookbackDays: toIntegerInRange(raw.lookbackDays, fallback.lookbackDays, 7, 120),
    monthlyWindowMonths: toIntegerInRange(
      raw.monthlyWindowMonths,
      fallback.monthlyWindowMonths,
      3,
      12
    ),
    staleTaskDays: toIntegerInRange(raw.staleTaskDays, fallback.staleTaskDays, 1, 45),
  };
}

function startOfUtcMonth(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), 1));
}

function addUtcMonths(input: Date, months: number): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth() + months, 1));
}

function monthLabel(input: Date): string {
  return `${input.getUTCFullYear()}-${String(input.getUTCMonth() + 1).padStart(2, "0")}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function cohortForTask(input: {
  task: DecisionTaskRecord;
  adminUserIds: Set<string>;
}): Set<DecisionCohortSummary["cohort"]> {
  const cohorts = new Set<DecisionCohortSummary["cohort"]>();
  const departmentName = input.task.project?.department?.name?.toLowerCase() ?? "";

  const hasAdminOwner = input.task.responsible.some((owner) => input.adminUserIds.has(owner.id));
  const hasAdminSponsor = (input.task.project?.sponsor ?? []).some((owner) =>
    input.adminUserIds.has(owner.id)
  );
  if (hasAdminOwner || hasAdminSponsor) {
    cohorts.add("CEO");
  }

  if (departmentName.includes("marketing") || departmentName.includes("growth")) {
    cohorts.add("MARKETING");
  }
  if (departmentName.includes("sales") || departmentName.includes("revenue")) {
    cohorts.add("SALES");
  }
  if (departmentName.includes("ops") || departmentName.includes("operations")) {
    cohorts.add("OPS");
  }

  if (cohorts.size === 0) {
    cohorts.add("OTHER");
  }
  return cohorts;
}

function computeThroughputTrend(input: { current: number; previous: number }): number | null {
  if (input.previous === 0) {
    return input.current === 0 ? 0 : null;
  }
  return round2(((input.current - input.previous) / input.previous) * 100);
}

function buildMonthlyNarrative(rows: MonthlyDecisionExportRow[]): string[] {
  const notes: string[] = [];
  for (const row of rows) {
    if (row.completed < row.created) {
      notes.push(`${row.month}: Intake exceeded completion by ${row.created - row.completed}.`);
    }
    if (row.overdueCarryover > 0) {
      notes.push(`${row.month}: ${row.overdueCarryover} task(s) carried overdue into month end.`);
    }
    if (row.completed > row.created + 3) {
      notes.push(`${row.month}: Delivery burn-down outpaced intake by ${row.completed - row.created}.`);
    }
    if (row.completed > 0 && row.unplannedCompleted / row.completed >= 0.35) {
      notes.push(`${row.month}: Unplanned work consumed ${round2((row.unplannedCompleted / row.completed) * 100)}% of completions.`);
    }
  }
  if (notes.length === 0) {
    notes.push("Flow remained stable with no major monthly anomalies.");
  }
  return notes;
}

function buildMonthlyMarkdown(rows: MonthlyDecisionExportRow[], narrative: string[]): string {
  const lines = [
    "# WIPGuard Monthly Flow Export",
    "",
    "| Month | Created | Completed | Net Flow | Overdue Carryover | Unplanned Completed |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map(
      (row) =>
        `| ${row.month} | ${row.created} | ${row.completed} | ${row.netFlow} | ${row.overdueCarryover} | ${row.unplannedCompleted} |`
    ),
    "",
    "## Narrative Annotations",
    ...narrative.map((note) => `- ${note}`),
  ];
  return lines.join("\n");
}

async function fetchDecisionDataset(input: {
  asOf: Date;
  config: DecisionDashboardConfig;
}): Promise<{
  users: DecisionUserRecord[];
  tasks: DecisionTaskRecord[];
  statusEvents: DecisionStatusEvent[];
  boardSettings: Array<{ columnName: string; wipLimit: number }>;
  lookbackStart: Date;
  previousLookbackStart: Date;
  monthlyStart: Date;
}> {
  const lookbackStart = new Date(input.asOf.getTime() - input.config.lookbackDays * DAY_MS);
  const previousLookbackStart = new Date(lookbackStart.getTime() - input.config.lookbackDays * DAY_MS);
  const monthlyStart = addUtcMonths(startOfUtcMonth(input.asOf), -(input.config.monthlyWindowMonths - 1));

  const [users, tasks, statusEvents, boardSettings] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        role: true,
      },
    }),
    prisma.task.findMany({
      where: {
        OR: [
          { createdAt: { gte: monthlyStart } },
          { completedOn: { gte: monthlyStart } },
          { status: { in: ["BACKLOG", "QUEUED", "WORKING_ON_TODAY", "ACTIVE", "NOT_DONE"] } },
        ],
      },
      select: {
        id: true,
        status: true,
        dueDate: true,
        completedOn: true,
        createdAt: true,
        updatedAt: true,
        unplanned: true,
        addedBy: true,
        responsible: {
          select: { id: true },
        },
        project: {
          select: {
            department: {
              select: {
                name: true,
              },
            },
            sponsor: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    }),
    prisma.statusHistory.findMany({
      where: {
        changedAt: {
          gte: lookbackStart,
          lte: input.asOf,
        },
      },
      select: {
        taskId: true,
        fromStatus: true,
        toStatus: true,
        changedAt: true,
        changedBy: true,
      },
    }),
    prisma.boardSettings.findMany({
      select: {
        columnName: true,
        wipLimit: true,
      },
    }),
  ]);

  return {
    users,
    tasks,
    statusEvents,
    boardSettings,
    lookbackStart,
    previousLookbackStart,
    monthlyStart,
  };
}

export async function computeDecisionDashboard(input?: {
  asOf?: Date;
  config?: Partial<DecisionDashboardConfig>;
}): Promise<DecisionDashboardReport> {
  const asOf = input?.asOf ?? new Date();
  const config = normalizeDecisionDashboardConfig(input?.config);
  const dataset = await fetchDecisionDataset({ asOf, config });

  const staleCutoff = new Date(asOf.getTime() - config.staleTaskDays * DAY_MS);
  const openTasks = dataset.tasks.filter((task) => task.status !== "DONE");
  const completedLookback = dataset.tasks.filter(
    (task) => task.completedOn && task.completedOn >= dataset.lookbackStart && task.completedOn <= asOf
  );
  const completedPrevious = dataset.tasks.filter(
    (task) =>
      task.completedOn &&
      task.completedOn >= dataset.previousLookbackStart &&
      task.completedOn < dataset.lookbackStart
  );
  const overdueOpenTasks = openTasks.filter((task) => task.dueDate && task.dueDate < asOf);
  const staleActiveTasks = openTasks.filter(
    (task) => WIP_STATUSES.has(task.status) && task.updatedAt < staleCutoff
  );

  const doneWithDueDate = completedLookback.filter((task) => task.dueDate);
  const onTimeCompletions = doneWithDueDate.filter(
    (task) => task.completedOn && task.dueDate && task.completedOn <= task.dueDate
  );
  const onTimeCompletionRate =
    doneWithDueDate.length > 0 ? round2(onTimeCompletions.length / doneWithDueDate.length) : null;

  const reblockedCountsByTask = new Map<string, number>();
  for (const event of dataset.statusEvents) {
    if (event.toStatus !== "NOT_DONE") continue;
    reblockedCountsByTask.set(event.taskId, (reblockedCountsByTask.get(event.taskId) ?? 0) + 1);
  }
  const reblockedTaskCount30d = Array.from(reblockedCountsByTask.values()).filter((count) => count >= 2)
    .length;

  const columnCounts: Record<string, number> = {};
  for (const task of openTasks) {
    columnCounts[task.status] = (columnCounts[task.status] ?? 0) + 1;
  }
  const wipBreachColumns = dataset.boardSettings
    .filter((setting) => setting.wipLimit > 0)
    .map((setting) => {
      const currentCount = columnCounts[setting.columnName] ?? 0;
      return {
        columnName: setting.columnName,
        currentCount,
        wipLimit: setting.wipLimit,
        breachBy: Math.max(0, currentCount - setting.wipLimit),
      };
    })
    .filter((item) => item.breachBy > 0)
    .sort((a, b) => b.breachBy - a.breachBy);

  const statusChangeUsers = new Set(
    dataset.statusEvents.map((event) => event.changedBy).filter((value): value is string => Boolean(value))
  );
  const creationUsers = new Set(
    dataset.tasks
      .filter((task) => task.createdAt >= dataset.lookbackStart)
      .map((task) => task.addedBy)
      .filter((value): value is string => Boolean(value))
  );
  const activeContributors30d = new Set([...statusChangeUsers, ...creationUsers]).size;

  const actionCountsByType = new Map<string, number>([
    ["task.created", dataset.tasks.filter((task) => task.createdAt >= dataset.lookbackStart).length],
    ["task.status_changed", dataset.statusEvents.length],
    ["task.completed", completedLookback.length],
    ["task.blocked", dataset.statusEvents.filter((event) => event.toStatus === "NOT_DONE").length],
    ["task.overdue_open", overdueOpenTasks.length],
  ]);

  const throughputTrendPct = computeThroughputTrend({
    current: completedLookback.length,
    previous: completedPrevious.length,
  });

  const overdueRate = openTasks.length > 0 ? overdueOpenTasks.length / openTasks.length : 0;
  const staleRate = openTasks.length > 0 ? staleActiveTasks.length / openTasks.length : 0;
  const blockerEventRate =
    dataset.statusEvents.length > 0
      ? (actionCountsByType.get("task.blocked") ?? 0) / dataset.statusEvents.length
      : 0;
  const trendPenalty = throughputTrendPct !== null && throughputTrendPct < 0 ? Math.min(20, Math.abs(throughputTrendPct) * 0.4) : 0;
  const onTimeBoost = onTimeCompletionRate === null ? 0 : onTimeCompletionRate * 20;
  const flowReliabilityScore = round2(
    Math.max(
      0,
      Math.min(
        100,
        100 - overdueRate * 45 - staleRate * 30 - blockerEventRate * 25 - trendPenalty + onTimeBoost
      )
    )
  );

  const adminUserIds = new Set(
    dataset.users.filter((user) => user.role.trim().toLowerCase() === "admin").map((user) => user.id)
  );
  const cohortMap = new Map<
    DecisionCohortSummary["cohort"],
    {
      members: Set<string>;
      activeTasks: number;
      overdueTasks: number;
      completedLast30d: number;
      staleActiveTasks: number;
      unplannedCompletedLast30d: number;
    }
  >();

  const allCohorts: DecisionCohortSummary["cohort"][] = ["CEO", "MARKETING", "SALES", "OPS", "OTHER"];
  for (const cohort of allCohorts) {
    cohortMap.set(cohort, {
      members: new Set(),
      activeTasks: 0,
      overdueTasks: 0,
      completedLast30d: 0,
      staleActiveTasks: 0,
      unplannedCompletedLast30d: 0,
    });
  }

  for (const task of dataset.tasks) {
    const cohorts = cohortForTask({ task, adminUserIds });
    for (const cohort of cohorts) {
      const current = cohortMap.get(cohort);
      if (!current) continue;
      for (const owner of task.responsible) {
        current.members.add(owner.id);
      }
      if (WIP_STATUSES.has(task.status)) {
        current.activeTasks += 1;
      }
      if (task.status !== "DONE" && task.dueDate && task.dueDate < asOf) {
        current.overdueTasks += 1;
      }
      if (task.completedOn && task.completedOn >= dataset.lookbackStart && task.completedOn <= asOf) {
        current.completedLast30d += 1;
        if (task.unplanned) {
          current.unplannedCompletedLast30d += 1;
        }
      }
      if (WIP_STATUSES.has(task.status) && task.updatedAt < staleCutoff) {
        current.staleActiveTasks += 1;
      }
    }
  }

  const cohorts: DecisionCohortSummary[] = allCohorts.map((cohort) => {
    const current = cohortMap.get(cohort)!;
    return {
      cohort,
      memberCount: current.members.size,
      activeTasks: current.activeTasks,
      overdueTasks: current.overdueTasks,
      completedLast30d: current.completedLast30d,
      staleActiveTasks: current.staleActiveTasks,
      unplannedCompletedLast30d: current.unplannedCompletedLast30d,
    };
  });

  const monthlyRows: MonthlyDecisionExportRow[] = [];
  for (let index = 0; index < config.monthlyWindowMonths; index += 1) {
    const monthStart = addUtcMonths(dataset.monthlyStart, index);
    const monthEnd = addUtcMonths(monthStart, 1);

    const created = dataset.tasks.filter(
      (task) => task.createdAt >= monthStart && task.createdAt < monthEnd
    ).length;
    const completedTasks = dataset.tasks.filter(
      (task) => task.completedOn && task.completedOn >= monthStart && task.completedOn < monthEnd
    );
    const completed = completedTasks.length;
    const unplannedCompleted = completedTasks.filter((task) => task.unplanned).length;
    const overdueCarryover = dataset.tasks.filter(
      (task) =>
        task.dueDate &&
        task.dueDate < monthEnd &&
        (!task.completedOn || task.completedOn >= monthEnd)
    ).length;

    monthlyRows.push({
      month: monthLabel(monthStart),
      created,
      completed,
      netFlow: completed - created,
      overdueCarryover,
      unplannedCompleted,
    });
  }

  const narrativeAnnotations = buildMonthlyNarrative(monthlyRows);
  const monthlyMarkdown = buildMonthlyMarkdown(monthlyRows, narrativeAnnotations);

  const unplannedCompletionRate30d =
    completedLookback.length > 0
      ? round2(completedLookback.filter((task) => task.unplanned).length / completedLookback.length)
      : null;

  return {
    generatedAt: new Date().toISOString(),
    asOf: asOf.toISOString(),
    config,
    eventDefinitions: EVENT_DEFINITIONS,
    northStar: {
      flowReliabilityScore,
      throughput30d: completedLookback.length,
      throughputTrendPct,
      onTimeCompletionRate,
      activeContributors30d,
    },
    supportingMetrics: {
      openTasks: openTasks.length,
      blockedTasks: openTasks.filter((task) => task.status === "NOT_DONE").length,
      overdueOpenTasks: overdueOpenTasks.length,
      staleActiveTasks: staleActiveTasks.length,
      reblockedTaskCount30d,
      wipBreachColumns,
      unplannedCompletionRate30d,
    },
    instrumentation: {
      eventsLast30d:
        (actionCountsByType.get("task.created") ?? 0) + (actionCountsByType.get("task.status_changed") ?? 0),
      actionsByType: Array.from(actionCountsByType.entries())
        .map(([eventKey, count]) => ({ eventKey, count }))
        .sort((a, b) => b.count - a.count),
      frictionSignals: [
        {
          signal: "overdue_open",
          count: overdueOpenTasks.length,
          description: "Open tasks past due date.",
        },
        {
          signal: "reblocked_tasks",
          count: reblockedTaskCount30d,
          description: "Tasks re-entering blocked state 2+ times in 30d.",
        },
        {
          signal: "wip_breach_columns",
          count: wipBreachColumns.length,
          description: "Columns currently exceeding configured WIP limit.",
        },
      ],
    },
    cohorts,
    monthlyExport: {
      windowMonths: config.monthlyWindowMonths,
      rows: monthlyRows,
      narrativeAnnotations,
      markdown: monthlyMarkdown,
    },
    traceability: {
      source: "Task + StatusHistory + BoardSettings + User",
      taskCount: dataset.tasks.length,
      statusEventCount: dataset.statusEvents.length,
      userCount: dataset.users.length,
      taskSampleIds: dataset.tasks.slice(0, 20).map((task) => task.id),
    },
  };
}

export const __private__ = {
  normalizeDecisionDashboardConfig,
  cohortForTask,
  buildMonthlyNarrative,
  buildMonthlyMarkdown,
  computeThroughputTrend,
  monthLabel,
};
