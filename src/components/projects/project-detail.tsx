"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Circle,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  ListTodo,
} from "lucide-react";
import { COLUMN_LABELS } from "@/types";
import type { UserSummary, TaskStatus as TStatus } from "@/types";

interface TaskDetail {
  id: string;
  title: string;
  status: string;
  priority: string;
  responsible: UserSummary[];
  accountable: UserSummary[];
  createdAt: string;
  dueDate: string | null;
}

interface ProjectFull {
  id: string;
  name: string;
  description: string | null;
  status: string;
  projectType: string;
  department: { id: string; name: string; color: string | null } | null;
  companyPriority: { id: string; name: string; color: string | null } | null;
  responsible: UserSummary[];
  accountable: UserSummary[];
  consulted: UserSummary[];
  informed: UserSummary[];
  sponsor: UserSummary[];
  parent: { id: string; name: string } | null;
  children: { id: string; name: string; status: string }[];
  tasks: TaskDetail[];
  taskStatusCounts: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#22c55e",
  ON_HOLD: "#eab308",
  COMPLETED: "#3b82f6",
  ARCHIVED: "#64748b",
};

const TASK_STATUS_COLORS: Record<string, string> = {
  BACKLOG: "#94a3b8",
  READY: "#a78bfa",
  IN_PROGRESS: "#3b82f6",
  REVIEW: "#f59e0b",
  DONE: "#22c55e",
  RELEASED: "#06b6d4",
  BLOCKED: "#ef4444",
};

const PRIORITY_STYLES: Record<string, { text: string; bg: string }> = {
  CRITICAL: { text: "#ef4444", bg: "#ef444418" },
  HIGH: { text: "#f97316", bg: "#f9731618" },
  MEDIUM: { text: "#eab308", bg: "#eab30818" },
  LOW: { text: "#22c55e", bg: "#22c55e18" },
};

export function ProjectDetail({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [taskFilter, setTaskFilter] = useState<string>("");

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (res.ok) setProject(await res.json());
    } catch {
      // Handle silently
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const filteredTasks = useMemo(() => {
    if (!project) return [];
    if (!taskFilter) return project.tasks;
    return project.tasks.filter((t) => t.status === taskFilter);
  }, [project, taskFilter]);

  const metrics = useMemo(() => {
    if (!project) return { total: 0, done: 0, pct: 0, blocked: 0, overdue: 0 };
    const counts = project.taskStatusCounts || {};
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    const done = (counts["DONE"] || 0) + (counts["RELEASED"] || 0);
    const blocked = counts["BLOCKED"] || 0;
    const now = new Date();
    const overdue = project.tasks.filter(
      (t) =>
        t.dueDate &&
        new Date(t.dueDate) < now &&
        t.status !== "DONE" &&
        t.status !== "RELEASED",
    ).length;
    return {
      total,
      done,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
      blocked,
      overdue,
    };
  }, [project]);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">Project not found</p>
        <button
          onClick={() => router.push("/projects")}
          className="mt-4 text-sm text-primary hover:underline"
        >
          Back to projects
        </button>
      </div>
    );
  }

  const statusColor = STATUS_COLORS[project.status] || "#64748b";

  return (
    <div className="space-y-6">
      {/* Breadcrumb / Back */}
      <button
        onClick={() => router.push("/projects")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All Projects
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">
              {project.name}
            </h1>
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: `${statusColor}18`,
                color: statusColor,
              }}
            >
              {project.status.replace("_", " ")}
            </span>
          </div>

          {project.description && (
            <p className="max-w-2xl text-sm text-muted-foreground">
              {project.description}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {project.department && (
              <span className="flex items-center gap-1.5">
                {project.department.color && (
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: project.department.color }}
                  />
                )}
                {project.department.name}
              </span>
            )}
            {project.companyPriority && (
              <span className="flex items-center gap-1.5">
                {project.companyPriority.color && (
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: project.companyPriority.color }}
                  />
                )}
                {project.companyPriority.name}
              </span>
            )}
            <span>
              {project.projectType.replace("_", "-").toLowerCase()}
            </span>
          </div>
        </div>

        <button
          onClick={() => router.push("/settings?tab=projects")}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-secondary"
        >
          Edit Project
        </button>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          {
            label: "Total Tasks",
            value: metrics.total,
            icon: ListTodo,
            color: "var(--primary)",
          },
          {
            label: "Completed",
            value: metrics.done,
            icon: CheckCircle2,
            color: "#22c55e",
          },
          {
            label: "Progress",
            value: `${metrics.pct}%`,
            icon: Circle,
            color: "#3b82f6",
          },
          {
            label: "Blocked",
            value: metrics.blocked,
            icon: AlertTriangle,
            color: "#ef4444",
          },
          {
            label: "Overdue",
            value: metrics.overdue,
            icon: Clock,
            color: "#f97316",
          },
        ].map((m) => (
          <div
            key={m.label}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${m.color}18` }}
            >
              <m.icon className="h-4 w-4" style={{ color: m.color }} />
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{m.value}</p>
              <p className="text-xs text-muted-foreground">{m.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Task status distribution bar */}
      {metrics.total > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Task Distribution
          </h3>
          <div className="flex h-3 overflow-hidden rounded-full bg-border">
            {Object.entries(project.taskStatusCounts || {}).map(
              ([status, count]) => (
                <div
                  key={status}
                  className="h-full transition-all"
                  style={{
                    width: `${(count / metrics.total) * 100}%`,
                    backgroundColor: TASK_STATUS_COLORS[status] || "#64748b",
                  }}
                  title={`${COLUMN_LABELS[status as TStatus] || status}: ${count}`}
                />
              ),
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-3">
            {Object.entries(project.taskStatusCounts || {}).map(
              ([status, count]) => (
                <button
                  key={status}
                  onClick={() =>
                    setTaskFilter((prev) => (prev === status ? "" : status))
                  }
                  className={`flex items-center gap-1.5 rounded px-2 py-0.5 text-xs transition-colors ${
                    taskFilter === status
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{
                      backgroundColor:
                        TASK_STATUS_COLORS[status] || "#64748b",
                    }}
                  />
                  {COLUMN_LABELS[status as TStatus] || status}{" "}
                  <span className="font-medium">({count})</span>
                </button>
              ),
            )}
          </div>
        </div>
      )}

      {/* Two-column: RACI + Tasks */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* RACI panel */}
        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-1">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4" />
            Team (RACI)
          </h3>
          <div className="space-y-4">
            {(
              [
                { label: "Sponsor", users: project.sponsor },
                { label: "Responsible", users: project.responsible },
                { label: "Accountable", users: project.accountable },
                { label: "Consulted", users: project.consulted },
                { label: "Informed", users: project.informed },
              ] as { label: string; users: UserSummary[] }[]
            ).map((group) => (
              <div key={group.label}>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </p>
                {group.users.length > 0 ? (
                  <div className="space-y-1.5">
                    {group.users.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center gap-2 text-sm text-foreground"
                      >
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-[10px] font-medium">
                          {u.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={u.image}
                              alt=""
                              className="h-full w-full rounded-full"
                            />
                          ) : (
                            (u.name || u.email || "?")
                              .charAt(0)
                              .toUpperCase()
                          )}
                        </div>
                        <span className="truncate">
                          {u.name || u.email}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs italic text-muted-foreground">
                    None assigned
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Task list */}
        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ListTodo className="h-4 w-4" />
              Tasks ({filteredTasks.length})
            </h3>
            {taskFilter && (
              <button
                onClick={() => setTaskFilter("")}
                className="text-xs text-primary hover:underline"
              >
                Show all
              </button>
            )}
          </div>

          {filteredTasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {taskFilter ? "No tasks with this status" : "No tasks yet"}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {filteredTasks.map((task) => {
                const pri = PRIORITY_STYLES[task.priority] || {
                  text: "#64748b",
                  bg: "#64748b18",
                };
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 py-2.5"
                  >
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          TASK_STATUS_COLORS[task.status] || "#64748b",
                      }}
                    />
                    <span className="flex-1 truncate text-sm text-foreground">
                      {task.title}
                    </span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ backgroundColor: pri.bg, color: pri.text }}
                    >
                      {task.priority}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {COLUMN_LABELS[task.status as TStatus] || task.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sub-projects */}
      {project.children && project.children.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Sub-Projects
          </h3>
          <div className="space-y-2">
            {project.children.map((child) => (
              <button
                key={child.id}
                onClick={() => router.push(`/projects/${child.id}`)}
                className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-secondary"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor:
                      STATUS_COLORS[child.status] || "#64748b",
                  }}
                />
                <span className="text-foreground">{child.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {child.status.replace("_", " ")}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
