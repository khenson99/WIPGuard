"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { COLUMN_LABELS, PRIORITY_COLORS, type Priority, type TaskStatus, type TaskWithRelations } from "@/types";
import { useBoardStore } from "@/store/board-store";
import { TaskModal } from "@/components/tasks/task-modal";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";

type SortField = "title" | "status" | "priority" | "dueDate" | "project";
type SortDir = "asc" | "desc";

const STATUS_ORDER: TaskStatus[] = [
  "BACKLOG",
  "QUEUED",
  "WORKING_ON_TODAY",
  "ACTIVE",
  "NOT_DONE",
  "DONE",
];

const PRIORITY_ORDER: Priority[] = ["P0", "P1", "P2", "P3"];

interface TaskTableViewProps {
  assigneeId?: string;
  statusFilter?: TaskStatus[];
  compact?: boolean;
}

export function TaskTableView({ assigneeId, statusFilter, compact = false }: TaskTableViewProps) {
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { isTaskModalOpen, selectedTask, openTaskModal, closeTaskModal } = useBoardStore();
  const cacheKey = useMemo(() => {
    const statusKey = statusFilter && statusFilter.length > 0 ? statusFilter.join(",") : "all";
    return `dashboard:tasks-table:v1:${assigneeId || "all"}:${statusKey}`;
  }, [assigneeId, statusFilter]);

  const fetchTasks = useCallback(async (signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (assigneeId) params.set("assignee", assigneeId);

    try {
      const response = await fetch(`/api/tasks?${params.toString()}`, { signal });
      const payload = (await response.json()) as unknown;
      const normalized: TaskWithRelations[] = Array.isArray(payload)
        ? (payload as TaskWithRelations[])
        : [];

      const nextTasks =
        statusFilter && statusFilter.length > 0
          ? normalized.filter((task) => statusFilter.includes(task.status))
          : normalized;

      if (signal?.aborted) return;

      setTasks(nextTasks);
      writeSessionCache<TaskWithRelations[]>(cacheKey, nextTasks);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [assigneeId, cacheKey, statusFilter]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const cached = readSessionCache<TaskWithRelations[]>(cacheKey);

    if (cached) {
      queueMicrotask(() => {
        if (!active) return;
        setTasks(cached);
        setLoading(false);
      });
    } else {
      queueMicrotask(() => {
        if (!active) return;
        setLoading(true);
      });
    }

    void fetchTasks(controller.signal);

    return () => {
      active = false;
      controller.abort();
    };
  }, [cacheKey, fetchTasks]);

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "status":
          cmp = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
          break;
        case "priority":
          cmp = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
          break;
        case "dueDate":
          cmp = (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
          break;
        case "project":
          cmp = (a.project?.name || "zzz").localeCompare(b.project?.name || "zzz");
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [tasks, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const renderSortHeader = (field: SortField, label: string) => (
    <th
      onClick={() => handleSort(field)}
      className="cursor-pointer px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </div>
    </th>
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 border-b border-border bg-background">
          <tr>
            {renderSortHeader("title", "Title")}
            {renderSortHeader("status", "Status")}
            {renderSortHeader("priority", "Priority")}
            {renderSortHeader("project", "Project")}
            {renderSortHeader("dueDate", "Due Date")}
            {!compact && (
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Assignee
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {sorted.map((task) => (
            <tr
              key={task.id}
              onClick={() => openTaskModal(task)}
              className="cursor-pointer hover:bg-card"
            >
              <td className="px-4 py-2.5 font-medium text-foreground">{task.title}</td>
              <td className="px-4 py-2.5">
                <span className="rounded bg-secondary px-2 py-0.5 text-xs text-foreground">
                  {COLUMN_LABELS[task.status]}
                </span>
              </td>
              <td className="px-4 py-2.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
                />{" "}
                <span className="text-xs text-muted-foreground">{task.priority}</span>
              </td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">{task.project?.name || "—"}</td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
              </td>
              {!compact && (
                <td className="px-4 py-2.5">
                  <div className="flex -space-x-1">
                    {task.responsible?.slice(0, 3).map((user) => (
                      <div
                        key={user.id}
                        className="flex h-5 w-5 items-center justify-center rounded-full border border-background bg-avatar-bg text-[9px] font-medium text-avatar-text"
                        title={user.name || user.email}
                      >
                        {(user.name || user.email)[0]?.toUpperCase()}
                      </div>
                    ))}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {tasks.length === 0 && (
        <div className="p-10 text-center text-sm text-muted-foreground">No tasks available.</div>
      )}

      {isTaskModalOpen && (
        <TaskModal
          task={selectedTask}
          onClose={() => {
            closeTaskModal();
            fetchTasks();
          }}
        />
      )}
    </div>
  );
}
