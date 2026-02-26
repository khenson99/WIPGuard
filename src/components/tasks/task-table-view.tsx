"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { COLUMN_LABELS, PRIORITY_COLORS, STATUS_COLORS, type Priority, type TaskStatus, type TaskWithRelations } from "@/types";
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
      className="cursor-pointer px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
    >
      <div className="flex items-center gap-1.5">
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
    <div className="h-full overflow-auto rounded-xl border border-border/40 bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 border-b border-border/40 bg-muted/40 backdrop-blur-md">
          <tr>
            {renderSortHeader("title", "Title")}
            {renderSortHeader("status", "Status")}
            {renderSortHeader("priority", "Priority")}
            {renderSortHeader("project", "Project")}
            {renderSortHeader("dueDate", "Due Date")}
            {!compact && (
              <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Assignee
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {sorted.map((task) => (
            <tr
              key={task.id}
              onClick={() => openTaskModal(task)}
              className="group cursor-pointer transition-colors hover:bg-gradient-to-r hover:from-muted/40 hover:to-transparent"
            >
              <td className="px-4 py-3 font-semibold tracking-tight text-foreground">{task.title}</td>
              <td className="px-4 py-3">
                <span 
                  className="rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wider uppercase shadow-sm border"
                  style={{
                    backgroundColor: `${STATUS_COLORS[task.status]}15`,
                    color: STATUS_COLORS[task.status],
                    borderColor: `${STATUS_COLORS[task.status]}30`
                  }}
                >
                  {COLUMN_LABELS[task.status]}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wider shadow-sm border border-border/40"
                  style={{ 
                    backgroundColor: `${PRIORITY_COLORS[task.priority]}15`,
                    color: PRIORITY_COLORS[task.priority],
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
                  />
                  {task.priority}
                </span>
              </td>
              <td className="px-4 py-3 text-xs font-medium text-muted-foreground">{task.project?.name || "—"}</td>
              <td className="px-4 py-3 text-xs font-medium text-muted-foreground">
                {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
              </td>
              {!compact && (
                <td className="px-4 py-3">
                  <div className="flex -space-x-1.5 hover:space-x-0.5 transition-all duration-300">
                    {task.responsible?.slice(0, 3).map((user) => (
                      <div
                        key={user.id}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-card bg-secondary text-[10px] font-bold text-secondary-foreground shadow-sm ring-1 ring-border/20 transition-transform hover:scale-110 hover:z-10"
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
