"use client";

import { useEffect, useState } from "react";
import type { TaskWithRelations, TaskStatus, Priority } from "@/types";
import { COLUMN_LABELS, PRIORITY_COLORS } from "@/types";
import { useBoardStore } from "@/store/board-store";
import { TaskModal } from "@/components/tasks/task-modal";
import { ArrowUpDown } from "lucide-react";

type SortField = "title" | "status" | "priority" | "dueDate" | "project";
type SortDir = "asc" | "desc";

export default function TablePage() {
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const { isTaskModalOpen, selectedTask, openTaskModal, closeTaskModal } =
    useBoardStore();

  useEffect(() => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then(setTasks)
      .finally(() => setLoading(false));
  }, []);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const statusOrder: TaskStatus[] = [
    "BACKLOG",
    "QUEUED",
    "WORKING_ON_TODAY",
    "ACTIVE",
    "NOT_DONE",
    "DONE",
  ];
  const priorityOrder: Priority[] = ["P0", "P1", "P2", "P3"];

  const sorted = [...tasks].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case "title":
        cmp = a.title.localeCompare(b.title);
        break;
      case "status":
        cmp = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
        break;
      case "priority":
        cmp =
          priorityOrder.indexOf(a.priority) -
          priorityOrder.indexOf(b.priority);
        break;
      case "dueDate":
        cmp =
          (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
        break;
      case "project":
        cmp = (a.project?.name || "zzz").localeCompare(
          b.project?.name || "zzz"
        );
        break;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

  const refresh = () => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then(setTasks);
  };

  const renderSortHeader = (field: SortField, label: string) => (
    <th
      onClick={() => handleSort(field)}
      className="cursor-pointer px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-zinc-400 hover:text-zinc-200"
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-500" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 px-6 py-3">
        <h1 className="text-lg font-semibold text-white">Table View</h1>
        <p className="text-xs text-zinc-500">
          Sortable, filterable table with all task metadata
        </p>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-800">
            <tr>
              {renderSortHeader("title", "Title")}
              {renderSortHeader("status", "Status")}
              {renderSortHeader("priority", "Priority")}
              {renderSortHeader("project", "Project")}
              {renderSortHeader("dueDate", "Due Date")}
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-zinc-400">
                Assignee
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {sorted.map((task) => (
              <tr
                key={task.id}
                onClick={() => openTaskModal(task)}
                className="cursor-pointer hover:bg-zinc-900/50"
              >
                <td className="px-4 py-2.5 font-medium text-zinc-200">
                  {task.title}
                </td>
                <td className="px-4 py-2.5">
                  <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                    {COLUMN_LABELS[task.status]}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: PRIORITY_COLORS[task.priority],
                    }}
                  />{" "}
                  <span className="text-xs text-zinc-400">
                    {task.priority}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-zinc-400">
                  {task.project?.name || "—"}
                </td>
                <td className="px-4 py-2.5 text-xs text-zinc-400">
                  {task.dueDate
                    ? new Date(task.dueDate).toLocaleDateString()
                    : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex -space-x-1">
                    {task.responsible?.slice(0, 3).map((u) => (
                      <div
                        key={u.id}
                        className="flex h-5 w-5 items-center justify-center rounded-full border border-zinc-900 bg-zinc-700 text-[9px] font-medium text-zinc-300"
                        title={u.name || u.email}
                      >
                        {(u.name || u.email)[0].toUpperCase()}
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {tasks.length === 0 && (
          <div className="mt-12 text-center text-sm text-zinc-500">
            No tasks yet. Create one from the Taskboard.
          </div>
        )}
      </div>

      {isTaskModalOpen && (
        <TaskModal
          task={selectedTask}
          onClose={() => {
            closeTaskModal();
            refresh();
          }}
        />
      )}
    </div>
  );
}
