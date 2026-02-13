"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Trash2,
  ChevronRight,
  Plus,
  GitBranch,
  Link2,
  ChevronDown,
  ChevronUp,
  Check,
} from "lucide-react";
import { useBoardStore } from "@/store/board-store";
import type {
  TaskWithRelations,
  TaskStatus,
  Priority,
  DifficultyLevel,
} from "@/types";
import {
  COLUMN_LABELS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  STATUS_COLORS,
} from "@/types";

interface TaskModalProps {
  task: TaskWithRelations | null;
  onClose: () => void;
}

/* ─── Shared inline-style helpers ─── */
const labelStyle: React.CSSProperties = {
  color: "var(--muted-foreground)",
};

const inputStyle: React.CSSProperties = {
  background: "var(--secondary)",
  borderColor: "var(--border)",
  color: "var(--foreground)",
};

const inputFocusClass =
  "w-full rounded-md border px-3 py-2 text-sm focus:outline-none";

const sectionStyle: React.CSSProperties = {
  background: "var(--background)",
  borderColor: "var(--border)",
};

function MultiSelectRaci({
  label,
  selectedIds,
  teamMembers,
  onChange,
}: {
  label: string;
  selectedIds: string[];
  teamMembers: { id: string; name: string | null; email: string }[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((sid) => sid !== id)
        : [...selectedIds, id]
    );
  };

  return (
    <div className="relative">
      <label className="mb-1 block text-xs font-medium" style={labelStyle}>
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors"
        style={{
          ...inputStyle,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--card-hover-border)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--border)";
        }}
      >
        <span className="truncate">
          {selectedIds.length === 0
            ? "None"
            : selectedIds
                .map((id) => {
                  const m = teamMembers.find((t) => t.id === id);
                  return m?.name || m?.email || id;
                })
                .join(", ")}
        </span>
        {open ? (
          <ChevronUp
            className="ml-2 h-3.5 w-3.5 flex-shrink-0"
            style={{ color: "var(--muted-foreground)" }}
          />
        ) : (
          <ChevronDown
            className="ml-2 h-3.5 w-3.5 flex-shrink-0"
            style={{ color: "var(--muted-foreground)" }}
          />
        )}
      </button>

      {open && (
        <div
          className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border py-1"
          style={{
            background: "var(--popover)",
            borderColor: "var(--border)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {teamMembers.map((m) => {
            const selected = selectedIds.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
                style={{
                  background: selected
                    ? "var(--accent-light)"
                    : "transparent",
                  color: selected
                    ? "var(--primary)"
                    : "var(--foreground)",
                }}
                onMouseEnter={(e) => {
                  if (!selected) {
                    e.currentTarget.style.background = "var(--secondary)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = selected
                    ? "var(--accent-light)"
                    : "transparent";
                }}
              >
                <div
                  className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border"
                  style={{
                    borderColor: selected
                      ? "var(--primary)"
                      : "var(--border)",
                    background: selected
                      ? "var(--primary)"
                      : "var(--secondary)",
                  }}
                >
                  {selected && (
                    <Check
                      className="h-3 w-3"
                      style={{ color: "var(--primary-foreground)" }}
                    />
                  )}
                </div>
                <span className="truncate">{m.name || m.email}</span>
              </button>
            );
          })}
          {teamMembers.length === 0 && (
            <p
              className="px-3 py-2 text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              No team members
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function TaskModal({ task, onClose }: TaskModalProps) {
  const { projects, sprints, teamMembers } = useBoardStore();
  const isNew = !task;

  // Full task detail (with children, deps, etc.) fetched from /api/tasks/[id]
  const [detail, setDetail] = useState<TaskWithRelations | null>(task);
  const [allTasks, setAllTasks] = useState<
    { id: string; title: string; status: TaskStatus }[]
  >([]);

  const [form, setForm] = useState({
    title: task?.title || "",
    notes: task?.notes || "",
    status: task?.status || ("BACKLOG" as TaskStatus),
    priority: task?.priority || ("P2" as Priority),
    degreeOfDifficulty:
      task?.degreeOfDifficulty || ("MEDIUM" as DifficultyLevel),
    projectId: task?.projectId || "",
    sprintId: task?.sprintId || "",
    parentId: task?.parentId || "",
    startDate: task?.startDate?.split("T")[0] || "",
    dueDate: task?.dueDate?.split("T")[0] || "",
    unplanned: task?.unplanned || false,
    slackThread: task?.slackThread || "",
    responsibleId: task?.responsible?.[0]?.id || "",
    accountableId: task?.accountable?.[0]?.id || "",
    consultedIds: task?.consulted?.map((u) => u.id) || [],
    informedIds: task?.informed?.map((u) => u.id) || [],
    dependsOnIds: task?.dependsOn?.map((d) => d.id) || [],
  });

  const [saving, setSaving] = useState(false);
  const [showSubtaskForm, setShowSubtaskForm] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [creatingSub, setCreatingSub] = useState(false);
  const [showDeps, setShowDeps] = useState(false);

  // Fetch full task detail for existing tasks
  const fetchDetail = useCallback(async () => {
    if (!task?.id) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}`);
      if (res.ok) {
        const data = await res.json();
        setDetail(data);
        setForm((prev) => ({
          ...prev,
          dependsOnIds: data.dependsOn?.map((d: { id: string }) => d.id) || [],
        }));
      }
    } catch {
      // ignore
    }
  }, [task?.id]);

  // Fetch all tasks for dependency picker
  const fetchAllTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = await res.json();
        setAllTasks(
          data.map((t: { id: string; title: string; status: TaskStatus }) => ({
            id: t.id,
            title: t.title,
            status: t.status,
          }))
        );
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchDetail();
    fetchAllTasks();
  }, [fetchDetail, fetchAllTasks]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = isNew ? "/api/tasks" : `/api/tasks/${task!.id}`;
      const method = isNew ? "POST" : "PATCH";

      const { responsibleId, accountableId, ...rest } = form;
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...rest,
          expectedUpdatedAt: detail?.updatedAt || task?.updatedAt,
          responsibleIds: responsibleId ? [responsibleId] : [],
          accountableIds: accountableId ? [accountableId] : [],
          projectId: form.projectId || null,
          sprintId: form.sprintId || null,
          parentId: form.parentId || null,
          startDate: form.startDate || null,
          dueDate: form.dueDate || null,
          slackThread: form.slackThread || null,
        }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          const conflict = await response.json().catch(() => null);
          window.alert(
            conflict?.conflict?.message ||
              conflict?.error ||
              "Task changed before save was applied. Refresh and retry."
          );
        }
        return;
      }

      onClose();
    } catch (err) {
      console.error("Failed to save task:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    if (!confirm("Delete this task?")) return;

    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    onClose();
  };

  const handleAdvance = async () => {
    if (!task) return;
    const response = await fetch(`/api/tasks/${task.id}/advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedUpdatedAt: detail?.updatedAt || task.updatedAt,
      }),
    });
    if (!response.ok && response.status === 409) {
      const conflict = await response.json().catch(() => null);
      window.alert(
        conflict?.conflict?.message ||
          conflict?.error ||
          "Task changed before advance was applied. Refresh and retry."
      );
    }
    onClose();
  };

  // Create subtask with RACI inheritance from parent
  const handleCreateSubtask = async () => {
    if (!subtaskTitle.trim() || !task) return;
    setCreatingSub(true);
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: subtaskTitle.trim(),
          parentId: task.id,
          projectId: task.projectId || null,
          sprintId: task.sprintId || null,
          priority: task.priority,
          status: "BACKLOG",
          // RACI inheritance from parent
          responsibleIds: task.responsible?.[0]?.id ? [task.responsible[0].id] : [],
          accountableIds: task.accountable?.[0]?.id ? [task.accountable[0].id] : [],
          consultedIds: task.consulted?.map((u) => u.id) || [],
          informedIds: task.informed?.map((u) => u.id) || [],
        }),
      });

      setSubtaskTitle("");
      setShowSubtaskForm(false);
      fetchDetail();
    } catch {
      // ignore
    } finally {
      setCreatingSub(false);
    }
  };

  // Toggle a dependency
  const toggleDep = (depId: string) => {
    setForm((prev) => {
      const has = prev.dependsOnIds.includes(depId);
      return {
        ...prev,
        dependsOnIds: has
          ? prev.dependsOnIds.filter((id) => id !== depId)
          : [...prev.dependsOnIds, depId],
      };
    });
  };

  // Filter tasks for dependency picker (exclude self and children)
  const childIds = new Set(detail?.children?.map((c) => c.id) || []);
  const depCandidates = allTasks.filter(
    (t) => t.id !== task?.id && !childIds.has(t.id)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
      style={{ background: "rgba(0, 0, 0, 0.6)" }}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border"
        style={{
          background: "var(--card)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--foreground)" }}
          >
            {isNew ? "New Task" : "Edit Task"}
          </h2>
          <div className="flex items-center gap-2">
            {!isNew && task!.status !== "DONE" && (
              <button
                onClick={handleAdvance}
                className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: "var(--secondary)",
                  color: "var(--primary)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--accent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--secondary)";
                }}
              >
                <ChevronRight className="h-3.5 w-3.5" />
                Advance
              </button>
            )}
            {!isNew && (
              <button
                onClick={handleDelete}
                className="rounded-md p-2 transition-colors"
                style={{ color: "var(--muted-foreground)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--secondary)";
                  e.currentTarget.style.color = "var(--destructive)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--muted-foreground)";
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-md p-2 transition-colors"
              style={{ color: "var(--muted-foreground)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--secondary)";
                e.currentTarget.style.color = "var(--foreground)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--muted-foreground)";
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-5 px-6 py-5">
          {/* Title */}
          <div>
            <label className="mb-1 block text-xs font-medium" style={labelStyle}>
              Title
            </label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={inputFocusClass}
              style={{
                ...inputStyle,
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--ring)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
              }}
              placeholder="Task title"
              autoFocus
            />
          </div>

          {/* Status + Priority + Difficulty row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium" style={labelStyle}>
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as TaskStatus })
                }
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={inputStyle}
              >
                {Object.entries(COLUMN_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={labelStyle}>
                Priority
              </label>
              <select
                value={form.priority}
                onChange={(e) =>
                  setForm({ ...form, priority: e.target.value as Priority })
                }
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={inputStyle}
              >
                {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={labelStyle}>
                Difficulty
              </label>
              <select
                value={form.degreeOfDifficulty}
                onChange={(e) =>
                  setForm({
                    ...form,
                    degreeOfDifficulty: e.target.value as DifficultyLevel,
                  })
                }
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={inputStyle}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="EPIC">Epic</option>
              </select>
            </div>
          </div>

          {/* Project + Sprint row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium" style={labelStyle}>
                Project
              </label>
              <select
                value={form.projectId}
                onChange={(e) =>
                  setForm({ ...form, projectId: e.target.value })
                }
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={inputStyle}
              >
                <option value="">No Project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={labelStyle}>
                Sprint
              </label>
              <select
                value={form.sprintId}
                onChange={(e) =>
                  setForm({ ...form, sprintId: e.target.value })
                }
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={inputStyle}
              >
                <option value="">No Sprint</option>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Parent Task */}
          <div>
            <label className="mb-1 block text-xs font-medium" style={labelStyle}>
              Parent Task
            </label>
            <select
              value={form.parentId}
              onChange={(e) => setForm({ ...form, parentId: e.target.value })}
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={inputStyle}
            >
              <option value="">No Parent (top-level)</option>
              {allTasks
                .filter((t) => t.id !== task?.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
            </select>
          </div>

          {/* Subtasks Section (only for existing tasks) */}
          {!isNew && (
            <div className="rounded-lg border p-4" style={sectionStyle}>
              <div className="flex items-center justify-between">
                <h3
                  className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  Subtasks
                  {detail?.children && detail.children.length > 0 && (
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        background: "var(--tag-bg)",
                        color: "var(--muted-foreground)",
                      }}
                    >
                      {detail.children.length}
                    </span>
                  )}
                </h3>
                <button
                  onClick={() => setShowSubtaskForm(!showSubtaskForm)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors"
                  style={{ color: "var(--primary)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--secondary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <Plus className="h-3 w-3" />
                  Add Subtask
                </button>
              </div>

              {/* Subtask creation form */}
              {showSubtaskForm && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    value={subtaskTitle}
                    onChange={(e) => setSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateSubtask();
                      if (e.key === "Escape") {
                        setShowSubtaskForm(false);
                        setSubtaskTitle("");
                      }
                    }}
                    placeholder="Subtask title... (inherits RACI)"
                    className="flex-1 rounded-md border px-3 py-1.5 text-sm focus:outline-none"
                    style={inputStyle}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--ring)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "var(--border)";
                    }}
                    autoFocus
                  />
                  <button
                    onClick={handleCreateSubtask}
                    disabled={creatingSub || !subtaskTitle.trim()}
                    className="rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    style={{
                      background: "var(--primary)",
                      color: "var(--primary-foreground)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--primary-hover)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "var(--primary)";
                    }}
                  >
                    {creatingSub ? "..." : "Add"}
                  </button>
                </div>
              )}

              {/* Subtask list */}
              {detail?.children && detail.children.length > 0 ? (
                <div className="mt-3 space-y-1">
                  {detail.children.map((child) => (
                    <div
                      key={child.id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--secondary)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ background: STATUS_COLORS[child.status] }}
                      />
                      <span
                        className="flex-1"
                        style={{ color: "var(--foreground)" }}
                      >
                        {child.title}
                      </span>
                      <span
                        className="text-[10px] font-medium"
                        style={{ color: PRIORITY_COLORS[child.priority] }}
                      >
                        {child.priority}
                      </span>
                      <span
                        className="text-[10px]"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {COLUMN_LABELS[child.status]}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                !showSubtaskForm && (
                  <p
                    className="mt-2 text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    No subtasks yet
                  </p>
                )
              )}
            </div>
          )}

          {/* Dependencies Section */}
          <div className="rounded-lg border p-4" style={sectionStyle}>
            <button
              type="button"
              onClick={() => setShowDeps(!showDeps)}
              className="flex w-full items-center justify-between"
            >
              <h3
                className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                <Link2 className="h-3.5 w-3.5" />
                Dependencies
                {form.dependsOnIds.length > 0 && (
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      background: "var(--tag-bg)",
                      color: "var(--muted-foreground)",
                    }}
                  >
                    {form.dependsOnIds.length}
                  </span>
                )}
              </h3>
              {showDeps ? (
                <ChevronUp
                  className="h-4 w-4"
                  style={{ color: "var(--muted-foreground)" }}
                />
              ) : (
                <ChevronDown
                  className="h-4 w-4"
                  style={{ color: "var(--muted-foreground)" }}
                />
              )}
            </button>

            {/* Current dependencies summary (always visible) */}
            {!showDeps && form.dependsOnIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {form.dependsOnIds.map((depId) => {
                  const depTask = allTasks.find((t) => t.id === depId);
                  return (
                    <span
                      key={depId}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
                      style={{
                        background: "var(--tag-bg)",
                        color: "var(--muted-foreground)",
                      }}
                    >
                      <div
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          background: depTask
                            ? STATUS_COLORS[depTask.status]
                            : "var(--muted-foreground)",
                        }}
                      />
                      {depTask?.title || depId}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Expanded dependency picker */}
            {showDeps && (
              <div className="mt-3 space-y-3">
                {/* Depends on */}
                <div>
                  <p
                    className="mb-1 text-[11px] font-medium"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    This task depends on:
                  </p>
                  <div className="max-h-36 space-y-0.5 overflow-y-auto">
                    {depCandidates.map((t) => {
                      const isSelected = form.dependsOnIds.includes(t.id);
                      return (
                        <label
                          key={t.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm transition-colors"
                          style={{
                            background: isSelected
                              ? "var(--accent-light)"
                              : "transparent",
                            color: isSelected
                              ? "var(--primary)"
                              : "var(--muted-foreground)",
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.background = "var(--secondary)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = isSelected
                              ? "var(--accent-light)"
                              : "transparent";
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleDep(t.id)}
                            className="rounded"
                            style={{
                              borderColor: "var(--border)",
                              accentColor: "var(--primary)",
                            }}
                          />
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ background: STATUS_COLORS[t.status] }}
                          />
                          <span className="flex-1 truncate">{t.title}</span>
                          <span
                            className="text-[10px]"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {COLUMN_LABELS[t.status]}
                          </span>
                        </label>
                      );
                    })}
                    {depCandidates.length === 0 && (
                      <p
                        className="py-2 text-center text-xs"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        No other tasks available
                      </p>
                    )}
                  </div>
                </div>

                {/* Depended by (read-only) */}
                {detail?.dependedBy && detail.dependedBy.length > 0 && (
                  <div>
                    <p
                      className="mb-1 text-[11px] font-medium"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Blocks these tasks:
                    </p>
                    <div className="space-y-0.5">
                      {detail.dependedBy.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center gap-2 rounded px-2 py-1 text-sm"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ background: STATUS_COLORS[t.status] }}
                          />
                          <span className="truncate">{t.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium" style={labelStyle}>
                Start Date
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) =>
                  setForm({ ...form, startDate: e.target.value })
                }
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={labelStyle}>
                Due Date
              </label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={inputStyle}
              />
            </div>
          </div>

          {/* RACI Assignments */}
          <div className="space-y-3">
            <h3
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--muted-foreground)" }}
            >
              RACI Assignments
            </h3>

            {/* R + A: single-select dropdowns */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium" style={labelStyle}>
                  Responsible
                </label>
                <select
                  value={form.responsibleId}
                  onChange={(e) =>
                    setForm({ ...form, responsibleId: e.target.value })
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  style={inputStyle}
                >
                  <option value="">None</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" style={labelStyle}>
                  Accountable
                </label>
                <select
                  value={form.accountableId}
                  onChange={(e) =>
                    setForm({ ...form, accountableId: e.target.value })
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  style={inputStyle}
                >
                  <option value="">None</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* C + I: multi-select with checkboxes */}
            {(
              [
                ["consultedIds", "Consulted"],
                ["informedIds", "Informed"],
              ] as const
            ).map(([field, label]) => (
              <MultiSelectRaci
                key={field}
                label={label}
                selectedIds={form[field]}
                teamMembers={teamMembers}
                onChange={(ids) => setForm({ ...form, [field]: ids })}
              />
            ))}
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium" style={labelStyle}>
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={4}
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none"
              style={inputStyle}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--ring)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
              }}
              placeholder="Task notes..."
            />
          </div>

          {/* Unplanned checkbox + Slack thread */}
          <div className="grid grid-cols-2 gap-3">
            <label
              className="flex items-center gap-2 text-sm"
              style={{ color: "var(--foreground)" }}
            >
              <input
                type="checkbox"
                checked={form.unplanned}
                onChange={(e) =>
                  setForm({ ...form, unplanned: e.target.checked })
                }
                className="rounded"
                style={{
                  borderColor: "var(--border)",
                  accentColor: "var(--primary)",
                }}
              />
              Unplanned work
            </label>
            <div>
              <label className="mb-1 block text-xs font-medium" style={labelStyle}>
                Slack Thread
              </label>
              <input
                value={form.slackThread}
                onChange={(e) =>
                  setForm({ ...form, slackThread: e.target.value })
                }
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={inputStyle}
                placeholder="https://slack.com/..."
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 border-t px-6 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm transition-colors"
            style={{ color: "var(--muted-foreground)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--foreground)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--muted-foreground)";
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.title.trim()}
            className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{
              background: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--primary-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--primary)";
            }}
          >
            {saving ? "Saving..." : isNew ? "Create Task" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
