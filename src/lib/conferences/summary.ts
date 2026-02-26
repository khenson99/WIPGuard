import type { ConferenceLeadStatus, TaskStatus } from "@/generated/prisma/client";

export interface ConferenceSummary {
  tasks: {
    total: number;
    done: number;
    overdue: number;
  };
  deadlines: {
    total: number;
    completed: number;
    overdue: number;
    nextDueAt: string | null;
  };
  costs: {
    plannedTotal: number;
    actualTotal: number;
    variance: number;
  };
  leads: {
    total: number;
    pushedCount: number;
    followupOpenCount: number;
    byStatus: Record<ConferenceLeadStatus, number>;
  };
  timing: {
    daysUntilStart: number;
    daysSinceEnd: number;
  };
}

function daysBetweenUtc(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime();
  return Math.trunc(ms / 86_400_000);
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function computeConferenceSummary(input: {
  now?: Date;
  startDate: Date;
  endDate: Date;
  tasks: Array<{ status: TaskStatus; dueDate: Date | null }>;
  deadlines: Array<{ dueAt: Date; completedAt: Date | null }>;
  budgetLineItems: Array<{ plannedAmount: number }>;
  expenses: Array<{ amount: number }>;
  leads: Array<{ status: ConferenceLeadStatus; pushedToHubspotAt: Date | null; followupTaskId: string | null }>;
  followupTasksById: Record<string, { status: TaskStatus } | undefined>;
}): ConferenceSummary {
  const now = input.now ?? new Date();

  const taskTotal = input.tasks.length;
  let taskDone = 0;
  let taskOverdue = 0;
  for (const task of input.tasks) {
    if (task.status === "DONE") taskDone += 1;
    if (task.dueDate && task.status !== "DONE" && task.dueDate.getTime() < now.getTime()) {
      taskOverdue += 1;
    }
  }

  const deadlineTotal = input.deadlines.length;
  let deadlineCompleted = 0;
  let deadlineOverdue = 0;
  let nextDueAt: Date | null = null;
  for (const deadline of input.deadlines) {
    if (deadline.completedAt) {
      deadlineCompleted += 1;
      continue;
    }
    if (deadline.dueAt.getTime() < now.getTime()) {
      deadlineOverdue += 1;
    }
    if (!nextDueAt || deadline.dueAt.getTime() < nextDueAt.getTime()) {
      nextDueAt = deadline.dueAt;
    }
  }

  const plannedTotal = input.budgetLineItems.reduce((sum, item) => sum + asNumber(item.plannedAmount), 0);
  const actualTotal = input.expenses.reduce((sum, item) => sum + asNumber(item.amount), 0);
  const variance = actualTotal - plannedTotal;

  const byStatus: ConferenceSummary["leads"]["byStatus"] = {
    NEW: 0,
    QUALIFIED: 0,
    FOLLOW_UP_SCHEDULED: 0,
    CONTACTED: 0,
    CONVERTED: 0,
    DISQUALIFIED: 0,
  };
  let pushedCount = 0;
  let followupOpenCount = 0;
  for (const lead of input.leads) {
    byStatus[lead.status] = (byStatus[lead.status] ?? 0) + 1;
    if (lead.pushedToHubspotAt) pushedCount += 1;
    if (lead.followupTaskId) {
      const followup = input.followupTasksById[lead.followupTaskId];
      if (followup && followup.status !== "DONE") {
        followupOpenCount += 1;
      }
    }
  }

  return {
    tasks: { total: taskTotal, done: taskDone, overdue: taskOverdue },
    deadlines: {
      total: deadlineTotal,
      completed: deadlineCompleted,
      overdue: deadlineOverdue,
      nextDueAt: nextDueAt ? nextDueAt.toISOString() : null,
    },
    costs: { plannedTotal, actualTotal, variance },
    leads: {
      total: input.leads.length,
      pushedCount,
      followupOpenCount,
      byStatus,
    },
    timing: {
      daysUntilStart: daysBetweenUtc(input.startDate, now),
      daysSinceEnd: daysBetweenUtc(now, input.endDate),
    },
  };
}

