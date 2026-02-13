"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DragDropContext,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { useBoardStore } from "@/store/board-store";
import { KanbanColumn } from "./kanban-column";
import { TaskModal } from "../tasks/task-modal";
import { BoardFilters } from "./board-filters";
import type { TaskStatus, TaskWithRelations, BoardColumn } from "@/types";
import { COLUMN_ORDER, COLUMN_LABELS } from "@/types";
import { Plus } from "lucide-react";

interface KanbanBoardProps {
  filterByUser?: string;
  filterByStatus?: TaskStatus[];
}

export function KanbanBoard({ filterByUser, filterByStatus }: KanbanBoardProps) {
  const {
    columns,
    setColumns,
    wipLimits,
    setWipLimits,
    moveTask,
    isTaskModalOpen,
    selectedTask,
    openTaskModal,
    closeTaskModal,
    filterAssignee,
    filterProject,
    filterPriority,
    filterSprint,
    setTeamMembers,
    setProjects,
    setSprints,
  } = useBoardStore();

  const [loading, setLoading] = useState(true);

  const fetchBoard = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterByUser) params.set("assignee", filterByUser);
      if (filterAssignee) params.set("assignee", filterAssignee);
      if (filterProject) params.set("project", filterProject);
      if (filterPriority) params.set("priority", filterPriority);
      if (filterSprint) params.set("sprint", filterSprint);

      const [tasksRes, settingsRes, teamRes, projectsRes, sprintsRes] =
        await Promise.all([
          fetch(`/api/tasks?${params}`),
          fetch("/api/board-settings"),
          fetch("/api/team"),
          fetch("/api/projects"),
          fetch("/api/sprints"),
        ]);

      const tasks: TaskWithRelations[] = await tasksRes.json();
      const settings = await settingsRes.json();
      const team = await teamRes.json();
      const projects = await projectsRes.json();
      const sprints = await sprintsRes.json();

      setTeamMembers(team);
      setProjects(projects);
      setSprints(sprints);

      // Build WIP limits from settings
      const limits: Record<TaskStatus, number> = {
        BACKLOG: 0,
        QUEUED: 0,
        WORKING_ON_TODAY: 3,
        ACTIVE: 1,
        NOT_DONE: 0,
        DONE: 0,
      };
      if (Array.isArray(settings)) {
        for (const s of settings) {
          if (s.columnName in limits) {
            limits[s.columnName as TaskStatus] = s.wipLimit;
          }
        }
      }
      setWipLimits(limits);

      // Build columns
      const statusesToShow = filterByStatus || COLUMN_ORDER;
      const boardColumns: BoardColumn[] = statusesToShow.map((status) => ({
        id: status,
        label: COLUMN_LABELS[status],
        wipLimit: limits[status],
        tasks: tasks
          .filter((t) => t.status === status)
          .sort((a, b) => a.columnOrder - b.columnOrder),
      }));

      setColumns(boardColumns);
    } catch (err) {
      console.error("Failed to fetch board data:", err);
    } finally {
      setLoading(false);
    }
  }, [
    filterByUser,
    filterByStatus,
    filterAssignee,
    filterProject,
    filterPriority,
    filterSprint,
    setColumns,
    setWipLimits,
    setTeamMembers,
    setProjects,
    setSprints,
  ]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  const handleDragEnd = useCallback(
    async (result: DropResult) => {
      const { source, destination, draggableId } = result;
      if (!destination) return;
      if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
      )
        return;

      const fromColumn = source.droppableId as TaskStatus;
      const toColumn = destination.droppableId as TaskStatus;

      // Check WIP limit (soft block with warning)
      if (fromColumn !== toColumn) {
        const limit = wipLimits[toColumn];
        const col = columns.find((c) => c.id === toColumn);
        if (limit > 0 && col && col.tasks.length >= limit) {
          const proceed = window.confirm(
            `WIP limit (${limit}) exceeded for "${COLUMN_LABELS[toColumn]}". Override?`
          );
          if (!proceed) return;
        }
      }

      // Optimistic update
      moveTask(draggableId, fromColumn, toColumn, destination.index);

      // Persist
      try {
        await fetch("/api/tasks/reorder", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [
              {
                taskId: draggableId,
                status: toColumn,
                columnOrder: destination.index,
              },
            ],
          }),
        });
      } catch {
        // Revert on failure
        fetchBoard();
      }
    },
    [columns, wipLimits, moveTask, fetchBoard]
  );

  const handleCreateTask = () => {
    openTaskModal(null);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-500" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-6 py-3">
        <BoardFilters />
        <button
          onClick={handleCreateTask}
          className="flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500"
        >
          <Plus className="h-4 w-4" />
          New Task
        </button>
      </div>

      <div className="flex-1 overflow-x-auto px-4 pb-4">
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex h-full gap-3">
            {columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                wipLimit={wipLimits[column.id]}
                onTaskClick={(task) => openTaskModal(task)}
                onRefresh={fetchBoard}
              />
            ))}
          </div>
        </DragDropContext>
      </div>

      {isTaskModalOpen && (
        <TaskModal
          task={selectedTask}
          onClose={() => {
            closeTaskModal();
            fetchBoard();
          }}
        />
      )}
    </div>
  );
}
