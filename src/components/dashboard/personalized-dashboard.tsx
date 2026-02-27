"use client";

import { useMemo } from "react";
import { AlertTriangle, CalendarClock, Clock3, Flame } from "lucide-react";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-error-banner";
import { DashboardStaleBanner } from "@/components/dashboard/dashboard-stale-banner";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";

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
  meta?: {
    servedAt: string;
    isPartial: boolean;
  };
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

const PERSONALIZED_DASHBOARD_CACHE_KEY = "dashboard:personalized:v2";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPersonalizedDashboardPayload(value: unknown): value is PersonalizedDashboardPayload {
  if (!isRecord(value)) return false;
  if (!isRecord(value.personal) || !isRecord(value.team) || !isRecord(value.projects)) return false;

  const personal = value.personal;
  const team = value.team;
  const projects = value.projects;

  return (
    Array.isArray(personal.myActive) &&
    Array.isArray(personal.myBlocked) &&
    Array.isArray(personal.myOverdue) &&
    Array.isArray(personal.myDueSoon) &&
    Array.isArray(personal.recommendations) &&
    typeof personal.myCompletedWeek === "number" &&
    typeof team.staleTasks === "number" &&
    typeof team.blockedTasks === "number" &&
    typeof team.overdueTasks === "number" &&
    isRecord(team.taskStatusOverview) &&
    Array.isArray(projects.active)
  );
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
    <section className="rounded-xl border border-border bg-card p-4" aria-label={title}>
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
  const resource = useDashboardResource<PersonalizedDashboardPayload>({
    cacheKey: PERSONALIZED_DASHBOARD_CACHE_KEY,
    deps: [],
    load: async ({ signal, refresh }) => {
      const response = await fetch("/api/dashboard/personalized", {
        signal,
        cache: refresh ? "no-store" : "default",
      });

      if (!response.ok) {
        throw new Error(`Dashboard request failed (${response.status})`);
      }

      const payload = (await response.json()) as unknown;
      if (!isPersonalizedDashboardPayload(payload)) {
        throw new Error("Dashboard response payload is invalid");
      }
      return payload;
    },
    getLastUpdatedAt: (payload) => payload.meta?.servedAt ?? payload.generatedAt,
    mapError: (error) => {
      if (error instanceof Error && error.message.trim().length > 0) return error.message;
      return "Could not load personalized dashboard.";
    },
  });

  const data = resource.data;

  const taskTotal = useMemo(() => {
    if (!data) return 0;
    return Object.values(data.team.taskStatusOverview ?? {}).reduce((sum, count) => sum + count, 0);
  }, [data]);

  if (resource.loading && !data) {
    return <DashboardLoadingState message="Loading personalized dashboard..." className="h-[50vh]" />;
  }

  if (!data) {
    return (
      <div className="p-4">
        <DashboardEmptyState
          title="Dashboard unavailable"
          message={resource.error ?? "No personalized dashboard data was returned."}
          actionLabel="Refresh now"
          onAction={resource.refresh}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground">
            Personalized work intelligence with team context.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Last updated: {resource.lastUpdatedAt ? new Date(resource.lastUpdatedAt).toLocaleString() : "Unknown"}
            {resource.fromCache ? " (cache warm start)" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={resource.refresh}
          disabled={resource.refreshing}
          aria-label="Refresh dashboard"
          aria-busy={resource.refreshing}
          className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-70"
        >
          {resource.refreshing ? "Refreshing..." : "Refresh now"}
        </button>
      </div>

      {resource.stale ? (
        <DashboardStaleBanner lastUpdatedAt={resource.lastUpdatedAt} onRefresh={resource.refresh} refreshing={resource.refreshing} />
      ) : null}

      {resource.error ? (
        <DashboardErrorBanner message={resource.error} onRetry={resource.refresh} />
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6" role="region" aria-label="Personal statistics">
        <div className="rounded-xl border border-border bg-card px-4 py-3" role="group" aria-label={`My Active: ${data.personal.myActive.length}`}>
          <p className="text-xs text-muted-foreground">My Active</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{data.personal.myActive.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3" role="group" aria-label={`My Blocked: ${data.personal.myBlocked.length}`}>
          <p className="text-xs text-muted-foreground">My Blocked</p>
          <p className="mt-1 text-2xl font-semibold text-orange-500">{data.personal.myBlocked.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3" role="group" aria-label={`My Overdue: ${data.personal.myOverdue.length}`}>
          <p className="text-xs text-muted-foreground">My Overdue</p>
          <p className="mt-1 text-2xl font-semibold text-red-500">{data.personal.myOverdue.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3" role="group" aria-label={`Completed (7d): ${data.personal.myCompletedWeek}`}>
          <p className="text-xs text-muted-foreground">Completed (7d)</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">{data.personal.myCompletedWeek}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3" role="group" aria-label={`Team Overdue: ${data.team.overdueTasks}`}>
          <p className="text-xs text-muted-foreground">Team Overdue</p>
          <p className="mt-1 text-2xl font-semibold text-red-500">{data.team.overdueTasks}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3" role="group" aria-label={`Task Total: ${taskTotal}`}>
          <p className="text-xs text-muted-foreground">Task Total</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{taskTotal}</p>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card p-4" aria-label="Recommended next actions">
        <div className="mb-3 flex items-center gap-2">
          <Flame className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Recommended Next Actions</h2>
        </div>
        {data.personal.recommendations.length === 0 ? (
          <p className="text-xs text-muted-foreground">No urgent recommendations right now.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {data.personal.recommendations.map((task) => (
              <div key={task.id} className="rounded-lg border border-border/60 px-3 py-2" aria-label={task.title}>
                <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Score {task.recommendationScore || 0} · {task.priority} · {relativeDate(task.dueDate)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" role="region" aria-label="Task lists">
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

      <section className="rounded-xl border border-border bg-card p-4" aria-label="Team and project context">
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
                <div className="mt-2 h-1.5 w-full rounded-full bg-secondary" role="progressbar" aria-valuenow={project.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${project.name} progress`}>
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
