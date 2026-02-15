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
import type { TaskStatus, TaskWithRelations, BoardColumn, DepartmentSummary } from "@/types";
import { COLUMN_ORDER, COLUMN_LABELS } from "@/types";
import { Eye, EyeOff, Keyboard, Plus, Rows3 } from "lucide-react";
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
  const [swimLaneEnabled, setSwimLaneEnabled] = useState(false);
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [projectDeptMap, setProjectDeptMap] = useState<Map<string, string | null>>(new Map());

  const fetchBoard = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterByUser) params.set("assignee", filterByUser);
      if (filterAssignee) params.set("assignee", filterAssignee);
      if (filterProject) params.set("project", filterProject);
      if (filterPriority) params.set("priority", filterPriority);
      if (filterSprint) params.set("sprint", filterSprint);

      const [tasksRes, settingsRes, teamRes, projectsRes, sprintsRes, deptsRes] =
        await Promise.all([
          fetch(`/api/tasks?${params}`),
          fetch("/api/board-settings"),
          fetch("/api/team"),
          fetch("/api/projects"),
          fetch("/api/sprints"),
          fetch("/api/departments"),
        ]);

      const tasks: TaskWithRelations[] = await tasksRes.json();
      const settings = await settingsRes.json();
      const team = await teamRes.json();
      const projects = await projectsRes.json();
      const sprints = await sprintsRes.json();
      const depts: DepartmentSummary[] = deptsRes.ok ? await deptsRes.json() : [];

      setTeamMembers(team);
      setProjects(projects);
      setSprints(sprints);
      setDepartments(depts);

      // Build project→department mapping
      const deptMap = new Map<string, string | null>();
      for (const p of projects) {
        deptMap.set(p.id, p.departmentId || null);
      }
      setProjectDeptMap(deptMap);

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
            <button
              onClick={() => setSwimLaneEnabled((v) => !v)}
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                swimLaneEnabled
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
              title="Toggle department swim lanes"
            >
              <Rows3 className="h-3.5 w-3.5" />
              Swim Lanes
            </button>
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

      <div className="flex-1 overflow-x-auto overflow-y-auto px-4 pb-4">
        <DragDropContext onDragEnd={handleDragEnd}>
          {swimLaneEnabled ? (
            <SwimLaneBoard
              columns={columns}
              departments={departments}
              projectDeptMap={projectDeptMap}
              wipLimits={wipLimits}
              openTaskModal={openTaskModal}
              fetchBoard={fetchBoard}
              displayPreset={displayPreset}
              showMetadata={showMetadata}
              selectedTaskId={selectedTaskId}
              setSelectedTaskId={setSelectedTaskId}
            />
          ) : (
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
          )}
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

/* ---------- Swim Lane Board sub-component ---------- */

interface SwimLaneBoardProps {
  columns: BoardColumn[];
  departments: DepartmentSummary[];
  projectDeptMap: Map<string, string | null>;
  wipLimits: Record<TaskStatus, number>;
  openTaskModal: (task: TaskWithRelations | null) => void;
  fetchBoard: () => void;
  displayPreset: DisplayPreset;
  showMetadata: boolean;
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;
}

function SwimLaneBoard({
  columns,
  departments,
  projectDeptMap,
  wipLimits,
  openTaskModal,
  fetchBoard,
  displayPreset,
  showMetadata,
  selectedTaskId,
  setSelectedTaskId,
}: SwimLaneBoardProps) {
  // Build lanes: group tasks by department (via their project's department)
  const lanes = useMemo(() => {
    type Lane = {
      id: string;
      name: string;
      color: string | null;
      columns: BoardColumn[];
    };

    const laneMap = new Map<string, Lane>();

    // Initialize a lane per department
    for (const dept of departments) {
      laneMap.set(dept.id, {
        id: dept.id,
        name: dept.name,
        color: dept.color || null,
        columns: columns.map((col) => ({ ...col, tasks: [] })),
      });
    }
    // Unassigned lane
    laneMap.set("__none__", {
      id: "__none__",
      name: "Unassigned",
      color: null,
      columns: columns.map((col) => ({ ...col, tasks: [] })),
    });

    // Distribute tasks into lanes
    for (const col of columns) {
      for (const task of col.tasks) {
        const deptId = task.projectId
          ? projectDeptMap.get(task.projectId) || "__none__"
          : "__none__";

        let lane = laneMap.get(deptId);
        if (!lane) {
          lane = laneMap.get("__none__")!;
        }

        const laneCol = lane.columns.find((c) => c.id === col.id);
        if (laneCol) {
          laneCol.tasks.push(task);
        }
      }
    }

    // Return all lanes that have at least one task, plus keep Unassigned at the end
    const result: Lane[] = [];
    for (const dept of departments) {
      const lane = laneMap.get(dept.id);
      if (lane && lane.columns.some((c) => c.tasks.length > 0)) {
        result.push(lane);
      }
    }
    const unassigned = laneMap.get("__none__")!;
    if (unassigned.columns.some((c) => c.tasks.length > 0)) {
      result.push(unassigned);
    }

    return result;
  }, [columns, departments, projectDeptMap]);

  if (lanes.length === 0) {
    return (
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
    );
  }

  return (
    <div className="space-y-6">
      {lanes.map((lane) => (
        <div
          key={lane.id}
          className="rounded-xl border border-border bg-card/30 p-3"
        >
          {/* Lane header */}
          <div className="mb-3 flex items-center gap-2 px-1">
            {lane.color && (
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: lane.color }}
              />
            )}
            <h3 className="text-sm font-semibold text-foreground">
              {lane.name}
            </h3>
            <span className="text-xs text-muted-foreground">
              ({lane.columns.reduce((s, c) => s + c.tasks.length, 0)} task
              {lane.columns.reduce((s, c) => s + c.tasks.length, 0) !== 1
                ? "s"
                : ""})
            </span>
          </div>

          {/* Columns within lane */}
          <div className="flex gap-3 overflow-x-auto">
            {lane.columns.map((column) => (
              <KanbanColumn
                key={`${lane.id}-${column.id}`}
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
        </div>
      ))}
    </div>
  );
}
