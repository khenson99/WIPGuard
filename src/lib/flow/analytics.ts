import type { TaskStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type FlowInterval = "day" | "week";

const ACTIVE_STATUSES = new Set<TaskStatus>(["WORKING_ON_TODAY", "ACTIVE"]);

interface FlowTaskRecord {
  id: string;
  status: TaskStatus;
  createdAt: Date;
  completedOn: Date | null;
}

interface FlowTransitionRecord {
  id: string;
  taskId: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  changedAt: Date;
}

export interface FlowBucketStatusCounts {
  bucketStart: string;
  bucketEnd: string;
  counts: Record<TaskStatus, number>;
}

export interface FlowThroughputBucket {
  bucketStart: string;
  bucketEnd: string;
  completed: number;
}

export interface FlowDurationStats {
  sampleSize: number;
  unit: "days";
  mean: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
}

export interface FlowDataQualityIssue {
  issue: string;
  count: number;
  sampleTaskIds: string[];
}

export interface FlowDataQualityReport {
  checkedTaskCount: number;
  validTaskCount: number;
  issueCount: number;
  issues: FlowDataQualityIssue[];
}

export interface FlowAnalyticsResult {
  from: string;
  to: string;
  interval: FlowInterval;
  generatedAt: string;
  metricsDefinition: {
    cfd: string;
    throughput: string;
    leadTime: string;
    cycleTime: string;
    dataQuality: string;
  };
  cfd: FlowBucketStatusCounts[];
  throughput: FlowThroughputBucket[];
  leadTime: FlowDurationStats;
  cycleTime: FlowDurationStats;
  dataQuality: FlowDataQualityReport;
  traceability: {
    source: "Task.createdAt + StatusHistory.changedAt + Task.completedOn";
    taskSampleIds: string[];
    transitionSampleIds: string[];
    totalTasks: number;
    totalTransitions: number;
  };
}

interface DurationSample {
  taskId: string;
  leadDays: number | null;
  cycleDays: number | null;
}

function startOfUtcDay(input: Date): Date {
  const date = new Date(input);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function endOfUtcDay(input: Date): Date {
  const date = startOfUtcDay(input);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function startOfUtcWeek(input: Date): Date {
  const date = startOfUtcDay(input);
  const day = date.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysFromMonday);
  return date;
}

function addInterval(date: Date, interval: FlowInterval): Date {
  const next = new Date(date);
  if (interval === "week") {
    next.setUTCDate(next.getUTCDate() + 7);
  } else {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

function floorToInterval(date: Date, interval: FlowInterval): Date {
  return interval === "week" ? startOfUtcWeek(date) : startOfUtcDay(date);
}

function toBucketIso(date: Date): string {
  return date.toISOString().split("T")[0];
}

function initStatusCounts(): Record<TaskStatus, number> {
  return {
    BACKLOG: 0,
    QUEUED: 0,
    WORKING_ON_TODAY: 0,
    ACTIVE: 0,
    NOT_DONE: 0,
    DONE: 0,
  };
}

function percentile(sortedValues: number[], percentilePoint: number): number | null {
  if (sortedValues.length === 0) return null;
  if (sortedValues.length === 1) return sortedValues[0];

  const index = (percentilePoint / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];

  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function round2(value: number | null): number | null {
  if (value === null) return null;
  return Math.round(value * 100) / 100;
}

function durationStats(samples: number[]): FlowDurationStats {
  if (samples.length === 0) {
    return {
      sampleSize: 0,
      unit: "days",
      mean: null,
      p50: null,
      p75: null,
      p90: null,
    };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;

  return {
    sampleSize: sorted.length,
    unit: "days",
    mean: round2(mean),
    p50: round2(percentile(sorted, 50)),
    p75: round2(percentile(sorted, 75)),
    p90: round2(percentile(sorted, 90)),
  };
}

function inferInitialStatus(task: FlowTaskRecord, transitions: FlowTransitionRecord[]): TaskStatus {
  const firstTransition = transitions[0];
  if (firstTransition) {
    return firstTransition.fromStatus ?? firstTransition.toStatus;
  }

  return task.status;
}

function buildTimelineBuckets(from: Date, to: Date, interval: FlowInterval): Date[] {
  const start = floorToInterval(from, interval);
  const end = endOfUtcDay(to);
  const buckets: Date[] = [];

  for (let cursor = new Date(start); cursor < end; cursor = addInterval(cursor, interval)) {
    buckets.push(new Date(cursor));
  }

  return buckets;
}

function buildCfdSeries(input: {
  tasks: FlowTaskRecord[];
  transitionsByTask: Map<string, FlowTransitionRecord[]>;
  from: Date;
  to: Date;
  interval: FlowInterval;
}): FlowBucketStatusCounts[] {
  const buckets = buildTimelineBuckets(input.from, input.to, input.interval);

  const events: Array<{ at: Date; taskId: string; status: TaskStatus }> = [];

  for (const task of input.tasks) {
    const transitions = input.transitionsByTask.get(task.id) ?? [];
    const initialStatus = inferInitialStatus(task, transitions);
    events.push({ at: task.createdAt, taskId: task.id, status: initialStatus });

    for (const transition of transitions) {
      events.push({
        at: transition.changedAt,
        taskId: task.id,
        status: transition.toStatus,
      });
    }
  }

  events.sort((a, b) => a.at.getTime() - b.at.getTime());

  const statusByTask = new Map<string, TaskStatus>();
  let eventCursor = 0;

  const output: FlowBucketStatusCounts[] = [];

  for (const bucketStart of buckets) {
    const bucketEnd = addInterval(bucketStart, input.interval);

    while (eventCursor < events.length && events[eventCursor].at < bucketEnd) {
      const event = events[eventCursor];
      statusByTask.set(event.taskId, event.status);
      eventCursor += 1;
    }

    const counts = initStatusCounts();
    for (const status of statusByTask.values()) {
      counts[status] += 1;
    }

    output.push({
      bucketStart: toBucketIso(bucketStart),
      bucketEnd: toBucketIso(bucketEnd),
      counts,
    });
  }

  return output;
}

function buildThroughputSeries(input: {
  transitions: FlowTransitionRecord[];
  from: Date;
  to: Date;
  interval: FlowInterval;
}): FlowThroughputBucket[] {
  const buckets = buildTimelineBuckets(input.from, input.to, input.interval);
  const throughputByBucket = new Map<string, number>();
  const rangeEndExclusive = endOfUtcDay(input.to);

  for (const transition of input.transitions) {
    if (transition.toStatus !== "DONE") continue;
    if (transition.changedAt < input.from || transition.changedAt >= rangeEndExclusive) {
      continue;
    }

    const bucketStart = floorToInterval(transition.changedAt, input.interval);
    const key = toBucketIso(bucketStart);
    throughputByBucket.set(key, (throughputByBucket.get(key) ?? 0) + 1);
  }

  return buckets.map((bucketStart) => {
    const key = toBucketIso(bucketStart);
    return {
      bucketStart: key,
      bucketEnd: toBucketIso(addInterval(bucketStart, input.interval)),
      completed: throughputByBucket.get(key) ?? 0,
    };
  });
}

function computeDurationSamples(input: {
  tasks: FlowTaskRecord[];
  transitionsByTask: Map<string, FlowTransitionRecord[]>;
  from: Date;
  to: Date;
}): DurationSample[] {
  const samples: DurationSample[] = [];
  const rangeEndExclusive = endOfUtcDay(input.to);

  for (const task of input.tasks) {
    const transitions = input.transitionsByTask.get(task.id) ?? [];

    const doneTransition = transitions.find((transition) => transition.toStatus === "DONE");
    const doneAt = doneTransition?.changedAt ?? task.completedOn;
    if (!doneAt) continue;
    if (doneAt < input.from || doneAt >= rangeEndExclusive) {
      continue;
    }

    const activeTransition = transitions.find((transition) =>
      ACTIVE_STATUSES.has(transition.toStatus)
    );

    const leadDays = (doneAt.getTime() - task.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const cycleDays = activeTransition
      ? (doneAt.getTime() - activeTransition.changedAt.getTime()) / (1000 * 60 * 60 * 24)
      : null;

    samples.push({
      taskId: task.id,
      leadDays: leadDays >= 0 ? leadDays : null,
      cycleDays: cycleDays !== null && cycleDays >= 0 ? cycleDays : null,
    });
  }

  return samples;
}

function evaluateDataQuality(input: {
  tasks: FlowTaskRecord[];
  transitionsByTask: Map<string, FlowTransitionRecord[]>;
}): FlowDataQualityReport {
  type IssueKey =
    | "missing_status_history"
    | "transition_before_task_created"
    | "from_status_mismatch"
    | "done_without_done_transition";

  const issueCounts: Record<IssueKey, number> = {
    missing_status_history: 0,
    transition_before_task_created: 0,
    from_status_mismatch: 0,
    done_without_done_transition: 0,
  };
  const issueSamples: Record<IssueKey, string[]> = {
    missing_status_history: [],
    transition_before_task_created: [],
    from_status_mismatch: [],
    done_without_done_transition: [],
  };

  const invalidTaskIds = new Set<string>();

  const registerIssue = (issue: IssueKey, taskId: string): void => {
    issueCounts[issue] += 1;
    invalidTaskIds.add(taskId);
    if (issueSamples[issue].length < 20 && !issueSamples[issue].includes(taskId)) {
      issueSamples[issue].push(taskId);
    }
  };

  for (const task of input.tasks) {
    const transitions = input.transitionsByTask.get(task.id) ?? [];
    if (transitions.length === 0) {
      registerIssue("missing_status_history", task.id);
    }

    let previousStatus: TaskStatus | null = null;
    let hasDoneTransition = false;

    for (const transition of transitions) {
      if (transition.changedAt < task.createdAt) {
        registerIssue("transition_before_task_created", task.id);
        break;
      }

      if (
        previousStatus !== null &&
        transition.fromStatus !== null &&
        transition.fromStatus !== previousStatus
      ) {
        registerIssue("from_status_mismatch", task.id);
        break;
      }

      previousStatus = transition.toStatus;
      if (transition.toStatus === "DONE") {
        hasDoneTransition = true;
      }
    }

    if (task.status === "DONE" && !hasDoneTransition && !task.completedOn) {
      registerIssue("done_without_done_transition", task.id);
    }
  }

  const issues: FlowDataQualityIssue[] = Object.entries(issueSamples)
    .map(([issue, sampleTaskIds]) => ({
      issue,
      count: issueCounts[issue as IssueKey],
      sampleTaskIds,
    }))
    .filter((issue) => issue.count > 0);

  const issueCount = issues.reduce((sum, issue) => sum + issue.count, 0);
  const validTaskCount = Math.max(0, input.tasks.length - invalidTaskIds.size);

  return {
    checkedTaskCount: input.tasks.length,
    validTaskCount,
    issueCount,
    issues,
  };
}

async function fetchFlowDataset(input: { from: Date; to: Date }): Promise<{
  tasks: FlowTaskRecord[];
  transitions: FlowTransitionRecord[];
  transitionsByTask: Map<string, FlowTransitionRecord[]>;
}> {
  const rangeEndExclusive = endOfUtcDay(input.to);
  const tasks = await prisma.task.findMany({
    where: {
      createdAt: { lt: rangeEndExclusive },
      OR: [{ completedOn: null }, { completedOn: { gte: input.from } }],
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
      completedOn: true,
    },
  });

  if (tasks.length === 0) {
    return {
      tasks: [],
      transitions: [],
      transitionsByTask: new Map(),
    };
  }

  const transitions = await prisma.statusHistory.findMany({
    where: {
      taskId: {
        in: tasks.map((task) => task.id),
      },
      changedAt: {
        lt: rangeEndExclusive,
      },
    },
    select: {
      id: true,
      taskId: true,
      fromStatus: true,
      toStatus: true,
      changedAt: true,
    },
    orderBy: [{ changedAt: "asc" }, { id: "asc" }],
  });

  const transitionsByTask = new Map<string, FlowTransitionRecord[]>();
  for (const transition of transitions) {
    const existing = transitionsByTask.get(transition.taskId) ?? [];
    existing.push(transition);
    transitionsByTask.set(transition.taskId, existing);
  }

  return {
    tasks,
    transitions,
    transitionsByTask,
  };
}

export async function computeFlowAnalytics(input: {
  from: Date;
  to: Date;
  interval: FlowInterval;
}): Promise<FlowAnalyticsResult> {
  const dataset = await fetchFlowDataset({ from: input.from, to: input.to });

  const cfd = buildCfdSeries({
    tasks: dataset.tasks,
    transitionsByTask: dataset.transitionsByTask,
    from: input.from,
    to: input.to,
    interval: input.interval,
  });

  const throughput = buildThroughputSeries({
    transitions: dataset.transitions,
    from: input.from,
    to: input.to,
    interval: input.interval,
  });

  const durationSamples = computeDurationSamples({
    tasks: dataset.tasks,
    transitionsByTask: dataset.transitionsByTask,
    from: input.from,
    to: input.to,
  });

  const leadTime = durationStats(
    durationSamples
      .map((sample) => sample.leadDays)
      .filter((value): value is number => value !== null)
  );
  const cycleTime = durationStats(
    durationSamples
      .map((sample) => sample.cycleDays)
      .filter((value): value is number => value !== null)
  );

  const dataQuality = evaluateDataQuality({
    tasks: dataset.tasks,
    transitionsByTask: dataset.transitionsByTask,
  });

  return {
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    interval: input.interval,
    generatedAt: new Date().toISOString(),
    metricsDefinition: {
      cfd: "Cumulative Flow Diagram counts tasks by status at the end of each interval bucket.",
      throughput:
        "Throughput counts DONE transitions per interval bucket from status history events.",
      leadTime:
        "Lead time measures days from task.createdAt to first DONE transition (or completedOn fallback).",
      cycleTime:
        "Cycle time measures days from first ACTIVE/WORKING_ON_TODAY transition to first DONE transition.",
      dataQuality:
        "Validation scans for missing histories, timestamp anomalies, and transition-chain inconsistencies.",
    },
    cfd,
    throughput,
    leadTime,
    cycleTime,
    dataQuality,
    traceability: {
      source: "Task.createdAt + StatusHistory.changedAt + Task.completedOn",
      taskSampleIds: dataset.tasks.slice(0, 20).map((task) => task.id),
      transitionSampleIds: dataset.transitions.slice(0, 40).map((transition) => transition.id),
      totalTasks: dataset.tasks.length,
      totalTransitions: dataset.transitions.length,
    },
  };
}

export const __private__ = {
  percentile,
  durationStats,
  buildCfdSeries,
  buildThroughputSeries,
  evaluateDataQuality,
};
