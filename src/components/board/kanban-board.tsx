"use client";

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  DragDropContext,
  type DropResult,
} from "@hello-pangea/dnd";
import { useBoardStore } from "@/store/board-store";
import { KanbanColumn } from "./kanban-column";
import { TaskModal } from "../tasks/task-modal";
import { BoardFilters } from "./board-filters";
import type { TaskStatus, TaskWithRelations, BoardColumn } from "@/types";
import { COLUMN_ORDER, COLUMN_LABELS } from "@/types";
import { Eye, EyeOff, Keyboard, Plus } from "lucide-react";
import { useSession } from "next-auth/react";

interface KanbanBoardProps {
  filterByUser?: string;
  filterByStatus?: TaskStatus[];
}

type DisplayPreset = "standard" | "dense" | "triage";

const PRESET_DEFAULTS: Record<DisplayPreset, { showMetadata: boolean }> = {
  standard: { showMetadata: true },
  dense: { showMetadata: false },
  triage: { showMetadata: false },
};

export function KanbanBoard({ filterByUser, filterByStatus }: KanbanBoardProps) {
  const { data: session } = useSession();
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
  const [displayPreset, setDisplayPreset] = useState<DisplayPreset>("standard");
  const [showMetadata, setShowMetadata] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

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

  const userPresetKey = session?.user?.id
    ? `board-display-preset:${session.user.id}`
    : null;

  useEffect(() => {
    if (!userPresetKey) return;
    try {
      const raw = localStorage.getItem(userPresetKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        preset?: DisplayPreset;
        showMetadata?: boolean;
      };
      if (
        parsed.preset === "standard" ||
        parsed.preset === "dense" ||
        parsed.preset === "triage"
      ) {
        setDisplayPreset(parsed.preset);
      }
      if (typeof parsed.showMetadata === "boolean") {
        setShowMetadata(parsed.showMetadata);
      }
    } catch {
      // ignore broken local preference payloads
    }
  }, [userPresetKey]);

  useEffect(() => {
    if (!userPresetKey) return;
    localStorage.setItem(
      userPresetKey,
      JSON.stringify({ preset: displayPreset, showMetadata })
    );
  }, [displayPreset, showMetadata, userPresetKey]);

  const visibleTasks = useMemo(
    () => columns.flatMap((column) => column.tasks.map((task) => ({ task, column }))),
    [columns]
  );

  useEffect(() => {
    if (visibleTasks.length === 0) {
      setSelectedTaskId(null);
      return;
    }
    if (!selectedTaskId || !visibleTasks.some((entry) => entry.task.id === selectedTaskId)) {
      setSelectedTaskId(visibleTasks[0]?.task.id ?? null);
    }
  }, [selectedTaskId, visibleTasks]);

  const applyPreset = useCallback((preset: DisplayPreset) => {
    setDisplayPreset(preset);
    setShowMetadata(PRESET_DEFAULTS[preset].showMetadata);
  }, []);

  const handleBoardKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (visibleTasks.length === 0) return;

      const currentIndex = selectedTaskId
        ? visibleTasks.findIndex((entry) => entry.task.id === selectedTaskId)
        : -1;
      const safeIndex = currentIndex >= 0 ? currentIndex : 0;

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex = Math.min(safeIndex + 1, visibleTasks.length - 1);
        setSelectedTaskId(visibleTasks[nextIndex]?.task.id ?? null);
        return;
      }

      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        const previousIndex = Math.max(safeIndex - 1, 0);
        setSelectedTaskId(visibleTasks[previousIndex]?.task.id ?? null);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const selected =
          visibleTasks[safeIndex]?.task ??
          visibleTasks.find((entry) => entry.task.id === selectedTaskId)?.task;
        if (selected) {
          openTaskModal(selected);
        }
      }
    },
    [openTaskModal, selectedTaskId, visibleTasks]
  );

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
        const movedTask = columns
          .find((column) => column.id === fromColumn)
          ?.tasks.find((task) => task.id === draggableId);

        const requestId = `${draggableId}:${Date.now()}`;
        const response = await fetch("/api/tasks/reorder", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId,
            items: [
              {
                taskId: draggableId,
                status: toColumn,
                columnOrder: destination.index,
                expectedUpdatedAt: movedTask?.updatedAt,
              },
            ],
          }),
        });

        if (!response.ok) {
          if (response.status === 409) {
            const conflict = await response.json().catch(() => null);
            const message =
              conflict?.conflict?.message ||
              conflict?.error ||
              "This task changed before your move was applied. Refreshing board.";
            window.alert(message);
          }
          throw new Error("Failed to reorder task");
        }
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" onKeyDown={handleBoardKeyDown} tabIndex={0}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <BoardFilters />
          <div className="flex items-center gap-2">
            <select
              value={displayPreset}
              onChange={(e) => applyPreset(e.target.value as DisplayPreset)}
              className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
              title="Display preset"
            >
              <option value="standard">Standard</option>
              <option value="dense">Dense</option>
              <option value="triage">Triage</option>
            </select>
            <button
              onClick={() => setShowMetadata((current) => !current)}
              className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              title="Toggle metadata disclosure"
            >
              {showMetadata ? (
                <>
                  <EyeOff className="h-3.5 w-3.5" />
                  Hide Details
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" />
                  Show Details
                </>
              )}
            </button>
            <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
              <Keyboard className="h-3 w-3" />
              J/K + Enter
            </span>
          </div>
        </div>
        <button
          onClick={handleCreateTask}
          className="btn-primary-theme flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
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
                displayPreset={displayPreset}
                showMetadata={showMetadata}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
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
