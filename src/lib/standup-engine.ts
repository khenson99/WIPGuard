// ---------------------------------------------------------------------------
// Standup Cockpit Engine  (WGX-012)
// Pure functions for standup grouping, blocker detection, coaching prompts,
// metrics, and Slack formatting.  Zero side-effects.
// ---------------------------------------------------------------------------

// ---- Types ----------------------------------------------------------------

export type StandupAction = "started" | "completed" | "skipped";

export interface TeamMember {
  id: string;
  name: string;
  avatarUrl?: string;
}

export type TaskPriority = "urgent" | "high" | "medium" | "low";

export interface TaskSummary {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "blocked" | "done" | "deferred";
  ownerId: string;
  priority: TaskPriority;
  blockedReason?: string;
  /** ISO-8601 date string when the task entered its current status */
  statusChangedAt?: string;
  /** Number of days the task has been in-progress (computed externally) */
  ageDays?: number;
}

export interface WipLimits {
  /** Max tasks a single member should have in-progress */
  perMember: number;
  /** Max tasks the whole team should have in-progress */
  team: number;
}

export interface CoachingPrompt {
  type: "finish_first" | "wip_exceeded" | "aging_task" | "blocked_too_long";
  severity: "info" | "warning" | "critical";
  message: string;
  targetMemberId?: string;
  targetTaskId?: string;
  suggestedActions: SuggestedAction[];
}

export type SuggestedActionKind = "unblock" | "defer" | "split" | "pair" | "drop";

export interface SuggestedAction {
  kind: SuggestedActionKind;
  label: string;
  taskId: string;
}

export interface StandupMetrics {
  totalDurationSeconds: number;
  memberCount: number;
  avgSecondsPerMember: number;
  blockerCount: number;
  tasksDiscussed: number;
  coachingPromptsShown: number;
}

export interface OwnerGroup {
  member: TeamMember;
  tasks: TaskSummary[];
  inProgressCount: number;
  blockedCount: number;
  action: StandupAction;
}

export interface CoachingConfig {
  wipLimits: WipLimits;
  /** Days after which an in-progress task is considered "aging" */
  agingThresholdDays: number;
  /** Days after which a blocker is considered "stuck too long" */
  blockedThresholdDays: number;
}

// Default coaching configuration
export const DEFAULT_COACHING_CONFIG: CoachingConfig = {
  wipLimits: { perMember: 3, team: 12 },
  agingThresholdDays: 5,
  blockedThresholdDays: 2,
};

// ---- Helpers ---------------------------------------------------------------

function daysBetween(from: string | Date, to: Date): number {
  const start = typeof from === "string" ? new Date(from) : from;
  const diffMs = to.getTime() - start.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

// ---- Core Functions -------------------------------------------------------

/**
 * Group tasks by owner (TeamMember).  Unassigned tasks get grouped under a
 * synthetic "Unassigned" member.
 */
export function groupTasksByOwner(
  tasks: TaskSummary[],
  members: TeamMember[],
): OwnerGroup[] {
  const memberMap = new Map<string, TeamMember>(members.map((m) => [m.id, m]));

  const groups = new Map<string, TaskSummary[]>();

  for (const task of tasks) {
    const key = task.ownerId || "__unassigned__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(task);
  }

  const result: OwnerGroup[] = [];

  for (const [ownerId, ownerTasks] of groups) {
    const member: TeamMember =
      memberMap.get(ownerId) ?? { id: ownerId, name: "Unassigned" };

    const inProgressCount = ownerTasks.filter(
      (t) => t.status === "in_progress",
    ).length;
    const blockedCount = ownerTasks.filter(
      (t) => t.status === "blocked",
    ).length;

    result.push({
      member,
      tasks: ownerTasks,
      inProgressCount,
      blockedCount,
      action: "started",
    });
  }

  // Sort: blocked owners first, then by number of in-progress tasks desc
  result.sort((a, b) => {
    if (a.blockedCount !== b.blockedCount) return b.blockedCount - a.blockedCount;
    return b.inProgressCount - a.inProgressCount;
  });

  return result;
}

/**
 * Identify all blocked tasks across the team.
 */
export function identifyBlockers(tasks: TaskSummary[]): TaskSummary[] {
  return tasks.filter((t) => t.status === "blocked");
}

/**
 * Generate coaching prompts based on WIP limits, aging tasks, and blockers.
 */
export function generateCoachingPrompts(
  tasks: TaskSummary[],
  members: TeamMember[],
  config: CoachingConfig = DEFAULT_COACHING_CONFIG,
  now: Date = new Date(),
): CoachingPrompt[] {
  const prompts: CoachingPrompt[] = [];

  // --- Per-member WIP checks ---
  const memberMap = new Map<string, TeamMember>(members.map((m) => [m.id, m]));
  const byOwner = new Map<string, TaskSummary[]>();
  for (const t of tasks) {
    if (!byOwner.has(t.ownerId)) byOwner.set(t.ownerId, []);
    byOwner.get(t.ownerId)!.push(t);
  }

  for (const [ownerId, ownerTasks] of byOwner) {
    const inProgress = ownerTasks.filter((t) => t.status === "in_progress");
    const memberName = memberMap.get(ownerId)?.name ?? "Unknown";

    if (inProgress.length > config.wipLimits.perMember) {
      prompts.push({
        type: "wip_exceeded",
        severity: "warning",
        message: `${memberName} has ${inProgress.length} tasks in progress (limit: ${config.wipLimits.perMember}). Finish one before starting another.`,
        targetMemberId: ownerId,
        suggestedActions: inProgress.slice(config.wipLimits.perMember).map((t) => ({
          kind: "defer" as const,
          label: `Defer "${t.title}"`,
          taskId: t.id,
        })),
      });
    }
  }

  // --- Team-level WIP check ---
  const teamInProgress = tasks.filter((t) => t.status === "in_progress");
  if (teamInProgress.length > config.wipLimits.team) {
    prompts.push({
      type: "finish_first",
      severity: "critical",
      message: `Team WIP is ${teamInProgress.length} (limit: ${config.wipLimits.team}). Focus on finishing before starting new work.`,
      suggestedActions: teamInProgress.slice(config.wipLimits.team).map((t) => ({
        kind: "defer" as const,
        label: `Defer "${t.title}"`,
        taskId: t.id,
      })),
    });
  }

  // --- Aging tasks ---
  for (const task of teamInProgress) {
    const age = task.ageDays ?? (task.statusChangedAt ? daysBetween(task.statusChangedAt, now) : 0);
    if (age >= config.agingThresholdDays) {
      prompts.push({
        type: "aging_task",
        severity: "warning",
        message: `"${task.title}" has been in progress for ${age} days. Consider splitting or pairing.`,
        targetTaskId: task.id,
        targetMemberId: task.ownerId,
        suggestedActions: [
          { kind: "split", label: `Split "${task.title}"`, taskId: task.id },
          { kind: "pair", label: `Pair on "${task.title}"`, taskId: task.id },
        ],
      });
    }
  }

  // --- Blocked too long ---
  const blockedTasks = tasks.filter((t) => t.status === "blocked");
  for (const task of blockedTasks) {
    const blockedDays = task.ageDays ?? (task.statusChangedAt ? daysBetween(task.statusChangedAt, now) : 0);
    if (blockedDays >= config.blockedThresholdDays) {
      prompts.push({
        type: "blocked_too_long",
        severity: "critical",
        message: `"${task.title}" has been blocked for ${blockedDays} days: ${task.blockedReason ?? "no reason given"}.`,
        targetTaskId: task.id,
        targetMemberId: task.ownerId,
        suggestedActions: [
          { kind: "unblock", label: `Unblock "${task.title}"`, taskId: task.id },
          { kind: "drop", label: `Drop "${task.title}"`, taskId: task.id },
        ],
      });
    }
  }

  // Sort by severity: critical first
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  prompts.sort(
    (a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9),
  );

  return prompts;
}

/**
 * Calculate standup metrics from timing and task data.
 */
export function calculateStandupMetrics(opts: {
  startTime: Date;
  endTime: Date;
  groups: OwnerGroup[];
  coachingPromptsShown: number;
}): StandupMetrics {
  const totalDurationSeconds = Math.max(
    0,
    Math.round((opts.endTime.getTime() - opts.startTime.getTime()) / 1000),
  );
  const memberCount = opts.groups.length;
  const avgSecondsPerMember =
    memberCount > 0 ? Math.round(totalDurationSeconds / memberCount) : 0;
  const blockerCount = opts.groups.reduce((acc, g) => acc + g.blockedCount, 0);
  const tasksDiscussed = opts.groups.reduce((acc, g) => acc + g.tasks.length, 0);

  return {
    totalDurationSeconds,
    memberCount,
    avgSecondsPerMember,
    blockerCount,
    tasksDiscussed,
    coachingPromptsShown: opts.coachingPromptsShown,
  };
}

/**
 * Format standup results for posting to Slack.
 */
export function formatStandupForSlack(
  groups: OwnerGroup[],
  metrics: StandupMetrics,
  prompts: CoachingPrompt[],
): string {
  const lines: string[] = [];

  lines.push(":clipboard: *Daily Standup Summary*");
  lines.push("");

  const mins = Math.floor(metrics.totalDurationSeconds / 60);
  const secs = metrics.totalDurationSeconds % 60;
  lines.push(
    `*Duration:* ${mins}m ${secs}s | *Members:* ${metrics.memberCount} | *Blockers:* ${metrics.blockerCount}`,
  );
  lines.push("");

  for (const group of groups) {
    const statusEmoji =
      group.action === "completed" ? ":white_check_mark:" :
      group.action === "skipped" ? ":fast_forward:" :
      ":speaking_head_in_silhouette:";
    lines.push(`${statusEmoji} *${group.member.name}*`);

    for (const task of group.tasks) {
      const taskEmoji =
        task.status === "blocked" ? ":red_circle:" :
        task.status === "in_progress" ? ":large_blue_circle:" :
        task.status === "done" ? ":white_check_mark:" :
        task.status === "deferred" ? ":pause_button:" :
        ":white_circle:";
      const blockedNote =
        task.status === "blocked" && task.blockedReason
          ? ` _(blocked: ${task.blockedReason})_`
          : "";
      lines.push(`  ${taskEmoji} ${task.title}${blockedNote}`);
    }
    lines.push("");
  }

  if (prompts.length > 0) {
    lines.push(":bulb: *Coaching Notes*");
    for (const p of prompts) {
      const icon = p.severity === "critical" ? ":rotating_light:" : ":warning:";
      lines.push(`  ${icon} ${p.message}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
