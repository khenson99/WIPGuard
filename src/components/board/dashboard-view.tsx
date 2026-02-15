"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Clock,
  Flame,
  TrendingUp,
  CheckCircle2,
  Hourglass,
  Link2,
  ArrowRight,
  Zap,
  FolderKanban,
} from "lucide-react";
import { COLUMN_LABELS } from "@/types";
import type { UserSummary, TaskStatus as TStatus } from "@/types";

/* ---------- types ---------- */

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
}

interface ProjectSummary {
  id: string;
  name: string;
  department: { id: string; name: string; color: string | null } | null;
  totalTasks: number;
  doneTasks: number;
  progress: number;
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
}

/* ---------- colour maps ---------- */

const STATUS_COLORS: Record<string, string> = {
  BACKLOG: "#94a3b8",
  QUEUED: "#a78bfa",
  WORKING_ON_TODAY: "#f59e0b",
  ACTIVE: "#3b82f6",
  NOT_DONE: "#ef4444",
  DONE: "#22c55e",
};

const PRIORITY_COLORS: Record<string, string> = {
  P0: "#ef4444",
  P1: "#f97316",
  P2: "#eab308",
  P3: "#22c55e",
};

/* ---------- helpers ---------- */

function daysAgo(date: string | null): number {
  if (!date) return 0;
  return Math.floor(
    (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function daysUntil(date: string | null): number {
  if (!date) return Infinity;
  return Math.ceil(
    (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
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

function AvatarStack({ users }: { users: UserSummary[] }) {
  if (users.length === 0) return <span className="text-xs text-muted-foreground">Unassigned</span>;
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

/* ---------- card sub-components ---------- */

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  subtext,
}: {
  label: string;
  value: number | string;
  icon: React.FC<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  subtext?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${color}18` }}
      >
        <Icon className="h-4.5 w-4.5" style={{ color }} />
      </div>
      <div>
        <p className="text-xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {subtext && (
          <p className="text-[10px] text-muted-foreground/70">{subtext}</p>
        )}
      </div>
    </div>
  );
}

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

/* ============================================================
   Main Dashboard
   ============================================================ */

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
    recentlyCompleted,
    taskStatusOverview,
    totalTasks,
  } = data;

  const doneCount = taskStatusOverview["DONE"] || 0;
  const activeCount =
    (taskStatusOverview["ACTIVE"] || 0) +
    (taskStatusOverview["WORKING_ON_TODAY"] || 0);

  return (
    <div className="space-y-6 px-4 py-4">
      {/* ===== Headline stats ===== */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
          label="Completed"
          value={doneCount}
          icon={CheckCircle2}
          color="#22c55e"
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
      </div>

      {/* ===== Global status bar ===== */}
      {totalTasks > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-border">
            {Object.entries(taskStatusOverview).map(([status, count]) => (
              <div
                key={status}
                className="h-full"
                style={{
                  width: `${(count / totalTasks) * 100}%`,
                  backgroundColor: STATUS_COLORS[status] || "#64748b",
                }}
                title={`${COLUMN_LABELS[status as TStatus] || status}: ${count}`}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-3">
            {Object.entries(taskStatusOverview).map(([status, count]) => (
              <span
                key={status}
                className="flex items-center gap-1 text-xs text-muted-foreground"
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[status] || "#64748b" }}
                />
                {COLUMN_LABELS[status as TStatus] || status}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ===== Alerts row ===== */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Overdue */}
        {overdueTasks.length > 0 && (
          <section className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-400">
              <Clock className="h-4 w-4" />
              Overdue ({overdueTasks.length})
            </h3>
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
          </section>
        )}

        {/* At-risk dependencies */}
        {atRiskDependencies.length > 0 && (
          <section className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-orange-400">
              <Link2 className="h-4 w-4" />
              At-Risk Dependencies ({atRiskDependencies.length})
            </h3>
            <p className="mb-2 text-xs text-muted-foreground">
              These tasks block others and are approaching deadlines or stale
            </p>
            <div className="space-y-0.5">
              {atRiskDependencies.map((t) => (
                <div key={t.id}>
                  <TaskRow
                    task={t}
                    badge={
                      t.dueDate
                        ? relativeDate(t.dueDate)
                        : `${daysAgo(t.updatedAt)}d idle`
                    }
                    badgeColor="#f97316"
                  />
                  {t.dependedBy && t.dependedBy.length > 0 && (
                    <div className="ml-8 border-l-2 border-orange-500/20 pl-3 py-0.5">
                      {t.dependedBy.map((dep) => (
                        <p
                          key={dep.id}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground"
                        >
                          <ArrowRight className="h-3 w-3 text-orange-400" />
                          <span className="truncate">Blocks: {dep.title}</span>
                          {dep.dueDate && (
                            <span className="text-[10px] text-orange-400">
                              due {relativeDate(dep.dueDate)}
                            </span>
                          )}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ===== Main grid ===== */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Stale tasks */}
        <section className="rounded-xl border border-border bg-card p-4">
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
        <section className="rounded-xl border border-border bg-card p-4">
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

        {/* Recently completed */}
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            Recently Completed
            {recentlyCompleted.length > 0 && (
              <span className="ml-auto rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-400">
                {recentlyCompleted.length}
              </span>
            )}
          </h3>
          {recentlyCompleted.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No completions this week
            </p>
          ) : (
            <div className="space-y-0.5">
              {recentlyCompleted.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  badge={`${daysAgo(t.updatedAt)}d ago`}
                  badgeColor="#22c55e"
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ===== Active Projects ===== */}
      {projectSummaries.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FolderKanban className="h-4 w-4" />
              Active Projects
            </h3>
            <button
              onClick={() => router.push("/projects")}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {projectSummaries.map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/projects/${p.id}`)}
                className="rounded-lg border border-border p-3 text-left transition-colors hover:bg-secondary/50"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="truncate text-sm font-medium text-foreground">
                    {p.name}
                  </span>
                  <span className="ml-2 text-xs font-bold text-primary">
                    {p.progress}%
                  </span>
                </div>
                {/* Progress bar */}
                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${p.progress}%`,
                      backgroundColor:
                        p.progress >= 80
                          ? "#22c55e"
                          : p.progress >= 40
                            ? "#3b82f6"
                            : "#eab308",
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {p.doneTasks}/{p.totalTasks} tasks
                  </span>
                  {p.department && (
                    <span className="flex items-center gap-1">
                      {p.department.color && (
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: p.department.color }}
                        />
                      )}
                      {p.department.name}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
