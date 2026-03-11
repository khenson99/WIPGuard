"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, Clock3, Flame } from "lucide-react";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-error-banner";
import { DashboardStaleBanner } from "@/components/dashboard/dashboard-stale-banner";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";
import { DonutChart } from "@/components/charts/donut-chart";
import { StackedBarChart } from "@/components/charts/stacked-bar-chart";
import { SparkLine } from "@/components/charts/spark-line";
import { getChartColor } from "@/components/charts/chart-theme";
import type { PersonalizedDashboardPayload } from "@/lib/work/dashboard/personalized";

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

  const completedByDay = personal.completedByDay;
  const completedByDayValid =
    completedByDay === undefined ||
    (Array.isArray(completedByDay) &&
      completedByDay.every(
        (point) =>
          isRecord(point) &&
          typeof point.date === "string" &&
          typeof point.count === "number"
      ));

  return (
    Array.isArray(personal.myActive) &&
    Array.isArray(personal.myBlocked) &&
    Array.isArray(personal.myOverdue) &&
    Array.isArray(personal.myDueSoon) &&
    Array.isArray(personal.recommendations) &&
    typeof personal.myCompletedWeek === "number" &&
    completedByDayValid &&
    typeof team.staleTasks === "number" &&
    typeof team.blockedTasks === "number" &&
    typeof team.overdueTasks === "number" &&
    isRecord(team.taskStatusOverview) &&
    Array.isArray(projects.active)
  );
}

function relativeDate(date: string | Date | null): string {
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
  maxItems = 8,
}: {
  title: string;
  items: PersonalizedDashboardPayload["personal"]["myActive"];
  empty: string;
  maxItems?: number;
}) {
  const visible = items.slice(0, maxItems);
  const hasMore = items.length > visible.length;
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label={title}>
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-2">
          {visible.map((task) => (
            <div
              key={task.id}
              className="rounded-lg border border-border/60 px-3 py-2"
            >
              <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {task.project?.name || "No project"} · {task.priority} · {relativeDate(task.dueDate)}
              </p>
            </div>
          ))}
        </div>
      )}
      {hasMore ? (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            Showing {visible.length} of {items.length}
          </span>
        </div>
      ) : null}
    </section>
  );
}

interface PersonalizedDashboardProps {
  title?: string;
  description?: string;
}

export function PersonalizedDashboard({
  title = "Dashboard",
  description = "Your workload, trends, and team signals.",
}: PersonalizedDashboardProps) {
  const focusRef = useRef<HTMLDivElement | null>(null);
  const [focusKey, setFocusKey] = useState<"blocked" | "overdue" | "dueSoon" | "active">("blocked");

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

  const completedSpark = useMemo(() => {
    if (!data?.personal.completedByDay) return [];
    // Show last 7 days to match the "Completed (7d)" label
    return data.personal.completedByDay.slice(-7).map((p) => p.count);
  }, [data]);

  const myWorkloadSegments = useMemo(() => {
    if (!data) return [];
    const blocked = data.personal.myBlocked.length;
    const overdue = data.personal.myOverdue.length;
    const dueSoon = data.personal.myDueSoon.length;
    const active = data.personal.myActive.length;
    return [
      { name: "Blocked", value: blocked, color: getChartColor(0) },
      { name: "Overdue", value: overdue, color: getChartColor(3) },
      { name: "Due Soon", value: dueSoon, color: getChartColor(1) },
      { name: "Active", value: active, color: getChartColor(2) },
    ].filter((seg) => seg.value > 0);
  }, [data]);

  const teamStatusKeys = useMemo(() => {
    if (!data) return [];
    const preferred = ["WORKING_ON_TODAY", "ACTIVE", "QUEUED", "BACKLOG", "NOT_DONE", "DONE"];
    const present = Object.keys(data.team.taskStatusOverview ?? {});
    const ordered = preferred.filter((key) => present.includes(key));
    for (const key of present) {
      if (!ordered.includes(key)) ordered.push(key);
    }
    return ordered;
  }, [data]);

  const teamStatusChartData = useMemo(() => {
    if (!data) return [];
    const row: Record<string, unknown> = { label: "Team" };
    for (const key of teamStatusKeys) {
      row[key] = data.team.taskStatusOverview[key] ?? 0;
    }
    return [row];
  }, [data, teamStatusKeys]);

  const focusConfig = useMemo(() => {
    if (!data) return null;
    const mapping = {
      blocked: { title: "My Blockers", items: data.personal.myBlocked, empty: "No blocked tasks." },
      overdue: { title: "My Overdue", items: data.personal.myOverdue, empty: "No overdue tasks." },
      dueSoon: { title: "My Due Soon", items: data.personal.myDueSoon, empty: "No due-soon tasks." },
      active: { title: "My Active", items: data.personal.myActive, empty: "No active tasks." },
    } as const;
    return mapping[focusKey];
  }, [data, focusKey]);

  const setFocusFromLegend = (next: typeof focusKey) => {
    setFocusKey(next);
    queueMicrotask(() => {
      if (typeof focusRef.current?.scrollIntoView === "function") {
        focusRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    });
  };

  if (resource.loading && !data) {
    return <DashboardLoadingState message="Loading personalized dashboard..." className="h-[50vh]" />;
  }

  if (!data) {
    return (
      <div className="p-4">
        <DashboardEmptyState
          title={`${title} unavailable`}
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
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-xs text-muted-foreground">{description}</p>
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6" role="region" aria-label="Key metrics">
        <div className="rounded-xl border border-border bg-card px-4 py-3" role="group" aria-label={`My Active: ${data.personal.myActive.length}`}>
          <p className="text-xs text-muted-foreground">My Active</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{data.personal.myActive?.length ?? "\u2014"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3" role="group" aria-label={`My Blocked: ${data.personal.myBlocked.length}`}>
          <p className="text-xs text-muted-foreground">My Blocked</p>
          <p className="mt-1 text-2xl font-semibold text-orange-500">{data.personal.myBlocked?.length ?? "\u2014"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3" role="group" aria-label={`My Overdue: ${data.personal.myOverdue.length}`}>
          <p className="text-xs text-muted-foreground">My Overdue</p>
          <p className="mt-1 text-2xl font-semibold text-red-500">{data.personal.myOverdue?.length ?? "\u2014"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3" role="group" aria-label={`Completed (7d): ${data.personal.myCompletedWeek}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Completed (7d)</p>
            <SparkLine data={completedSpark} width={56} height={20} />
          </div>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">{data.personal.myCompletedWeek ?? "\u2014"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3" role="group" aria-label={`Team Overdue: ${data.team.overdueTasks}`}>
          <p className="text-xs text-muted-foreground">Team Overdue</p>
          <p className="mt-1 text-2xl font-semibold text-red-500">{data.team.overdueTasks ?? "\u2014"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3" role="group" aria-label={`Task Total: ${taskTotal}`}>
          <p className="text-xs text-muted-foreground">Task Total</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{taskTotal ?? "\u2014"}</p>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2" aria-label="Visual overview">
        <div className="rounded-xl border border-border bg-card p-4" aria-label="My workload chart">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">My Workload</h2>
            <span className="text-xs text-muted-foreground">Read-only summary</span>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <DonutChart
              segments={
                myWorkloadSegments.length > 0
                  ? myWorkloadSegments
                  : [
                      { name: "No tasks", value: 1, color: "hsl(var(--border))" },
                    ]
              }
              size={190}
              centerLabel="Total"
              centerValue={String(
                data.personal.myBlocked.length +
                  data.personal.myOverdue.length +
                  data.personal.myDueSoon.length +
                  data.personal.myActive.length
              )}
              valueFormatter={(v) => String(v)}
            />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Focus</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {[
                  { key: "blocked" as const, label: "Blocked", count: data.personal.myBlocked.length, color: getChartColor(0) },
                  { key: "overdue" as const, label: "Overdue", count: data.personal.myOverdue.length, color: getChartColor(3) },
                  { key: "dueSoon" as const, label: "Due Soon", count: data.personal.myDueSoon.length, color: getChartColor(1) },
                  { key: "active" as const, label: "Active", count: data.personal.myActive.length, color: getChartColor(2) },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setFocusFromLegend(item.key)}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      focusKey === item.key ? "border-primary/60 bg-secondary/50" : "border-border/60 hover:bg-secondary/30"
                    }`}
                    aria-label={`${item.label}: ${item.count}`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                        aria-hidden="true"
                      />
                      <span className="text-foreground">{item.label}</span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">{item.count}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Tip: use Enter/Space to activate focus.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4" aria-label="Team status overview chart">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Team Status Overview</h2>
            <span className="text-xs text-muted-foreground">{taskTotal} tasks</span>
          </div>
          <StackedBarChart
            data={teamStatusChartData}
            xKey="label"
            barKeys={teamStatusKeys}
            height={190}
            stacked
            showLegend={false}
            yFormatter={(v) => String(v)}
          />
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
            {teamStatusKeys.map((key, index) => (
              <div key={key} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5">
                <span className="flex items-center gap-2 truncate">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getChartColor(index) }} aria-hidden="true" />
                  <span className="truncate">{key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bId\b/g, "ID")}</span>
                </span>
                <span className="tabular-nums text-foreground">{data.team.taskStatusOverview[key] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4" aria-label="Recommended next actions">
        <div className="mb-3 flex items-center gap-2">
          <Flame className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Recommended Next Actions</h2>
        </div>
        {(data.personal.recommendations?.length ?? 0) === 0 ? (
          <p className="text-xs text-muted-foreground">No urgent recommendations right now.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {data.personal.recommendations.map((task) => (
              <div
                key={task.id}
                aria-label={task.title}
                className="rounded-lg border border-border/60 px-3 py-2"
              >
                <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Score {task.recommendationScore ?? 0} · {task.priority} · {relativeDate(task.dueDate)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div ref={focusRef} className="grid grid-cols-1 gap-4 lg:grid-cols-2" role="region" aria-label="Focused task list">
        {focusConfig ? (
          <TaskList
            title={focusConfig.title}
            items={focusConfig.items}
            empty={focusConfig.empty}
            maxItems={10}
          />
        ) : null}
        {focusKey !== "dueSoon" && (
          <TaskList
            title="My Due Soon"
            items={data.personal.myDueSoon}
            empty="No due-soon tasks."
            maxItems={6}
          />
        )}
      </div>

      <section className="rounded-xl border border-border bg-card p-4" aria-label="Team and project context">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Team and Project Context</h2>
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> Stale Tasks</div>
            <p className="mt-1 text-lg font-semibold text-foreground">{data.team.staleTasks ?? "\u2014"}</p>
          </div>
          <div className="rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Blocked Tasks</div>
            <p className="mt-1 text-lg font-semibold text-foreground">{data.team.blockedTasks ?? "\u2014"}</p>
          </div>
          <div className="rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" /> Overdue Tasks</div>
            <p className="mt-1 text-lg font-semibold text-foreground">{data.team.overdueTasks ?? "\u2014"}</p>
          </div>
        </div>

        {(data.projects.active?.length ?? 0) > 0 && (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
            {data.projects.active.map((project) => (
              <div
                key={project.id}
                className="rounded-lg border border-border/60 px-3 py-2"
              >
                <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {project.doneTasks ?? 0}/{project.totalTasks ?? 0} done
                </p>
                <div className="mt-2 h-1.5 w-full rounded-full bg-secondary" role="progressbar" aria-valuenow={project.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${project.name} progress`}>
                  <div
                    className="h-1.5 rounded-full bg-primary"
                    style={{ width: `${project.progress ?? 0}%` }}
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
