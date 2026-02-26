"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Trash2,
  ChevronRight,
  Plus,
  GitBranch,
  Link2,
  ChevronDown,
  ChevronUp,
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
import { useSession } from "next-auth/react";
import { getSprintLabel } from "@/lib/sprints";

interface TaskModalProps {
  task: TaskWithRelations | null;
  onClose: () => void;
}

function MultiSelectDropdown({
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
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <select
        multiple
        value={selectedIds}
        onChange={(e) => {
          const selected = Array.from(e.target.selectedOptions, (o) => o.value);
          onChange(selected);
        }}
        className="modal-input w-full rounded-md border px-3 py-2 text-sm"
        size={Math.min(teamMembers.length || 1, 5)}
      >
        {teamMembers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name || m.email}
          </option>
        ))}
      </select>
      {selectedIds.length > 0 && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {selectedIds.length} selected — hold Ctrl/Cmd to multi-select
        </p>
      )}
    </div>
  );
}

export function TaskModal({ task, onClose }: TaskModalProps) {
  const { data: session } = useSession();
  const { projects, sprints, teamMembers, filterSprint } = useBoardStore();
  const isNew = !task;
  const dialogRef = useRef<HTMLDivElement>(null);
  const currentUserId = session?.user?.id ?? null;
  const preferredSprintId =
    sprints.find((s) => s.isActive)?.id ?? filterSprint ?? null;

  // Focus trapping and Escape key handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    // Focus the dialog on mount
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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

  useEffect(() => {
    if (!isNew) return;
    if (!currentUserId && !preferredSprintId) return;

    setForm((prev) => {
      let changed = false;
      const next = { ...prev };

      if (!next.responsibleId && currentUserId) {
        next.responsibleId = currentUserId;
        changed = true;
      }
      if (!next.accountableId && currentUserId) {
        next.accountableId = currentUserId;
        changed = true;
      }
      if (!next.sprintId && preferredSprintId) {
        next.sprintId = preferredSprintId;
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [currentUserId, isNew, preferredSprintId]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
        tabIndex={-1}
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card shadow-lg focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id="task-modal-title" className="text-lg font-semibold text-foreground">
            {isNew ? "New Task" : "Edit Task"}
          </h2>
          <div className="flex items-center gap-2">
            {!isNew && task!.status !== "DONE" && (
              <button
                onClick={handleAdvance}
                className="btn-advance-modal flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Advance task status"
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                Advance
              </button>
            )}
            {!isNew && (
              <button
                onClick={handleDelete}
                className="icon-btn-delete rounded-md p-2 focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Delete task"
                title="Delete task"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <button
              onClick={onClose}
              className="icon-btn-muted rounded-md p-2 focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close dialog"
              title="Close"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-5 px-6 py-5">
          {/* Title */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Title
            </label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="modal-input w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Task title"
              autoFocus
            />
          </div>

          {/* Status + Priority + Difficulty row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as TaskStatus })
                }
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
              >
                {Object.entries(COLUMN_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Priority
              </label>
              <select
                value={form.priority}
                onChange={(e) =>
                  setForm({ ...form, priority: e.target.value as Priority })
                }
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
              >
                {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
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
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
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
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Project
              </label>
              <select
                value={form.projectId}
                onChange={(e) =>
                  setForm({ ...form, projectId: e.target.value })
                }
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
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
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Sprint
              </label>
              <select
                value={form.sprintId}
                onChange={(e) =>
                  setForm({ ...form, sprintId: e.target.value })
                }
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">No Sprint</option>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {getSprintLabel(s)}
                    {s.isActive ? " (active)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Parent Task */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Parent Task
            </label>
            <select
              value={form.parentId}
              onChange={(e) => setForm({ ...form, parentId: e.target.value })}
              className="modal-input w-full rounded-md border px-3 py-2 text-sm"
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
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                  Subtasks
                  {detail?.children && detail.children.length > 0 && (
                    <span className="rounded bg-tag-bg px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {detail.children.length}
                    </span>
                  )}
                </h3>
                <button
                  onClick={() => setShowSubtaskForm(!showSubtaskForm)}
                  className="btn-add-subtask flex items-center gap-1 rounded-md px-2 py-1 text-xs focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={showSubtaskForm ? "Cancel adding subtask" : "Add subtask"}
                >
                  <Plus className="h-3 w-3" aria-hidden="true" />
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
                    className="modal-input flex-1 rounded-md border px-3 py-1.5 text-sm"
                    aria-label="Subtask title"
                    autoFocus
                  />
                  <button
                    onClick={handleCreateSubtask}
                    disabled={creatingSub || !subtaskTitle.trim()}
                    className="btn-primary-theme rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
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
                      className="subtask-row flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                    >
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ background: STATUS_COLORS[child.status] }}
                        role="img"
                        aria-label={`Status: ${child.status.replace(/_/g, " ")}`}
                      />
                      <span className="flex-1 text-foreground">
                        {child.title}
                      </span>
                      <span
                        className="text-[10px] font-medium"
                        style={{ color: PRIORITY_COLORS[child.priority] }}
                      >
                        {child.priority}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {COLUMN_LABELS[child.status]}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                !showSubtaskForm && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No subtasks yet
                  </p>
                )
              )}
            </div>
          )}

          {/* Dependencies Section */}
          <div className="rounded-lg border border-border bg-background p-4">
            <button
              type="button"
              onClick={() => setShowDeps(!showDeps)}
              className="flex w-full items-center justify-between focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded"
              aria-expanded={showDeps}
              aria-label={`Dependencies${form.dependsOnIds.length > 0 ? `, ${form.dependsOnIds.length} selected` : ""}`}
            >
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                Dependencies
                {form.dependsOnIds.length > 0 && (
                  <span className="rounded bg-tag-bg px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {form.dependsOnIds.length}
                  </span>
                )}
              </h3>
              {showDeps ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
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
                      className="inline-flex items-center gap-1 rounded-full bg-tag-bg px-2 py-0.5 text-[11px] text-muted-foreground"
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
                  <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                    This task depends on:
                  </p>
                  <div className="max-h-36 space-y-0.5 overflow-y-auto">
                    {depCandidates.map((t) => {
                      const isSelected = form.dependsOnIds.includes(t.id);
                      return (
                        <label
                          key={t.id}
                          className={`dep-label flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm ${
                            isSelected ? "dep-label-selected" : "text-muted-foreground"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleDep(t.id)}
                            className="rounded border-border accent-primary"
                          />
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ background: STATUS_COLORS[t.status] }}
                          />
                          <span className="flex-1 truncate">{t.title}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {COLUMN_LABELS[t.status]}
                          </span>
                        </label>
                      );
                    })}
                    {depCandidates.length === 0 && (
                      <p className="py-2 text-center text-xs text-muted-foreground">
                        No other tasks available
                      </p>
                    )}
                  </div>
                </div>

                {/* Depended by (read-only) */}
                {detail?.dependedBy && detail.dependedBy.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                      Blocks these tasks:
                    </p>
                    <div className="space-y-0.5">
                      {detail.dependedBy.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center gap-2 rounded px-2 py-1 text-sm text-muted-foreground"
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
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Start Date
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) =>
                  setForm({ ...form, startDate: e.target.value })
                }
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Due Date
              </label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* RACI Assignments */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              RACI Assignments
            </h3>

            {/* R + A: single-select dropdowns */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Responsible
                </label>
                <select
                  value={form.responsibleId}
                  onChange={(e) =>
                    setForm({ ...form, responsibleId: e.target.value })
                  }
                  className="modal-input w-full rounded-md border px-3 py-2 text-sm"
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
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Accountable
                </label>
                <select
                  value={form.accountableId}
                  onChange={(e) =>
                    setForm({ ...form, accountableId: e.target.value })
                  }
                  className="modal-input w-full rounded-md border px-3 py-2 text-sm"
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

            {/* C + I: multi-select dropdowns */}
            {(
              [
                ["consultedIds", "Consulted"],
                ["informedIds", "Informed"],
              ] as const
            ).map(([field, label]) => (
              <MultiSelectDropdown
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
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={4}
              className="modal-input w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Task notes..."
            />
          </div>

          {/* Unplanned checkbox + Slack thread */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.unplanned}
                onChange={(e) =>
                  setForm({ ...form, unplanned: e.target.checked })
                }
                className="rounded border-border accent-primary"
              />
              Unplanned work
            </label>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Slack Thread
              </label>
              <input
                value={form.slackThread}
                onChange={(e) =>
                  setForm({ ...form, slackThread: e.target.value })
                }
                className="modal-input w-full rounded-md border px-3 py-2 text-sm"
                placeholder="https://slack.com/..."
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="btn-ghost-muted rounded-md px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.title.trim()}
            className="btn-primary-theme rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Saving..." : isNew ? "Create Task" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
