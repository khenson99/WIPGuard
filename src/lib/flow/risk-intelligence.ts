import type { TaskStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
const WIP_STATUSES = new Set<TaskStatus>(["QUEUED", "WORKING_ON_TODAY", "ACTIVE", "NOT_DONE"]);

export interface FlowRiskConfig {
  personWipLimit: number;
  staleTaskDays: number;
  blockerLookbackDays: number;
  chronicBlockerThreshold: number;
  fixedDateLookaheadDays: number;
  staleDependencyDays: number;
  riskAlertMinScore: number;
  maxRecommendations: number;
}

interface FlowRiskTaskRecord {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  project: {
    id: string;
    name: string;
  } | null;
  responsible: Array<{
    id: string;
    name: string | null;
    email: string;
  }>;
  dependsOn: Array<{
    id: string;
    title: string;
    status: TaskStatus;
    dueDate: Date | null;
    updatedAt: Date;
  }>;
  dependedBy: Array<{
    id: string;
    title: string;
    status: TaskStatus;
  }>;
}

interface FlowRiskStatusEvent {
  taskId: string;
  toStatus: TaskStatus;
  changedAt: Date;
}

interface FlowRiskDataset {
  tasks: FlowRiskTaskRecord[];
  blockerEvents: FlowRiskStatusEvent[];
  boardSettings: Array<{
    columnName: string;
    wipLimit: number;
  }>;
}

export interface PersonWipPressure {
  userId: string;
  name: string | null;
  email: string | null;
  activeTaskCount: number;
  wipLimit: number;
  pressureRatio: number;
  pressureScore: number;
  overloaded: boolean;
  topTaskIds: string[];
}

export interface ColumnWipPressure {
  columnName: TaskStatus;
  activeTaskCount: number;
  wipLimit: number | null;
  pressureRatio: number | null;
  pressureScore: number;
  overloaded: boolean;
}

export interface ChronicBlockerSignal {
  taskId: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  blockerTransitions: number;
  lastBlockedAt: string | null;
  reasons: string[];
}

export interface StaleDependencySignal {
  taskId: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  blockedByTaskIds: string[];
  staleDependencyCount: number;
  maxDependencyStaleDays: number;
  urgencyScore: number;
  reasons: string[];
}

export interface FixedDateRiskAlert {
  taskId: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  dueDate: string;
  daysToDue: number;
  riskScore: number;
  severity: "low" | "medium" | "high" | "critical";
  reasons: string[];
}

export interface FlowRiskRecommendation {
  id: string;
  type:
    | "descope_owner_wip"
    | "split_chronic_blocker"
    | "escalate_dependency_chain"
    | "protect_fixed_date";
  severity: "medium" | "high" | "critical";
  title: string;
  rationale: string;
  targetTaskIds: string[];
  suggestedActions: string[];
}

export interface FlowRiskSlippageCorrelation {
  sampleSize: number;
  coefficient: number | null;
  highRiskOverdueRate: number | null;
  baselineOverdueRate: number | null;
  interpretation: string;
}

export interface FlowRiskIntelligenceReport {
  generatedAt: string;
  asOf: string;
  config: FlowRiskConfig;
  wipPressure: {
    people: PersonWipPressure[];
    columns: ColumnWipPressure[];
  };
  chronicBlockers: ChronicBlockerSignal[];
  staleDependencyChains: StaleDependencySignal[];
  fixedDateAlerts: FixedDateRiskAlert[];
  recommendations: FlowRiskRecommendation[];
  slippageCorrelation: FlowRiskSlippageCorrelation;
  traceability: {
    source: "Task + Task.dependsOn + Task.responsible + StatusHistory + BoardSettings";
    taskCount: number;
    blockerEventCount: number;
    boardSettingCount: number;
    taskSampleIds: string[];
  };
}

export function defaultFlowRiskConfig(): FlowRiskConfig {
  return {
    personWipLimit: 2,
    staleTaskDays: 5,
    blockerLookbackDays: 30,
    chronicBlockerThreshold: 2,
    fixedDateLookaheadDays: 14,
    staleDependencyDays: 5,
    riskAlertMinScore: 45,
    maxRecommendations: 12,
  };
}

function toIntegerInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export function normalizeFlowRiskConfig(raw?: Partial<FlowRiskConfig>): FlowRiskConfig {
  const fallback = defaultFlowRiskConfig();
  if (!raw) return fallback;

  return {
    personWipLimit: toIntegerInRange(raw.personWipLimit, fallback.personWipLimit, 1, 12),
    staleTaskDays: toIntegerInRange(raw.staleTaskDays, fallback.staleTaskDays, 1, 60),
    blockerLookbackDays: toIntegerInRange(raw.blockerLookbackDays, fallback.blockerLookbackDays, 7, 120),
    chronicBlockerThreshold: toIntegerInRange(
      raw.chronicBlockerThreshold,
      fallback.chronicBlockerThreshold,
      2,
      12
    ),
    fixedDateLookaheadDays: toIntegerInRange(
      raw.fixedDateLookaheadDays,
      fallback.fixedDateLookaheadDays,
      1,
      60
    ),
    staleDependencyDays: toIntegerInRange(raw.staleDependencyDays, fallback.staleDependencyDays, 1, 60),
    riskAlertMinScore: toIntegerInRange(raw.riskAlertMinScore, fallback.riskAlertMinScore, 10, 95),
    maxRecommendations: toIntegerInRange(raw.maxRecommendations, fallback.maxRecommendations, 3, 30),
  };
}

function asDayDiff(now: Date, from: Date): number {
  return Math.floor((now.getTime() - from.getTime()) / DAY_MS);
}

function daysToDue(now: Date, dueDate: Date): number {
  return Math.ceil((dueDate.getTime() - now.getTime()) / DAY_MS);
}

function toSeverity(score: number): "low" | "medium" | "high" | "critical" {
  if (score >= 85) return "critical";
  if (score >= 70) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function computePersonWipPressure(input: {
  tasks: FlowRiskTaskRecord[];
  config: FlowRiskConfig;
}): PersonWipPressure[] {
  const owners = new Map<string, PersonWipPressure>();

  for (const task of input.tasks) {
    if (!WIP_STATUSES.has(task.status)) continue;

    if (task.responsible.length === 0) {
      const current = owners.get("unassigned") ?? {
        userId: "unassigned",
        name: "Unassigned",
        email: null,
        activeTaskCount: 0,
        wipLimit: input.config.personWipLimit,
        pressureRatio: 0,
        pressureScore: 0,
        overloaded: false,
        topTaskIds: [],
      };
      current.activeTaskCount += 1;
      if (current.topTaskIds.length < 5) {
        current.topTaskIds.push(task.id);
      }
      owners.set("unassigned", current);
      continue;
    }

    for (const owner of task.responsible) {
      const current = owners.get(owner.id) ?? {
        userId: owner.id,
        name: owner.name,
        email: owner.email,
        activeTaskCount: 0,
        wipLimit: input.config.personWipLimit,
        pressureRatio: 0,
        pressureScore: 0,
        overloaded: false,
        topTaskIds: [],
      };
      current.activeTaskCount += 1;
      if (current.topTaskIds.length < 5) {
        current.topTaskIds.push(task.id);
      }
      owners.set(owner.id, current);
    }
  }

  const report = Array.from(owners.values()).map((owner) => {
    const pressureRatio = owner.activeTaskCount / owner.wipLimit;
    return {
      ...owner,
      pressureRatio: round2(pressureRatio),
      pressureScore: round2(Math.min(200, pressureRatio * 100)),
      overloaded: owner.activeTaskCount > owner.wipLimit,
    };
  });

  report.sort((a, b) => b.pressureScore - a.pressureScore);
  return report;
}

function computeColumnWipPressure(input: {
  tasks: FlowRiskTaskRecord[];
  boardSettings: FlowRiskDataset["boardSettings"];
}): ColumnWipPressure[] {
  const statusCounts: Record<TaskStatus, number> = {
    BACKLOG: 0,
    QUEUED: 0,
    WORKING_ON_TODAY: 0,
    ACTIVE: 0,
    NOT_DONE: 0,
    DONE: 0,
  };

  for (const task of input.tasks) {
    statusCounts[task.status] += 1;
  }

  const wipLimits = new Map<string, number>();
  for (const setting of input.boardSettings) {
    wipLimits.set(setting.columnName, setting.wipLimit);
  }

  const statuses: TaskStatus[] = [
    "BACKLOG",
    "QUEUED",
    "WORKING_ON_TODAY",
    "ACTIVE",
    "NOT_DONE",
    "DONE",
  ];

  return statuses.map((status) => {
    const activeTaskCount = statusCounts[status];
    const configuredLimit = wipLimits.get(status) ?? 0;
    const wipLimit = configuredLimit > 0 ? configuredLimit : null;
    const pressureRatio = wipLimit ? activeTaskCount / wipLimit : null;
    const pressureScore = pressureRatio === null ? 0 : round2(Math.min(200, pressureRatio * 100));
    const overloaded = pressureRatio !== null && pressureRatio > 1;

    return {
      columnName: status,
      activeTaskCount,
      wipLimit,
      pressureRatio: pressureRatio === null ? null : round2(pressureRatio),
      pressureScore,
      overloaded,
    };
  });
}

function computeChronicBlockers(input: {
  tasks: FlowRiskTaskRecord[];
  blockerEvents: FlowRiskStatusEvent[];
  config: FlowRiskConfig;
}): ChronicBlockerSignal[] {
  const byTask = new Map<string, FlowRiskStatusEvent[]>();
  for (const event of input.blockerEvents) {
    if (event.toStatus !== "NOT_DONE") continue;
    const list = byTask.get(event.taskId) ?? [];
    list.push(event);
    byTask.set(event.taskId, list);
  }

  const report: ChronicBlockerSignal[] = [];
  for (const task of input.tasks) {
    if (task.status === "DONE") continue;
    const events = byTask.get(task.id) ?? [];
    if (events.length < input.config.chronicBlockerThreshold) continue;

    events.sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime());
    const latest = events[0];
    const reasons = [
      `${events.length} blocker transition(s) in the last ${input.config.blockerLookbackDays} day(s).`,
      `Task currently in ${task.status}.`,
    ];

    report.push({
      taskId: task.id,
      title: task.title,
      projectId: task.project?.id ?? null,
      projectName: task.project?.name ?? null,
      blockerTransitions: events.length,
      lastBlockedAt: latest ? latest.changedAt.toISOString() : null,
      reasons,
    });
  }

  report.sort((a, b) => b.blockerTransitions - a.blockerTransitions);
  return report;
}

function computeStaleDependencyChains(input: {
  tasks: FlowRiskTaskRecord[];
  asOf: Date;
  config: FlowRiskConfig;
}): StaleDependencySignal[] {
  const report: StaleDependencySignal[] = [];

  for (const task of input.tasks) {
    if (task.status === "DONE" || task.dependsOn.length === 0) continue;

    const staleDependencies: Array<{
      id: string;
      staleDays: number;
      overdueDays: number;
      title: string;
    }> = [];

    for (const dependency of task.dependsOn) {
      if (dependency.status === "DONE") continue;
      const staleDays = asDayDiff(input.asOf, dependency.updatedAt);
      const overdueDays = dependency.dueDate ? Math.max(0, -daysToDue(input.asOf, dependency.dueDate)) : 0;
      if (staleDays >= input.config.staleDependencyDays || overdueDays > 0) {
        staleDependencies.push({
          id: dependency.id,
          title: dependency.title,
          staleDays,
          overdueDays,
        });
      }
    }

    if (staleDependencies.length === 0) continue;

    const maxDependencyStaleDays = staleDependencies.reduce(
      (max, dependency) => Math.max(max, dependency.staleDays),
      0
    );
    const totalOverdueDeps = staleDependencies.filter((dependency) => dependency.overdueDays > 0).length;
    const urgencyScore = Math.min(
      100,
      20 + staleDependencies.length * 15 + maxDependencyStaleDays * 2 + totalOverdueDeps * 10
    );

    const reasons = [
      `${staleDependencies.length} dependency task(s) are stale or overdue.`,
      `Oldest dependency has been idle for ${maxDependencyStaleDays} day(s).`,
      totalOverdueDeps > 0 ? `${totalOverdueDeps} dependency task(s) are overdue.` : null,
    ].filter((reason): reason is string => reason !== null);

    report.push({
      taskId: task.id,
      title: task.title,
      projectId: task.project?.id ?? null,
      projectName: task.project?.name ?? null,
      blockedByTaskIds: staleDependencies.map((dependency) => dependency.id),
      staleDependencyCount: staleDependencies.length,
      maxDependencyStaleDays,
      urgencyScore: round2(urgencyScore),
      reasons,
    });
  }

  report.sort((a, b) => b.urgencyScore - a.urgencyScore);
  return report;
}

function computeFixedDateAlerts(input: {
  tasks: FlowRiskTaskRecord[];
  asOf: Date;
  config: FlowRiskConfig;
  personPressure: PersonWipPressure[];
  staleDependencies: StaleDependencySignal[];
}): FixedDateRiskAlert[] {
  const ownerOverload = new Set(
    input.personPressure.filter((owner) => owner.overloaded).map((owner) => owner.userId)
  );
  const staleDependencyTaskIds = new Set(input.staleDependencies.map((item) => item.taskId));
  const lookaheadBoundary = new Date(input.asOf.getTime() + input.config.fixedDateLookaheadDays * DAY_MS);

  const alerts: FixedDateRiskAlert[] = [];

  for (const task of input.tasks) {
    if (task.status === "DONE" || !task.dueDate) continue;
    if (task.dueDate > lookaheadBoundary) continue;

    const dueInDays = daysToDue(input.asOf, task.dueDate);
    const overdueDays = Math.max(0, -dueInDays);
    const idleDays = asDayDiff(input.asOf, task.updatedAt);
    const ownerOverloaded =
      task.responsible.length > 0 && task.responsible.some((owner) => ownerOverload.has(owner.id));
    const staleDependencies = staleDependencyTaskIds.has(task.id);
    const notStarted = task.status === "BACKLOG" || task.status === "QUEUED";
    const staleTask = idleDays >= input.config.staleTaskDays;

    let riskScore = 0;
    const reasons: string[] = [];

    if (overdueDays > 0) {
      riskScore += 50 + Math.min(30, overdueDays * 4);
      reasons.push(`Overdue by ${overdueDays} day(s).`);
    } else if (dueInDays <= 2) {
      riskScore += 28;
      reasons.push(`Due in ${dueInDays} day(s).`);
    } else if (dueInDays <= 7) {
      riskScore += 18;
      reasons.push(`Due in ${dueInDays} day(s) within near-term window.`);
    } else {
      riskScore += 8;
      reasons.push(`Inside ${input.config.fixedDateLookaheadDays}-day lookahead window.`);
    }

    if (notStarted) {
      riskScore += 18;
      reasons.push(`Status ${task.status} indicates limited execution progress.`);
    }

    if (staleDependencies) {
      riskScore += 20;
      reasons.push("Blocked by stale or overdue dependency chain.");
    }

    if (staleTask) {
      riskScore += 12;
      reasons.push(`Task has been idle for ${idleDays} day(s).`);
    }

    if (ownerOverloaded) {
      riskScore += 12;
      reasons.push("Primary owner is over WIP limit.");
    }

    riskScore = Math.min(100, riskScore);
    if (riskScore < input.config.riskAlertMinScore) continue;

    alerts.push({
      taskId: task.id,
      title: task.title,
      projectId: task.project?.id ?? null,
      projectName: task.project?.name ?? null,
      dueDate: task.dueDate.toISOString(),
      daysToDue: dueInDays,
      riskScore: round2(riskScore),
      severity: toSeverity(riskScore),
      reasons,
    });
  }

  alerts.sort((a, b) => b.riskScore - a.riskScore);
  return alerts;
}

function buildRecommendations(input: {
  personPressure: PersonWipPressure[];
  chronicBlockers: ChronicBlockerSignal[];
  staleDependencies: StaleDependencySignal[];
  fixedDateAlerts: FixedDateRiskAlert[];
  config: FlowRiskConfig;
}): FlowRiskRecommendation[] {
  const recommendations: FlowRiskRecommendation[] = [];

  for (const owner of input.personPressure) {
    if (!owner.overloaded) continue;
    const excess = owner.activeTaskCount - owner.wipLimit;
    recommendations.push({
      id: `descope_owner_wip:${owner.userId}`,
      type: "descope_owner_wip",
      severity: owner.pressureScore >= 150 ? "critical" : "high",
      title: `Reduce WIP load for ${owner.name ?? owner.email ?? owner.userId}`,
      rationale: `${owner.activeTaskCount} active task(s) exceed limit ${owner.wipLimit} by ${excess}.`,
      targetTaskIds: owner.topTaskIds,
      suggestedActions: [
        "Move 1-2 non-critical tasks back to QUEUED.",
        "Reassign low-urgency execution tasks to balance load.",
        "Protect due-date tasks by narrowing active scope.",
      ],
    });
  }

  for (const blocker of input.chronicBlockers.slice(0, 4)) {
    recommendations.push({
      id: `split_chronic_blocker:${blocker.taskId}`,
      type: "split_chronic_blocker",
      severity: blocker.blockerTransitions >= 4 ? "critical" : "high",
      title: `Break down chronic blocker: ${blocker.title}`,
      rationale: blocker.reasons.join(" "),
      targetTaskIds: [blocker.taskId],
      suggestedActions: [
        "Split the task into smaller unblockable steps.",
        "Assign a clear owner for next unblock action.",
        "Schedule a same-day decision to remove ambiguity.",
      ],
    });
  }

  for (const chain of input.staleDependencies.slice(0, 4)) {
    recommendations.push({
      id: `escalate_dependency_chain:${chain.taskId}`,
      type: "escalate_dependency_chain",
      severity: chain.urgencyScore >= 80 ? "critical" : "high",
      title: `Escalate dependency chain on ${chain.title}`,
      rationale: chain.reasons.join(" "),
      targetTaskIds: [chain.taskId, ...chain.blockedByTaskIds],
      suggestedActions: [
        "Escalate the oldest dependency to a same-day decision owner.",
        "Temporarily de-scope blocked deliverables from this week.",
        "Convert hidden dependencies into explicit task links.",
      ],
    });
  }

  for (const alert of input.fixedDateAlerts.slice(0, 4)) {
    recommendations.push({
      id: `protect_fixed_date:${alert.taskId}`,
      type: "protect_fixed_date",
      severity: alert.severity === "critical" ? "critical" : "high",
      title: `Protect fixed-date delivery: ${alert.title}`,
      rationale: alert.reasons.join(" "),
      targetTaskIds: [alert.taskId],
      suggestedActions: [
        "Reduce scope to minimum shippable outcome.",
        "Add explicit daily unblock checkpoint until complete.",
        "Escalate deadline risk to leadership with mitigation options.",
      ],
    });
  }

  const severityRank = { critical: 3, high: 2, medium: 1 };
  recommendations.sort((a, b) => {
    const severityDelta = severityRank[b.severity] - severityRank[a.severity];
    if (severityDelta !== 0) return severityDelta;
    return a.title.localeCompare(b.title);
  });

  const deduped = new Map<string, FlowRiskRecommendation>();
  for (const recommendation of recommendations) {
    deduped.set(recommendation.id, recommendation);
  }

  return Array.from(deduped.values()).slice(0, input.config.maxRecommendations);
}

function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length < 2 || ys.length < 2 || xs.length !== ys.length) return null;
  const n = xs.length;
  const avgX = xs.reduce((sum, value) => sum + value, 0) / n;
  const avgY = ys.reduce((sum, value) => sum + value, 0) / n;

  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (let index = 0; index < n; index += 1) {
    const dx = xs[index] - avgX;
    const dy = ys[index] - avgY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }

  if (varianceX === 0 || varianceY === 0) return null;
  return covariance / Math.sqrt(varianceX * varianceY);
}

function computeSlippageCorrelation(alerts: FixedDateRiskAlert[]): FlowRiskSlippageCorrelation {
  if (alerts.length === 0) {
    return {
      sampleSize: 0,
      coefficient: null,
      highRiskOverdueRate: null,
      baselineOverdueRate: null,
      interpretation: "No fixed-date tasks in analysis window.",
    };
  }

  const scores = alerts.map((alert) => alert.riskScore);
  const slippage = alerts.map((alert) => Math.max(0, -alert.daysToDue));
  const coefficient = pearsonCorrelation(scores, slippage);

  const highRisk = alerts.filter((alert) => alert.riskScore >= 70);
  const highRiskOverdue = highRisk.filter((alert) => alert.daysToDue < 0).length;
  const overdueAll = alerts.filter((alert) => alert.daysToDue < 0).length;

  const highRiskOverdueRate = highRisk.length > 0 ? highRiskOverdue / highRisk.length : null;
  const baselineOverdueRate = alerts.length > 0 ? overdueAll / alerts.length : null;

  let interpretation = "Risk signals are directionally aligned with deadline slippage.";
  if (coefficient === null) {
    interpretation = "Insufficient variance to measure correlation.";
  } else if (coefficient < 0.15) {
    interpretation = "Weak correlation. Tune thresholds before relying on alerts.";
  } else if (coefficient >= 0.5) {
    interpretation = "Strong correlation. Current risk scoring tracks slippage well.";
  }

  return {
    sampleSize: alerts.length,
    coefficient: coefficient === null ? null : round2(coefficient),
    highRiskOverdueRate: highRiskOverdueRate === null ? null : round2(highRiskOverdueRate),
    baselineOverdueRate: baselineOverdueRate === null ? null : round2(baselineOverdueRate),
    interpretation,
  };
}

async function fetchFlowRiskDataset(input: {
  asOf: Date;
  config: FlowRiskConfig;
}): Promise<FlowRiskDataset> {
  const blockerLookbackStart = new Date(input.asOf.getTime() - input.config.blockerLookbackDays * DAY_MS);

  const [tasks, blockerEvents, boardSettings] = await Promise.all([
    prisma.task.findMany({
      where: {
        status: { in: ["BACKLOG", "QUEUED", "WORKING_ON_TODAY", "ACTIVE", "NOT_DONE"] },
      },
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        responsible: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        dependsOn: {
          select: {
            id: true,
            title: true,
            status: true,
            dueDate: true,
            updatedAt: true,
          },
        },
        dependedBy: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    }),
    prisma.statusHistory.findMany({
      where: {
        toStatus: "NOT_DONE",
        changedAt: { gte: blockerLookbackStart, lte: input.asOf },
      },
      select: {
        taskId: true,
        toStatus: true,
        changedAt: true,
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
    tasks,
    blockerEvents,
    boardSettings,
  };
}

export async function computeFlowRiskIntelligence(input: {
  asOf?: Date;
  config?: Partial<FlowRiskConfig>;
}): Promise<FlowRiskIntelligenceReport> {
  const asOf = input.asOf ?? new Date();
  const config = normalizeFlowRiskConfig(input.config);
  const dataset = await fetchFlowRiskDataset({
    asOf,
    config,
  });

  const personPressure = computePersonWipPressure({
    tasks: dataset.tasks,
    config,
  });
  const columnPressure = computeColumnWipPressure({
    tasks: dataset.tasks,
    boardSettings: dataset.boardSettings,
  });
  const chronicBlockers = computeChronicBlockers({
    tasks: dataset.tasks,
    blockerEvents: dataset.blockerEvents,
    config,
  });
  const staleDependencyChains = computeStaleDependencyChains({
    tasks: dataset.tasks,
    asOf,
    config,
  });
  const fixedDateAlerts = computeFixedDateAlerts({
    tasks: dataset.tasks,
    asOf,
    config,
    personPressure,
    staleDependencies: staleDependencyChains,
  });
  const recommendations = buildRecommendations({
    personPressure,
    chronicBlockers,
    staleDependencies: staleDependencyChains,
    fixedDateAlerts,
    config,
  });
  const slippageCorrelation = computeSlippageCorrelation(fixedDateAlerts);

  return {
    generatedAt: new Date().toISOString(),
    asOf: asOf.toISOString(),
    config,
    wipPressure: {
      people: personPressure,
      columns: columnPressure,
    },
    chronicBlockers,
    staleDependencyChains,
    fixedDateAlerts,
    recommendations,
    slippageCorrelation,
    traceability: {
      source: "Task + Task.dependsOn + Task.responsible + StatusHistory + BoardSettings",
      taskCount: dataset.tasks.length,
      blockerEventCount: dataset.blockerEvents.length,
      boardSettingCount: dataset.boardSettings.length,
      taskSampleIds: dataset.tasks.slice(0, 20).map((task) => task.id),
    },
  };
}

export const __private__ = {
  computePersonWipPressure,
  computeColumnWipPressure,
  computeChronicBlockers,
  computeStaleDependencyChains,
  computeFixedDateAlerts,
  buildRecommendations,
  computeSlippageCorrelation,
  pearsonCorrelation,
  normalizeFlowRiskConfig,
  daysToDue,
  asDayDiff,
};
