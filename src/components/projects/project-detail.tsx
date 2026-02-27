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
  ChevronDown,
} from "lucide-react";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";
import { COLUMN_LABELS } from "@/types";
import type { UserSummary, TaskStatus as TStatus } from "@/types";
/* Simple inline toast since sonner isn't installed */
function useToast() {
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: "success" | "error" }>>([]);
  const nextId = useRef(0);

  const show = useCallback((message: string, type: "success" | "error") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2500);
  }, []);

  const success = useCallback((msg: string) => show(msg, "success"), [show]);
  const error = useCallback((msg: string) => show(msg, "error"), [show]);

  const ToastContainer = useCallback(() => (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-lg px-4 py-2 text-sm font-medium shadow-lg transition-opacity ${
            t.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  ), [toasts]);

  return { success, error, ToastContainer };
}

/* ─── Types ─────────────────────────────────────────────────────────── */

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

interface DeptOption {
  id: string;
  name: string;
  color: string | null;
}

interface PriorityOption {
  id: string;
  name: string;
  color: string | null;
}

/* ─── Constants ─────────────────────────────────────────────────────── */

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#22c55e",
  ON_HOLD: "#eab308",
  COMPLETED: "#3b82f6",
  ARCHIVED: "#64748b",
};

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
];

const TYPE_OPTIONS = [
  { value: "RECURRING", label: "Recurring" },
  { value: "PERPETUAL", label: "Perpetual" },
  { value: "ONE_OFF", label: "One-Off" },
];

const TASK_STATUS_COLORS: Record<string, string> = {
  BACKLOG: "#94a3b8",
  QUEUED: "#a78bfa",
  WORKING_ON_TODAY: "#f59e0b",
  ACTIVE: "#3b82f6",
  NOT_DONE: "#ef4444",
  DONE: "#22c55e",
};

const PRIORITY_STYLES: Record<string, { text: string; bg: string }> = {
  CRITICAL: { text: "#ef4444", bg: "#ef444418" },
  HIGH: { text: "#f97316", bg: "#f9731618" },
  MEDIUM: { text: "#eab308", bg: "#eab30818" },
  LOW: { text: "#22c55e", bg: "#22c55e18" },
};

const RACI_ROLES = [
  { key: "sponsor", label: "Sponsor", field: "sponsorIds" },
  { key: "responsible", label: "Responsible", field: "responsibleIds" },
  { key: "accountable", label: "Accountable", field: "accountableIds" },
  { key: "consulted", label: "Consulted", field: "consultedIds" },
  { key: "informed", label: "Informed", field: "informedIds" },
] as const;

/* ─── Inline edit helpers ───────────────────────────────────────────── */

function InlineText({
  value,
  onSave,
  className,
  as: Tag = "span",
  multiline,
  placeholder,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  as?: "span" | "h1" | "p";
  multiline?: boolean;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setDraft(value);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return multiline ? (
      <div className="flex items-start gap-1.5">
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit();
            }
          }}
          rows={3}
          className="flex-1 resize-none rounded-md border border-primary/40 bg-card px-2 py-1 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/30"
        />
      </div>
    ) : (
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
          className={`flex-1 rounded-md border border-primary/40 bg-card px-2 py-0.5 text-foreground outline-none focus:ring-1 focus:ring-primary/30 ${className || ""}`}
        />
      </div>
    );
  }

  return (
    <Tag
      onClick={() => setEditing(true)}
      className={`group cursor-pointer rounded-md px-1 -mx-1 transition-colors hover:bg-secondary ${className || ""}`}
      title="Click to edit"
    >
      {value || (
        <span className="italic text-muted-foreground">
          {placeholder || "Click to add…"}
        </span>
      )}
      <Pencil className="ml-1.5 inline h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Tag>
  );
}

function InlineSelect({
  value,
  options,
  onSave,
  renderValue,
}: {
  value: string;
  options: { value: string; label: string }[];
  onSave: (v: string) => void;
  renderValue?: (v: string) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="group flex items-center gap-1 rounded-md px-1 -mx-1 transition-colors hover:bg-secondary"
        title="Click to change"
      >
        {renderValue ? renderValue(value) : (selected?.label || value)}
        <ChevronDown className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[140px] rounded-lg border border-border bg-card p-1 shadow-lg">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                if (opt.value !== value) onSave(opt.value);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                opt.value === value
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground hover:bg-secondary"
              }`}
            >
              {opt.value === value && <Check className="h-3 w-3" />}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserChip({
  user,
  onRemove,
}: {
  user: UserSummary;
  onRemove?: () => void;
}) {
  return (
    <div className="group flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-xs text-foreground">
      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-card text-[8px] font-medium">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            className="h-full w-full rounded-full"
          />
        ) : (
          (user.name || user.email || "?").charAt(0).toUpperCase()
        )}
      </div>
      <span className="truncate max-w-[100px]">
        {user.name || user.email}
      </span>
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          title="Remove"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}

function UserPicker({
  allUsers,
  currentIds,
  onAdd,
}: {
  allUsers: UserSummary[];
  currentIds: string[];
  onAdd: (userId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const available = allUsers.filter(
    (u) =>
      !currentIds.includes(u.id) &&
      (u.name?.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        title="Add user"
      >
        <Plus className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-card p-2 shadow-lg">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search team…"
            className="mb-1.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/30"
            autoFocus
          />
          <div className="max-h-36 overflow-y-auto space-y-0.5">
            {available.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">
                No users available
              </p>
            ) : (
              available.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    onAdd(u.id);
                    setSearch("");
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-secondary"
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[9px] font-medium">
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
                  <span className="truncate">{u.name || u.email}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════════ */

export function ProjectDetail({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  // Reference data for dropdowns
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [priorities, setPriorities] = useState<PriorityOption[]>([]);
  const [teamUsers, setTeamUsers] = useState<UserSummary[]>([]);
  const cacheKey = `dashboard:project-detail:v1:${projectId}`;

  const fetchProject = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { signal });
      if (res.ok) {
        const payload = (await res.json()) as ProjectFull;
        if (signal?.aborted) return;
        setProject(payload);
        writeSessionCache<ProjectFull>(cacheKey, payload);
      } else if (!signal?.aborted) {
        setError("Failed to load project");
      }
    } catch (err) {
      if (!signal?.aborted) {
        console.error(err);
        setError("Failed to load project");
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [cacheKey, projectId]);

  // Fetch reference data
  useEffect(() => {
    Promise.all([
      fetch("/api/departments").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/priorities").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/team").then((r) => (r.ok ? r.json() : [])),
    ]).then(([depts, pris, team]) => {
      setDepartments(Array.isArray(depts) ? depts : []);
      setPriorities(Array.isArray(pris) ? pris : []);
      setTeamUsers(
        Array.isArray(team)
          ? team.map((u: UserSummary & { role?: string }) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              image: u.image,
            }))
          : []
      );
    });
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const cached = readSessionCache<ProjectFull>(cacheKey);

    if (cached) {
      queueMicrotask(() => {
        if (!active) return;
        setProject(cached);
        setLoading(false);
      });
    } else {
      queueMicrotask(() => {
        if (!active) return;
        setLoading(true);
      });
    }

    void fetchProject(controller.signal);

    return () => {
      active = false;
      controller.abort();
    };
  }, [cacheKey, fetchProject]);

  /* ── Patch helper ────────────────────────────────────────────────── */

  const patchProject = useCallback(
    async (data: Record<string, unknown>) => {
      if (!project) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error("Failed to save");
        toast.success("Saved");
        // Refetch to get full updated project
        fetchProject();
      } catch {
        toast.error("Failed to save changes");
      } finally {
        setSaving(false);
      }
    },
    [project, projectId, fetchProject, toast]
  );

  /* ── RACI helpers ────────────────────────────────────────────────── */

  const handleAddUser = useCallback(
    (role: string, field: string, userId: string) => {
      if (!project) return;
      const currentIds = (
        project[role as keyof ProjectFull] as UserSummary[]
      ).map((u) => u.id);
      patchProject({ [field]: [...currentIds, userId] });
    },
    [project, patchProject]
  );

  const handleRemoveUser = useCallback(
    (role: string, field: string, userId: string) => {
      if (!project) return;
      const currentIds = (
        project[role as keyof ProjectFull] as UserSummary[]
      )
        .map((u) => u.id)
        .filter((id) => id !== userId);
      patchProject({ [field]: currentIds });
    },
    [project, patchProject]
  );

  /* ── Computed ────────────────────────────────────────────────────── */

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

  /* ── Loading / Error states ──────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="flex items-center gap-3 rounded-xl border border-red-300 bg-red-50 px-6 py-4 dark:border-red-500/30 dark:bg-red-500/10">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-500" />
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            {error}
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            fetchProject();
          }}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Retry
        </button>
        <button
          onClick={() => router.push("/projects")}
          className="mt-2 text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          Back to projects
        </button>
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

  const deptOptions = departments.map((d) => ({
    value: d.id,
    label: d.name,
  }));
  deptOptions.unshift({ value: "", label: "None" });

  const priOptions = priorities.map((p) => ({
    value: p.id,
    label: p.name,
  }));
  priOptions.unshift({ value: "", label: "None" });

  return (
    <div className="space-y-6">
      {/* Breadcrumb / Back */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/projects")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All Projects
        </button>
        {saving && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
            <div className="h-2 w-2 rounded-full bg-primary animate-ping" />
            Saving…
          </span>
        )}
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <InlineText
              value={project.name}
              onSave={(v) => patchProject({ name: v })}
              className="text-xl font-bold text-foreground"
              as="h1"
            />
            <InlineSelect
              value={project.status}
              options={STATUS_OPTIONS}
              onSave={(v) => patchProject({ status: v })}
              renderValue={(v) => {
                const c = STATUS_COLORS[v] || "#64748b";
                return (
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: `${c}18`, color: c }}
                  >
                    {v.replace("_", " ")}
                  </span>
                );
              }}
            />
          </div>

          <InlineText
            value={project.description || ""}
            onSave={(v) => patchProject({ description: v })}
            className="max-w-2xl text-sm text-muted-foreground"
            as="p"
            multiline
            placeholder="Add a description…"
          />

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {/* Department */}
            <span className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider font-medium">
                Dept:
              </span>
              <InlineSelect
                value={project.department?.id || ""}
                options={deptOptions}
                onSave={(v) =>
                  patchProject({ departmentId: v || null })
                }
                renderValue={(v) => {
                  const dept = departments.find((d) => d.id === v);
                  if (!dept) return <span className="italic">None</span>;
                  return (
                    <span className="flex items-center gap-1">
                      {dept.color && (
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: dept.color }}
                        />
                      )}
                      {dept.name}
                    </span>
                  );
                }}
              />
            </span>

            {/* Priority */}
            <span className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider font-medium">
                Priority:
              </span>
              <InlineSelect
                value={project.companyPriority?.id || ""}
                options={priOptions}
                onSave={(v) =>
                  patchProject({ companyPriorityId: v || null })
                }
                renderValue={(v) => {
                  const pri = priorities.find((p) => p.id === v);
                  if (!pri) return <span className="italic">None</span>;
                  return (
                    <span className="flex items-center gap-1">
                      {pri.color && (
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: pri.color }}
                        />
                      )}
                      {pri.name}
                    </span>
                  );
                }}
              />
            </span>

            {/* Type */}
            <span className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider font-medium">
                Type:
              </span>
              <InlineSelect
                value={project.projectType}
                options={TYPE_OPTIONS}
                onSave={(v) => patchProject({ projectType: v })}
              />
            </span>
          </div>
        </div>
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
        {/* RACI panel — editable */}
        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-1">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4" />
            Team (RACI)
          </h3>
          <div className="space-y-4">
            {RACI_ROLES.map(({ key, label, field }) => {
              const users = project[key as keyof ProjectFull] as UserSummary[];
              return (
                <div key={key}>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {label}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {users.length > 0 ? (
                      users.map((u) => (
                        <UserChip
                          key={u.id}
                          user={u}
                          onRemove={() =>
                            handleRemoveUser(key, field, u.id)
                          }
                        />
                      ))
                    ) : (
                      <span className="text-xs italic text-muted-foreground mr-1.5">
                        None
                      </span>
                    )}
                    <UserPicker
                      allUsers={teamUsers}
                      currentIds={users.map((u) => u.id)}
                      onAdd={(userId) =>
                        handleAddUser(key, field, userId)
                      }
                    />
                  </div>
                </div>
              );
            })}
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
      <toast.ToastContainer />
    </div>
  );
}
