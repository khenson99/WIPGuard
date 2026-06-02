import type { ConferenceLeadStatus } from "@/generated/prisma/client";

export interface ConferenceSummary {
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
  deadlines: Array<{ dueAt: Date; completedAt: Date | null }>;
  budgetLineItems: Array<{ plannedAmount: number }>;
  expenses: Array<{ amount: number }>;
  leads: Array<{ status: ConferenceLeadStatus; pushedToHubspotAt: Date | null }>;
}): ConferenceSummary {
  const now = input.now ?? new Date();

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
  for (const lead of input.leads) {
    byStatus[lead.status] = (byStatus[lead.status] ?? 0) + 1;
    if (lead.pushedToHubspotAt) pushedCount += 1;
  }

  return {
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
      byStatus,
    },
    timing: {
      daysUntilStart: daysBetweenUtc(input.startDate, now),
      daysSinceEnd: daysBetweenUtc(now, input.endDate),
    },
  };
}
