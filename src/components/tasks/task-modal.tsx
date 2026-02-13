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
} from "lucide-react";
import { useBoardStore } from "@/store/board-store";
import type {
  TaskWithRelations,
  TaskStatus,
  Priority,
  DifficultyLevel,
} from "@/types";
import { COLUMN_LABELS, PRIORITY_LABELS, PRIORITY_COLORS } from "@/types";

interface TaskModalProps {
  task: TaskWithRelations | null;
  onClose: () => void;
}

const STATUS_DOT: Record<TaskStatus, string> = {
  BACKLOG: "bg-zinc-500",
  QUEUED: "bg-yellow-500",
  WORKING_ON_TODAY: "bg-blue-500",
  ACTIVE: "bg-green-500",
  NOT_DONE: "bg-red-500",
  DONE: "bg-emerald-500",
};

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
    responsibleIds: task?.responsible?.map((u) => u.id) || [],
    accountableIds: task?.accountable?.map((u) => u.id) || [],
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

      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          projectId: form.projectId || null,
          sprintId: form.sprintId || null,
          parentId: form.parentId || null,
          startDate: form.startDate || null,
          dueDate: form.dueDate || null,
          slackThread: form.slackThread || null,
        }),
      });

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
    await fetch(`/api/tasks/${task.id}/advance`, { method: "POST" });
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
          responsibleIds: task.responsible?.map((u) => u.id) || [],
          accountableIds: task.accountable?.map((u) => u.id) || [],
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">
            {isNew ? "New Task" : "Edit Task"}
          </h2>
          <div className="flex items-center gap-2">
            {!isNew && task!.status !== "DONE" && (
              <button
                onClick={handleAdvance}
                className="flex items-center gap-1 rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-zinc-700"
              >
                <ChevronRight className="h-3.5 w-3.5" />
                Advance
              </button>
            )}
            {!isNew && (
              <button
                onClick={handleDelete}
                className="rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-5 px-6 py-5">
          {/* Title */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Title
            </label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-amber-600 focus:outline-none"
              placeholder="Task title"
              autoFocus
            />
          </div>

          {/* Status + Priority + Difficulty row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as TaskStatus })
                }
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300"
              >
                {Object.entries(COLUMN_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">
                Priority
              </label>
              <select
                value={form.priority}
                onChange={(e) =>
                  setForm({ ...form, priority: e.target.value as Priority })
                }
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300"
              >
                {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">
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
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300"
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
              <label className="mb-1 block text-xs font-medium text-zinc-400">
                Project
              </label>
              <select
                value={form.projectId}
                onChange={(e) =>
                  setForm({ ...form, projectId: e.target.value })
                }
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300"
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
              <label className="mb-1 block text-xs font-medium text-zinc-400">
                Sprint
              </label>
              <select
                value={form.sprintId}
                onChange={(e) =>
                  setForm({ ...form, sprintId: e.target.value })
                }
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300"
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
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Parent Task
            </label>
            <select
              value={form.parentId}
              onChange={(e) => setForm({ ...form, parentId: e.target.value })}
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300"
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
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  <GitBranch className="h-3.5 w-3.5" />
                  Subtasks
                  {detail?.children && detail.children.length > 0 && (
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                      {detail.children.length}
                    </span>
                  )}
                </h3>
                <button
                  onClick={() => setShowSubtaskForm(!showSubtaskForm)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-amber-500 hover:bg-zinc-800"
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
                    className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:border-amber-600 focus:outline-none"
                    autoFocus
                  />
                  <button
                    onClick={handleCreateSubtask}
                    disabled={creatingSub || !subtaskTitle.trim()}
                    className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
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
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-800/50"
                    >
                      <div
                        className={`h-2 w-2 rounded-full ${STATUS_DOT[child.status]}`}
                      />
                      <span className="flex-1 text-zinc-300">
                        {child.title}
                      </span>
                      <span
                        className="text-[10px] font-medium"
                        style={{
                          color: PRIORITY_COLORS[child.priority],
                        }}
                      >
                        {child.priority}
                      </span>
                      <span className="text-[10px] text-zinc-600">
                        {COLUMN_LABELS[child.status]}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                !showSubtaskForm && (
                  <p className="mt-2 text-xs text-zinc-600">
                    No subtasks yet
                  </p>
                )
              )}
            </div>
          )}

          {/* Dependencies Section */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
            <button
              type="button"
              onClick={() => setShowDeps(!showDeps)}
              className="flex w-full items-center justify-between"
            >
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                <Link2 className="h-3.5 w-3.5" />
                Dependencies
                {form.dependsOnIds.length > 0 && (
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                    {form.dependsOnIds.length}
                  </span>
                )}
              </h3>
              {showDeps ? (
                <ChevronUp className="h-4 w-4 text-zinc-600" />
              ) : (
                <ChevronDown className="h-4 w-4 text-zinc-600" />
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
                      className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400"
                    >
                      <div
                        className={`h-1.5 w-1.5 rounded-full ${depTask ? STATUS_DOT[depTask.status] : "bg-zinc-600"}`}
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
                  <p className="mb-1 text-[11px] font-medium text-zinc-500">
                    This task depends on:
                  </p>
                  <div className="max-h-36 space-y-0.5 overflow-y-auto">
                    {depCandidates.map((t) => {
                      const isSelected = form.dependsOnIds.includes(t.id);
                      return (
                        <label
                          key={t.id}
                          className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm transition-colors ${
                            isSelected
                              ? "bg-amber-900/20 text-amber-300"
                              : "text-zinc-400 hover:bg-zinc-800"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleDep(t.id)}
                            className="rounded border-zinc-600 bg-zinc-800 text-amber-600"
                          />
                          <div
                            className={`h-2 w-2 rounded-full ${STATUS_DOT[t.status]}`}
                          />
                          <span className="flex-1 truncate">{t.title}</span>
                          <span className="text-[10px] text-zinc-600">
                            {COLUMN_LABELS[t.status]}
                          </span>
                        </label>
                      );
                    })}
                    {depCandidates.length === 0 && (
                      <p className="py-2 text-center text-xs text-zinc-600">
                        No other tasks available
                      </p>
                    )}
                  </div>
                </div>

                {/* Depended by (read-only) */}
                {detail?.dependedBy && detail.dependedBy.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-zinc-500">
                      Blocks these tasks:
                    </p>
                    <div className="space-y-0.5">
                      {detail.dependedBy.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center gap-2 rounded px-2 py-1 text-sm text-zinc-500"
                        >
                          <div
                            className={`h-2 w-2 rounded-full ${STATUS_DOT[t.status]}`}
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
              <label className="mb-1 block text-xs font-medium text-zinc-400">
                Start Date
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) =>
                  setForm({ ...form, startDate: e.target.value })
                }
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">
                Due Date
              </label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300"
              />
            </div>
          </div>

          {/* RACI Assignments */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              RACI Assignments
            </h3>
            {(
              [
                ["responsibleIds", "Responsible"],
                ["accountableIds", "Accountable"],
                ["consultedIds", "Consulted"],
                ["informedIds", "Informed"],
              ] as const
            ).map(([field, label]) => (
              <div key={field}>
                <label className="mb-1 block text-xs font-medium text-zinc-400">
                  {label}
                </label>
                <select
                  multiple
                  value={form[field]}
                  onChange={(e) => {
                    const selected = Array.from(
                      e.target.selectedOptions,
                      (opt) => opt.value
                    );
                    setForm({ ...form, [field]: selected });
                  }}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300"
                  size={Math.min(teamMembers.length, 4)}
                >
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.email}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={4}
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 placeholder-zinc-500 focus:border-amber-600 focus:outline-none"
              placeholder="Task notes..."
            />
          </div>

          {/* Unplanned checkbox + Slack thread */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={form.unplanned}
                onChange={(e) =>
                  setForm({ ...form, unplanned: e.target.checked })
                }
                className="rounded border-zinc-600 bg-zinc-800 text-amber-600"
              />
              Unplanned work
            </label>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">
                Slack Thread
              </label>
              <input
                value={form.slackThread}
                onChange={(e) =>
                  setForm({ ...form, slackThread: e.target.value })
                }
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 placeholder-zinc-500"
                placeholder="https://slack.com/..."
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-zinc-800 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.title.trim()}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : isNew ? "Create Task" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
