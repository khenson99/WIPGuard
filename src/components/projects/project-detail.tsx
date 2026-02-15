"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Circle,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  ListTodo,
  Pencil,
  Check,
  X,
  Plus,
  Trash2,
  Save,
} from "lucide-react";
import { COLUMN_LABELS } from "@/types";
import type { UserSummary, TaskStatus as TStatus } from "@/types";

/* ---------- data types ---------- */

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
  departmentId: string | null;
  companyPriorityId: string | null;
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

interface RefOption {
  id: string;
  name: string;
  color?: string | null;
}

/* ---------- colour maps ---------- */

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#22c55e",
  ON_HOLD: "#eab308",
  COMPLETED: "#3b82f6",
  ARCHIVED: "#64748b",
};

const TASK_STATUS_COLORS: Record<string, string> = {
  BACKLOG: "#94a3b8",
  QUEUED: "#a78bfa",
  WORKING_ON_TODAY: "#f59e0b",
  ACTIVE: "#3b82f6",
  NOT_DONE: "#ef4444",
  DONE: "#22c55e",
};

const PRIORITY_STYLES: Record<string, { text: string; bg: string }> = {
  P0: { text: "#ef4444", bg: "#ef444418" },
  P1: { text: "#f97316", bg: "#f9731618" },
  P2: { text: "#eab308", bg: "#eab30818" },
  P3: { text: "#22c55e", bg: "#22c55e18" },
};

const PROJECT_STATUSES = ["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"];
const PROJECT_TYPES = ["ONE_OFF", "RECURRING", "INITIATIVE", "MAINTENANCE"];

/* ---------- helpers ---------- */

function InlineText({
  value,
  onSave,
  className = "",
  tag: Tag = "span",
  multiline = false,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  tag?: "span" | "h1" | "p";
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (editing) {
    const shared =
      "w-full rounded border border-primary/40 bg-card px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
    return (
      <div className="flex items-start gap-1.5">
        {multiline ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className={`${shared} resize-y`}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSave(draft);
                setEditing(false);
              }
              if (e.key === "Escape") {
                setDraft(value);
                setEditing(false);
              }
            }}
            className={shared}
          />
        )}
        <button
          onClick={() => {
            onSave(draft);
            setEditing(false);
          }}
          className="mt-0.5 rounded p-1 text-green-500 hover:bg-green-500/10"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => {
            setDraft(value);
            setEditing(false);
          }}
          className="mt-0.5 rounded p-1 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={`group inline-flex items-center gap-1.5 text-left hover:text-primary ${className}`}
      title="Click to edit"
    >
      <Tag className={className}>{value}</Tag>
      <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

function InlineSelect({
  value,
  options,
  onSave,
  colorMap,
}: {
  value: string;
  options: { value: string; label: string }[];
  onSave: (v: string) => void;
  colorMap?: Record<string, string>;
}) {
  const color = colorMap?.[value] || "#64748b";
  return (
    <select
      value={value}
      onChange={(e) => onSave(e.target.value)}
      className="cursor-pointer rounded-full border-0 bg-transparent px-2 py-0.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
      style={{
        backgroundColor: `${color}18`,
        color,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function RaciSection({
  label,
  users,
  teamMembers,
  onUpdate,
}: {
  label: string;
  users: UserSummary[];
  teamMembers: UserSummary[];
  onUpdate: (ids: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const available = teamMembers.filter(
    (m) => !users.some((u) => u.id === m.id)
  );

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {available.length > 0 && (
          <button
            onClick={() => setAdding(!adding)}
            className="rounded p-0.5 text-muted-foreground hover:text-primary"
            title={`Add ${label.toLowerCase()}`}
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>

      {adding && available.length > 0 && (
        <select
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) {
              onUpdate([...users.map((u) => u.id), e.target.value]);
              setAdding(false);
            }
          }}
          className="mb-2 w-full rounded border border-border bg-secondary px-2 py-1 text-xs text-foreground focus:outline-none"
        >
          <option value="">Select member…</option>
          {available.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name || m.email}
            </option>
          ))}
        </select>
      )}

      {users.length > 0 ? (
        <div className="space-y-1.5">
          {users.map((u) => (
            <div
              key={u.id}
              className="group flex items-center gap-2 text-sm text-foreground"
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
                  (u.name || u.email || "?").charAt(0).toUpperCase()
                )}
              </div>
              <span className="flex-1 truncate">{u.name || u.email}</span>
              <button
                onClick={() =>
                  onUpdate(users.filter((x) => x.id !== u.id).map((x) => x.id))
                }
                className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                title="Remove"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs italic text-muted-foreground">None assigned</p>
      )}
    </div>
  );
}

/* ============================================================
   Main component
   ============================================================ */

export function ProjectDetail({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [taskFilter, setTaskFilter] = useState<string>("");

  // Reference data for dropdowns
  const [departments, setDepartments] = useState<RefOption[]>([]);
  const [priorities, setPriorities] = useState<RefOption[]>([]);
  const [teamMembers, setTeamMembers] = useState<UserSummary[]>([]);

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

  const fetchRefData = useCallback(async () => {
    const [dRes, pRes, tRes] = await Promise.all([
      fetch("/api/departments"),
      fetch("/api/priorities"),
      fetch("/api/team"),
    ]);
    if (dRes.ok) setDepartments(await dRes.json());
    if (pRes.ok) setPriorities(await pRes.json());
    if (tRes.ok) setTeamMembers(await tRes.json());
  }, []);

  useEffect(() => {
    fetchProject();
    fetchRefData();
  }, [fetchProject, fetchRefData]);

  /* auto-save helper */
  const patchProject = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!project) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/projects/${project.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          // Re-fetch to get fully populated response
          await fetchProject();
        }
      } catch {
        // ignore
      } finally {
        setSaving(false);
      }
    },
    [project, fetchProject]
  );

  /* computed */
  const filteredTasks = useMemo(() => {
    if (!project) return [];
    if (!taskFilter) return project.tasks;
    return project.tasks.filter((t) => t.status === taskFilter);
  }, [project, taskFilter]);

  const metrics = useMemo(() => {
    if (!project) return { total: 0, done: 0, pct: 0, blocked: 0, overdue: 0 };
    const counts = project.taskStatusCounts || {};
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    const done = (counts["DONE"] || 0);
    const blocked = counts["NOT_DONE"] || 0;
    const now = new Date();
    const overdue = project.tasks.filter(
      (t) =>
        t.dueDate &&
        new Date(t.dueDate) < now &&
        t.status !== "DONE",
    ).length;
    return {
      total,
      done,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
      blocked,
      overdue,
    };
  }, [project]);

  /* loading / error */
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

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/projects")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All Projects
        </button>
        {saving && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Save className="h-3 w-3 animate-pulse" />
            Saving…
          </span>
        )}
      </div>

      {/* ======= Header – editable ======= */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* Name */}
          <div className="mb-1 flex items-center gap-3">
            <InlineText
              value={project.name}
              onSave={(v) => patchProject({ name: v })}
              className="text-xl font-bold text-foreground"
              tag="h1"
            />

            {/* Status dropdown */}
            <InlineSelect
              value={project.status}
              options={PROJECT_STATUSES.map((s) => ({
                value: s,
                label: s.replace("_", " "),
              }))}
              onSave={(v) => patchProject({ status: v })}
              colorMap={STATUS_COLORS}
            />
          </div>

          {/* Description */}
          <div className="mb-2 max-w-2xl">
            <InlineText
              value={project.description || "Add a description…"}
              onSave={(v) =>
                patchProject({
                  description: v === "Add a description…" ? null : v,
                })
              }
              className="text-sm text-muted-foreground"
              tag="p"
              multiline
            />
          </div>

          {/* Meta row — editable */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {/* Department */}
            <div className="flex items-center gap-1.5">
              {project.department?.color && (
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: project.department.color }}
                />
              )}
              <select
                value={project.department?.id || ""}
                onChange={(e) =>
                  patchProject({ departmentId: e.target.value || null })
                }
                className="cursor-pointer rounded border border-border bg-secondary px-2 py-0.5 text-xs text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">No Department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Company Priority */}
            <div className="flex items-center gap-1.5">
              {project.companyPriority?.color && (
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: project.companyPriority.color }}
                />
              )}
              <select
                value={project.companyPriority?.id || ""}
                onChange={(e) =>
                  patchProject({ companyPriorityId: e.target.value || null })
                }
                className="cursor-pointer rounded border border-border bg-secondary px-2 py-0.5 text-xs text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">No Priority</option>
                {priorities.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Project Type */}
            <InlineSelect
              value={project.projectType}
              options={PROJECT_TYPES.map((t) => ({
                value: t,
                label: t.replace("_", "-").toLowerCase(),
              }))}
              onSave={(v) => patchProject({ projectType: v })}
            />
          </div>
        </div>
      </div>

      {/* ======= Metrics row ======= */}
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

      {/* ======= Task distribution bar ======= */}
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

      {/* ======= RACI + Tasks ======= */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* RACI panel — editable */}
        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-1">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4" />
            Team (RACI)
          </h3>
          <div className="space-y-4">
            <RaciSection
              label="Sponsor"
              users={project.sponsor}
              teamMembers={teamMembers}
              onUpdate={(ids) => patchProject({ sponsorIds: ids })}
            />
            <RaciSection
              label="Responsible"
              users={project.responsible}
              teamMembers={teamMembers}
              onUpdate={(ids) => patchProject({ responsibleIds: ids })}
            />
            <RaciSection
              label="Accountable"
              users={project.accountable}
              teamMembers={teamMembers}
              onUpdate={(ids) => patchProject({ accountableIds: ids })}
            />
            <RaciSection
              label="Consulted"
              users={project.consulted}
              teamMembers={teamMembers}
              onUpdate={(ids) => patchProject({ consultedIds: ids })}
            />
            <RaciSection
              label="Informed"
              users={project.informed}
              teamMembers={teamMembers}
              onUpdate={(ids) => patchProject({ informedIds: ids })}
            />
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

      {/* ======= Sub-projects ======= */}
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
