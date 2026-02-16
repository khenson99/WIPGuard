"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Clock3, Flame } from "lucide-react";

interface DashboardTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  project: { id: string; name: string } | null;
  recommendationScore?: number;
}

interface PersonalizedDashboardPayload {
  generatedAt: string;
  personal: {
    myActive: DashboardTask[];
    myBlocked: DashboardTask[];
    myOverdue: DashboardTask[];
    myDueSoon: DashboardTask[];
    myCompletedWeek: number;
    recommendations: DashboardTask[];
  };
  team: {
    staleTasks: number;
    blockedTasks: number;
    overdueTasks: number;
    taskStatusOverview: Record<string, number>;
  };
  projects: {
    active: Array<{
      id: string;
      name: string;
      progress: number;
      doneTasks: number;
      totalTasks: number;
    }>;
  };
}

const PERSONALIZED_DASHBOARD_CACHE_KEY = "dashboard:personalized:v1";

function readDashboardCache(): PersonalizedDashboardPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PERSONALIZED_DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersonalizedDashboardPayload;
  } catch {
    return null;
  }
}

function writeDashboardCache(payload: PersonalizedDashboardPayload): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PERSONALIZED_DASHBOARD_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures (private browsing/storage quotas).
  }
}

function relativeDate(date: string | null): string {
  if (!date) return "No due date";
  const target = new Date(date).getTime();
  const diffDays = Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  return `Due in ${diffDays}d`;
}

function TaskList({
  title,
  items,
  empty,
}: {
  title: string;
  items: DashboardTask[];
  empty: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-2">
          {items.map((task) => (
            <div key={task.id} className="rounded-lg border border-border/60 px-3 py-2">
              <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {task.project?.name || "No project"} · {task.priority} · {relativeDate(task.dueDate)}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function PersonalizedDashboard() {
  const [data, setData] = useState<PersonalizedDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const cached = readDashboardCache();

    if (cached) {
      queueMicrotask(() => {
        if (!active) return;
        setData(cached);
        setLoading(false);
      });
    } else {
      queueMicrotask(() => {
        if (!active) return;
        setLoading(true);
      });
    }

    fetch("/api/dashboard/personalized", { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        setData(payload);
        writeDashboardCache(payload as PersonalizedDashboardPayload);
      })
      .catch((error) => {
        if (!active || (error instanceof Error && error.name === "AbortError")) return;
        if (!cached) {
          setData(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const taskTotal = useMemo(() => {
    if (!data) return 0;
    return Object.values(data.team.taskStatusOverview).reduce((sum, count) => sum + count, 0);
  }, [data]);

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
        Could not load personalized dashboard.
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-xs text-muted-foreground">
          Personalized work intelligence with team context.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">My Active</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{data.personal.myActive.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">My Blocked</p>
          <p className="mt-1 text-2xl font-semibold text-orange-500">{data.personal.myBlocked.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">My Overdue</p>
          <p className="mt-1 text-2xl font-semibold text-red-500">{data.personal.myOverdue.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Completed (7d)</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">{data.personal.myCompletedWeek}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Team Overdue</p>
          <p className="mt-1 text-2xl font-semibold text-red-500">{data.team.overdueTasks}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Task Total</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{taskTotal}</p>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Flame className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Recommended Next Actions</h2>
        </div>
        {data.personal.recommendations.length === 0 ? (
          <p className="text-xs text-muted-foreground">No urgent recommendations right now.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {data.personal.recommendations.map((task) => (
              <div key={task.id} className="rounded-lg border border-border/60 px-3 py-2">
                <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Score {task.recommendationScore || 0} · {task.priority} · {relativeDate(task.dueDate)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TaskList
          title="My Blockers"
          items={data.personal.myBlocked}
          empty="No blocked tasks."
        />
        <TaskList
          title="My Due Soon"
          items={data.personal.myDueSoon}
          empty="No due-soon tasks."
        />
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Team and Project Context</h2>
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> Stale Tasks</div>
            <p className="mt-1 text-lg font-semibold text-foreground">{data.team.staleTasks}</p>
          </div>
          <div className="rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Blocked Tasks</div>
            <p className="mt-1 text-lg font-semibold text-foreground">{data.team.blockedTasks}</p>
          </div>
          <div className="rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" /> Overdue Tasks</div>
            <p className="mt-1 text-lg font-semibold text-foreground">{data.team.overdueTasks}</p>
          </div>
        </div>

        {data.projects.active.length > 0 && (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
            {data.projects.active.map((project) => (
              <div key={project.id} className="rounded-lg border border-border/60 px-3 py-2">
                <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {project.doneTasks}/{project.totalTasks} done
                </p>
                <div className="mt-2 h-1.5 w-full rounded-full bg-secondary">
                  <div
                    className="h-1.5 rounded-full bg-primary"
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
