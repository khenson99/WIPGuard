"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Clock,
  Flame,
  TrendingUp,
  TrendingDown,
  Hourglass,
  Link2,
  ArrowRight,
  ArrowUpRight,
  Zap,
  FolderKanban,
  ShieldAlert,
  Gauge,
} from "lucide-react";
import { COLUMN_LABELS } from "@/types";
import type { UserSummary, TaskStatus as TStatus } from "@/types";

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

interface DashTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  updatedAt: string;
  project: { id: string; name: string } | null;
  responsible: UserSummary[];
  dependsOn?: { id: string; title: string; status: string; dueDate: string | null }[];
  dependedBy?: { id: string; title: string; status: string; dueDate: string | null }[];
  urgencyScore?: number;
}

interface ProjectSummary {
  id: string;
  name: string;
  department: { id: string; name: string; color: string | null } | null;
  totalTasks: number;
  doneTasks: number;
  progress: number;
  statusDistribution?: Record<string, number>;
}

interface DashboardData {
  staleTasks: DashTask[];
  upcomingDeadlines: DashTask[];
  overdueTasks: DashTask[];
  blockedTasks: DashTask[];
  atRiskDependencies: DashTask[];
  projectSummaries: ProjectSummary[];
  recentlyCompleted: DashTask[];
  taskStatusOverview: Record<string, number>;
  totalTasks: number;
  velocity?: { thisWeek: number; lastWeek: number };
}

/* ═══════════════════════════════════════════════════════════════════════
   Colour maps
   ═══════════════════════════════════════════════════════════════════════ */

const STATUS_COLORS: Record<string, string> = {
  BACKLOG: "#94a3b8",
  QUEUED: "#a78bfa",
  WORKING_ON_TODAY: "#f59e0b",
  ACTIVE: "#3b82f6",
  NOT_DONE: "#ef4444",
  DONE: "#22c55e",
};

const STATUS_ORDER: string[] = [
  "BACKLOG",
  "QUEUED",
  "WORKING_ON_TODAY",
  "ACTIVE",
  "NOT_DONE",
  "DONE",
];

const PRIORITY_COLORS: Record<string, string> = {
  P0: "#ef4444",
  P1: "#f97316",
  P2: "#eab308",
  P3: "#22c55e",
};

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

function daysAgo(date: string | null): number {
  if (!date) return 0;
  return Math.floor(
    (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24),
  );
}

function daysUntil(date: string | null): number {
  if (!date) return Infinity;
  return Math.ceil(
    (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
}

function relativeDate(date: string | null): string {
  if (!date) return "";
  const d = daysUntil(date);
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return `${d}d`;
}

/* ═══════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════ */

function AvatarStack({ users }: { users: UserSummary[] }) {
  if (users.length === 0)
    return (
      <span className="text-xs text-muted-foreground">Unassigned</span>
    );
  return (
    <div className="flex -space-x-1.5">
      {users.slice(0, 3).map((u) => (
        <div
          key={u.id}
          className="flex h-5 w-5 items-center justify-center rounded-full border border-card bg-secondary text-[9px] font-medium text-foreground"
          title={u.name || u.email}
        >
          {u.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={u.image} alt="" className="h-full w-full rounded-full" />
          ) : (
            (u.name || u.email || "?").charAt(0).toUpperCase()
          )}
        </div>
      ))}
      {users.length > 3 && (
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-card bg-secondary text-[8px] font-medium text-muted-foreground">
          +{users.length - 3}
        </span>
      )}
    </div>
  );
}

/* ── Animated stat card ─────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  subtext,
  onClick,
}: {
  label: string;
  value: number | string;
  icon: React.FC<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  subtext?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5"
      style={{ background: `linear-gradient(135deg, var(--card) 0%, ${color}05 100%)` }}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${color}15`, boxShadow: `0 0 0 1px ${color}20` }}
      >
        <Icon className="h-5 w-5" style={{ color }} />
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight text-foreground">
          {value}
        </p>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {subtext && (
          <p className="text-[10px] text-muted-foreground/70">{subtext}</p>
        )}
      </div>
    </button>
  );
}

/* ── Velocity badge ─────────────────────────────────────────────────── */

function VelocityBadge({
  thisWeek,
  lastWeek,
}: {
  thisWeek: number;
  lastWeek: number;
}) {
  const delta = thisWeek - lastWeek;
  const pct = lastWeek > 0 ? Math.round((delta / lastWeek) * 100) : thisWeek > 0 ? 100 : 0;
  const isUp = delta >= 0;

  return (
    <div
      className="flex items-center gap-2 rounded-xl border px-4 py-3"
      style={{
        borderColor: isUp ? "#22c55e30" : "#ef444430",
        background: isUp
          ? "linear-gradient(135deg, var(--card) 0%, #22c55e08 100%)"
          : "linear-gradient(135deg, var(--card) 0%, #ef444408 100%)",
      }}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl"
        style={{
          backgroundColor: isUp ? "#22c55e15" : "#ef444415",
          boxShadow: isUp ? "0 0 0 1px #22c55e20" : "0 0 0 1px #ef444420",
        }}
      >
        <Gauge className="h-5 w-5" style={{ color: isUp ? "#22c55e" : "#ef4444" }} />
      </div>
      <div>
        <div className="flex items-center gap-1.5">
          <span className="text-2xl font-bold tracking-tight text-foreground">
            {thisWeek}
          </span>
          <span
            className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold"
            style={{
              backgroundColor: isUp ? "#22c55e18" : "#ef444418",
              color: isUp ? "#22c55e" : "#ef4444",
            }}
          >
            {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {isUp && "+"}
            {pct}%
          </span>
        </div>
        <p className="text-xs font-medium text-muted-foreground">
          Completed this week
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          vs {lastWeek} last week
        </p>
      </div>
    </div>
  );
}

/* ── Donut chart using conic-gradient ───────────────────────────────── */

function StatusDonut({
  data,
  total,
}: {
  data: Record<string, number>;
  total: number;
}) {
  const segments = useMemo(() => {
    const ordered = STATUS_ORDER.filter((s) => (data[s] || 0) > 0);
    return ordered.reduce<Array<{ status: string; count: number; pct: number; start: number; end: number }>>((acc, status) => {
      const count = data[status] || 0;
      const pct = (count / total) * 100;
      const start = acc[acc.length - 1]?.end ?? 0;
      const end = start + pct;
      return [...acc, { status, count, pct, start, end }];
    }, []);
  }, [data, total]);

  const gradientStops = segments
    .map(
      (s) =>
        `${STATUS_COLORS[s.status] || "#64748b"} ${s.start}% ${s.end}%`,
    )
    .join(", ");

  return (
    <div className="flex items-center gap-6">
      <div
        className="relative h-28 w-28 flex-shrink-0 rounded-full"
        style={{
          background: `conic-gradient(${gradientStops || "var(--border) 0% 100%"})`,
        }}
      >
        {/* Inner cutout */}
        <div className="absolute inset-3 flex items-center justify-center rounded-full bg-card">
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{total}</p>
            <p className="text-[9px] text-muted-foreground">tasks</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <div key={s.status} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: STATUS_COLORS[s.status] || "#64748b" }}
            />
            <span className="text-xs text-muted-foreground">
              {COLUMN_LABELS[s.status as TStatus] || s.status}
            </span>
            <span className="font-medium text-xs text-foreground">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Task row ───────────────────────────────────────────────────────── */

function TaskRow({
  task,
  badge,
  badgeColor,
  onClick,
}: {
  task: DashTask;
  badge?: string;
  badgeColor?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-secondary/60"
    >
      <span
        className="h-2 w-2 flex-shrink-0 rounded-full"
        style={{ backgroundColor: STATUS_COLORS[task.status] || "#64748b" }}
      />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {task.title}
      </span>
      {badge && (
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{
            backgroundColor: `${badgeColor || "#64748b"}18`,
            color: badgeColor || "#64748b",
          }}
        >
          {badge}
        </span>
      )}
      <span
        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
        style={{
          backgroundColor: `${PRIORITY_COLORS[task.priority] || "#64748b"}18`,
          color: PRIORITY_COLORS[task.priority] || "#64748b",
        }}
      >
        {task.priority}
      </span>
      <AvatarStack users={task.responsible || []} />
      {task.project && (
        <span className="hidden shrink-0 truncate text-[10px] text-muted-foreground sm:inline max-w-[100px]">
          {task.project.name}
        </span>
      )}
    </button>
  );
}

/* ── Needs Attention banner ─────────────────────────────────────────── */

function NeedsAttentionBanner({
  overdue,
  blocked,
  atRisk,
}: {
  overdue: DashTask[];
  blocked: DashTask[];
  atRisk: DashTask[];
}) {
  // Find the single most urgent item
  const mostUrgent = useMemo(() => {
    // Prioritize: overdue with dependents > overdue > at-risk > blocked
    const overdueWithDeps = overdue.filter(
      (t) => t.dependedBy && t.dependedBy.length > 0,
    );
    if (overdueWithDeps.length > 0) return { task: overdueWithDeps[0], reason: "overdue & blocking others" };
    if (atRisk.length > 0 && (atRisk[0].urgencyScore || 0) > 5)
      return { task: atRisk[0], reason: "high urgency dependency" };
    if (overdue.length > 0) return { task: overdue[0], reason: "overdue" };
    if (blocked.length > 0) return { task: blocked[0], reason: "blocked" };
    return null;
  }, [overdue, blocked, atRisk]);

  if (!mostUrgent) return null;

  const { task, reason } = mostUrgent;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-4"
      style={{
        borderColor: "#ef444440",
        background:
          "linear-gradient(135deg, #ef444408 0%, #f9731608 50%, var(--card) 100%)",
      }}
    >
      {/* Ambient glow */}
      <div
        className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-30 blur-3xl"
        style={{ background: "#ef4444" }}
      />
      <div className="relative flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
          <ShieldAlert className="h-6 w-6 text-red-400" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-red-400">
            ⚡ Needs Immediate Attention
          </p>
          <p className="mt-0.5 text-sm font-medium text-foreground">
            {task.title}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {reason} • {task.priority}
            {task.dueDate && ` • due ${relativeDate(task.dueDate)}`}
            {task.dependedBy && task.dependedBy.length > 0 && (
              <span className="text-orange-400">
                {" "}
                • blocks {task.dependedBy.length} task
                {task.dependedBy.length > 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
        {task.responsible && task.responsible.length > 0 && (
          <AvatarStack users={task.responsible} />
        )}
      </div>
    </div>
  );
}

/* ── Dependency chain visualization ─────────────────────────────────── */

function DependencyTree({ tasks }: { tasks: DashTask[] }) {
  if (tasks.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        ✨ No at-risk dependency chains
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((t) => {
        const urgency = t.urgencyScore || 0;
        const urgencyColor =
          urgency >= 15 ? "#ef4444" : urgency >= 8 ? "#f97316" : "#eab308";
        return (
          <div
            key={t.id}
            className="rounded-xl border p-3 transition-colors hover:bg-secondary/30"
            style={{ borderColor: `${urgencyColor}30` }}
          >
            {/* Parent task */}
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold"
                style={{
                  backgroundColor: `${urgencyColor}18`,
                  color: urgencyColor,
                }}
              >
                {urgency}
              </div>
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    STATUS_COLORS[t.status] || "#64748b",
                }}
              />
              <span className="flex-1 truncate text-sm font-medium text-foreground">
                {t.title}
              </span>
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: `${PRIORITY_COLORS[t.priority] || "#64748b"}18`,
                  color: PRIORITY_COLORS[t.priority] || "#64748b",
                }}
              >
                {t.priority}
              </span>
              {t.dueDate && (
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{
                    backgroundColor: `${urgencyColor}18`,
                    color: urgencyColor,
                  }}
                >
                  {relativeDate(t.dueDate)}
                </span>
              )}
              <AvatarStack users={t.responsible || []} />
            </div>

            {/* Blocked children */}
            {t.dependedBy && t.dependedBy.length > 0 && (
              <div className="ml-8 mt-2 space-y-1 border-l-2 pl-3" style={{ borderColor: `${urgencyColor}25` }}>
                {t.dependedBy.map((dep) => (
                  <div
                    key={dep.id}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <ArrowRight className="h-3 w-3 shrink-0" style={{ color: urgencyColor }} />
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        backgroundColor: STATUS_COLORS[dep.status] || "#64748b",
                      }}
                    />
                    <span className="truncate">
                      {dep.title}
                    </span>
                    {dep.dueDate && (
                      <span className="shrink-0 text-[10px]" style={{ color: urgencyColor }}>
                        due {relativeDate(dep.dueDate)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Project card with mini status bar ──────────────────────────────── */

function ProjectCard({
  project,
  onClick,
}: {
  project: ProjectSummary;
  onClick: () => void;
}) {
  const progressColor =
    project.progress >= 80
      ? "#22c55e"
      : project.progress >= 40
        ? "#3b82f6"
        : "#eab308";

  return (
    <button
      onClick={onClick}
      className="group rounded-xl border border-border p-3 text-left transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5"
      style={{
        background: `linear-gradient(180deg, var(--card) 0%, ${progressColor}03 100%)`,
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
          {project.name}
        </span>
        <span
          className="ml-2 rounded-md px-1.5 py-0.5 text-xs font-bold"
          style={{ backgroundColor: `${progressColor}18`, color: progressColor }}
        >
          {project.progress}%
        </span>
      </div>

      {/* Multi-segment progress bar */}
      <div className="mb-2 flex h-2 overflow-hidden rounded-full bg-border">
        {STATUS_ORDER.filter((s) => (project.statusDistribution?.[s] || 0) > 0).map(
          (status) => {
            const count = project.statusDistribution?.[status] || 0;
            return (
              <div
                key={status}
                className="h-full transition-all"
                style={{
                  width: `${(count / project.totalTasks) * 100}%`,
                  backgroundColor: STATUS_COLORS[status] || "#64748b",
                }}
                title={`${COLUMN_LABELS[status as TStatus] || status}: ${count}`}
              />
            );
          },
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {project.doneTasks}/{project.totalTasks} tasks
        </span>
        {project.department && (
          <span className="flex items-center gap-1">
            {project.department.color && (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: project.department.color }}
              />
            )}
            {project.department.name}
          </span>
        )}
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Dashboard Component
   ═══════════════════════════════════════════════════════════════════════ */

export function DashboardView() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (res.ok) setData(await res.json());
    } catch {
      console.error("Failed to fetch dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Unable to load dashboard
      </div>
    );
  }

  const {
    staleTasks,
    upcomingDeadlines,
    overdueTasks,
    blockedTasks,
    atRiskDependencies,
    projectSummaries,
    taskStatusOverview,
    totalTasks,
    velocity,
  } = data;

  const activeCount =
    (taskStatusOverview["ACTIVE"] || 0) +
    (taskStatusOverview["WORKING_ON_TODAY"] || 0);

  const needsAttention =
    overdueTasks.length > 0 ||
    blockedTasks.length > 0 ||
    atRiskDependencies.length > 0;

  return (
    <div className="space-y-6 px-4 py-4">
      {/* ═══ Needs Attention Banner ═══ */}
      {needsAttention && (
        <NeedsAttentionBanner
          overdue={overdueTasks}
          blocked={blockedTasks}
          atRisk={atRiskDependencies}
        />
      )}

      {/* ═══ Headline stat cards + Velocity ═══ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <StatCard
          label="Total Tasks"
          value={totalTasks}
          icon={Zap}
          color="var(--primary)"
        />
        <StatCard
          label="In Progress"
          value={activeCount}
          icon={TrendingUp}
          color="#3b82f6"
        />
        <StatCard
          label="Overdue"
          value={overdueTasks.length}
          icon={Clock}
          color="#ef4444"
          subtext={overdueTasks.length > 0 ? "Action needed" : undefined}
        />
        <StatCard
          label="Blocked"
          value={blockedTasks.length}
          icon={AlertTriangle}
          color="#f97316"
        />
        <StatCard
          label="Going Stale"
          value={staleTasks.length}
          icon={Hourglass}
          color="#a855f7"
          subtext={staleTasks.length > 0 ? "5+ days idle" : undefined}
        />
        <StatCard
          label="Dep. Chains"
          value={atRiskDependencies.length}
          icon={Link2}
          color="#ec4899"
          subtext={atRiskDependencies.length > 0 ? "At risk" : undefined}
        />
        {velocity && (
          <VelocityBadge
            thisWeek={velocity.thisWeek}
            lastWeek={velocity.lastWeek}
          />
        )}
      </div>

      {/* ═══ Donut + Distribution ═══ */}
      {totalTasks > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">
              Task Distribution
            </h3>
            <StatusDonut data={taskStatusOverview} total={totalTasks} />
          </div>

          {/* At-Risk Dependencies */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Link2 className="h-4 w-4 text-pink-400" />
              Dependency Risk Map
              {atRiskDependencies.length > 0 && (
                <span className="ml-auto rounded-full bg-pink-500/10 px-2 py-0.5 text-[10px] font-medium text-pink-400">
                  {atRiskDependencies.length}
                </span>
              )}
            </h3>
            <p className="mb-3 text-[11px] text-muted-foreground">
              Tasks that block others, ranked by urgency score
            </p>
            <DependencyTree tasks={atRiskDependencies} />
          </div>
        </div>
      )}

      {/* ═══ Alerts row ═══ */}
      <div className="grid grid-cols-1 gap-4">
        {/* Blocked */}
        {blockedTasks.length > 0 && (
          <section className="rounded-2xl border border-orange-500/30 bg-orange-500/5 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-orange-400">
              <AlertTriangle className="h-4 w-4" />
              Blocked ({blockedTasks.length})
            </h3>
            <div className="space-y-0.5">
              {blockedTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  badge="Blocked"
                  badgeColor="#f97316"
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ═══ Main 3-col grid ═══ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Stale tasks */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Hourglass className="h-4 w-4 text-purple-400" />
            Stale Tasks
            {staleTasks.length > 0 && (
              <span className="ml-auto rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-400">
                {staleTasks.length}
              </span>
            )}
          </h3>
          {staleTasks.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              ✨ No stale tasks — everything is moving!
            </p>
          ) : (
            <div className="space-y-0.5">
              {staleTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  badge={`${daysAgo(t.updatedAt)}d ago`}
                  badgeColor="#a855f7"
                />
              ))}
            </div>
          )}
        </section>

        {/* Upcoming deadlines */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Flame className="h-4 w-4 text-amber-400" />
            Upcoming Deadlines
            {upcomingDeadlines.length > 0 && (
              <span className="ml-auto rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                {upcomingDeadlines.length}
              </span>
            )}
          </h3>
          {upcomingDeadlines.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No upcoming deadlines this week
            </p>
          ) : (
            <div className="space-y-0.5">
              {upcomingDeadlines.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  badge={relativeDate(t.dueDate)}
                  badgeColor={
                    daysUntil(t.dueDate) <= 2 ? "#ef4444" : "#eab308"
                  }
                />
              ))}
            </div>
          )}
        </section>

        {/* Overdue tasks */}
        <section className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-400">
            <Clock className="h-4 w-4" />
            Overdue Tasks
            {overdueTasks.length > 0 && (
              <span className="ml-auto rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
                {overdueTasks.length}
              </span>
            )}
          </h3>
          {overdueTasks.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No overdue tasks
            </p>
          ) : (
            <div className="space-y-0.5">
              {overdueTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  badge={relativeDate(t.dueDate)}
                  badgeColor="#ef4444"
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ═══ Active Projects ═══ */}
      {projectSummaries.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FolderKanban className="h-4 w-4" />
              Active Projects
            </h3>
            <button
              onClick={() => router.push("/projects")}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              View all <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {projectSummaries.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onClick={() => router.push(`/projects/${p.id}`)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
