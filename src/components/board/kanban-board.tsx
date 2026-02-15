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
import type { GroupByMode } from "./task-card";
import { Eye, EyeOff, Keyboard, Plus, Layers } from "lucide-react";
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

/* ============================================================
   GenericColumn — a slimmed-down column shape used for
   project/department grouping (not tied to TaskStatus)
   ============================================================ */

interface GenericColumn {
  id: string;
  label: string;
  tasks: TaskWithRelations[];
  color?: string | null;
}

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
  const [groupBy, setGroupBy] = useState<GroupByMode>("status");
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [projectDeptMap, setProjectDeptMap] = useState<
    Map<string, { deptId: string | null; deptName: string | null; deptColor: string | null }>
  >(new Map());
  const [allTasks, setAllTasks] = useState<TaskWithRelations[]>([]);
  const [projectList, setProjectList] = useState<{ id: string; name: string; departmentId: string | null }[]>([]);

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
      setAllTasks(tasks);
      setProjectList(
        projects.map((p: { id: string; name: string; departmentId?: string | null }) => ({
          id: p.id,
          name: p.name,
          departmentId: p.departmentId || null,
        }))
      );

      // Build project→department mapping (includes name/color for card tags)
      const deptLookup = new Map<string, DepartmentSummary>();
      for (const d of depts) deptLookup.set(d.id, d);

      const deptMap = new Map<
        string,
        { deptId: string | null; deptName: string | null; deptColor: string | null }
      >();
      for (const p of projects) {
        const dId = p.departmentId || null;
        const dept = dId ? deptLookup.get(dId) : null;
        deptMap.set(p.id, {
          deptId: dId,
          deptName: dept?.name || null,
          deptColor: dept?.color || null,
        });
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

      // Build status columns (always needed for store)
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

  /* ----- Group By: Project columns ----- */
  const projectColumns = useMemo((): GenericColumn[] => {
    if (groupBy !== "project") return [];
    const colMap = new Map<string, GenericColumn>();

    for (const p of projectList) {
      colMap.set(p.id, { id: p.id, label: p.name, tasks: [] });
    }
    colMap.set("__unassigned__", { id: "__unassigned__", label: "No Project", tasks: [] });

    for (const task of allTasks) {
      const key = task.projectId && colMap.has(task.projectId) ? task.projectId : "__unassigned__";
      colMap.get(key)!.tasks.push(task);
    }

    // Sort tasks within each column by columnOrder
    for (const col of colMap.values()) {
      col.tasks.sort((a, b) => a.columnOrder - b.columnOrder);
    }

    // Return columns with tasks + always include empty project columns
    const result: GenericColumn[] = [];
    for (const p of projectList) {
      const col = colMap.get(p.id)!;
      result.push(col);
    }
    const unassigned = colMap.get("__unassigned__")!;
    if (unassigned.tasks.length > 0) result.push(unassigned);
    return result;
  }, [groupBy, allTasks, projectList]);

  /* ----- Group By: Department columns ----- */
  const departmentColumns = useMemo((): GenericColumn[] => {
    if (groupBy !== "department") return [];
    const colMap = new Map<string, GenericColumn>();

    for (const d of departments) {
      colMap.set(d.id, { id: d.id, label: d.name, tasks: [], color: d.color });
    }
    colMap.set("__unassigned__", { id: "__unassigned__", label: "No Department", tasks: [] });

    for (const task of allTasks) {
      const deptInfo = task.projectId ? projectDeptMap.get(task.projectId) : null;
      const key = deptInfo?.deptId && colMap.has(deptInfo.deptId) ? deptInfo.deptId : "__unassigned__";
      colMap.get(key)!.tasks.push(task);
    }

    for (const col of colMap.values()) {
      col.tasks.sort((a, b) => a.columnOrder - b.columnOrder);
    }

    const result: GenericColumn[] = [];
    for (const d of departments) {
      const col = colMap.get(d.id)!;
      result.push(col);
    }
    const unassigned = colMap.get("__unassigned__")!;
    if (unassigned.tasks.length > 0) result.push(unassigned);
    return result;
  }, [groupBy, allTasks, departments, projectDeptMap]);

  /* ----- Helper: get dept info for a task (used when grouping by status or project) ----- */
  const getDeptForTask = useCallback(
    (task: TaskWithRelations): { name: string; color: string | null } | null => {
      if (!task.projectId) return null;
      const info = projectDeptMap.get(task.projectId);
      if (!info?.deptName) return null;
      return { name: info.deptName, color: info.deptColor };
    },
    [projectDeptMap]
  );

  /* ----- Preference persistence ----- */
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
        groupBy?: GroupByMode;
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
      if (parsed.groupBy === "status" || parsed.groupBy === "project" || parsed.groupBy === "department") {
        setGroupBy(parsed.groupBy);
      }
    } catch {
      // ignore broken local preference payloads
    }
  }, [userPresetKey]);

  useEffect(() => {
    if (!userPresetKey) return;
    localStorage.setItem(
      userPresetKey,
      JSON.stringify({ preset: displayPreset, showMetadata, groupBy })
    );
  }, [displayPreset, showMetadata, groupBy, userPresetKey]);

  /* ----- Keyboard nav ----- */
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

  /* ----- Drag & drop (status grouping only) ----- */
  const handleDragEnd = useCallback(
    async (result: DropResult) => {
      const { source, destination, draggableId } = result;
      if (!destination) return;
      if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
      )
        return;

      // Only support reordering for status grouping currently
      if (groupBy !== "status") return;

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
    [columns, wipLimits, moveTask, fetchBoard, groupBy]
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

  /* ----- Render ----- */
  return (
    <div className="flex h-full flex-col" onKeyDown={handleBoardKeyDown} tabIndex={0}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <BoardFilters />
          <div className="flex items-center gap-2">
            {/* Group By selector */}
            <div className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupByMode)}
                className="bg-transparent text-xs text-foreground outline-none"
                title="Group tasks by"
              >
                <option value="status">Group by Status</option>
                <option value="project">Group by Project</option>
                <option value="department">Group by Department</option>
              </select>
            </div>
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

      <div className="flex-1 overflow-x-auto overflow-y-auto px-4 pb-4">
        <DragDropContext onDragEnd={handleDragEnd}>
          {groupBy === "status" && (
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
                  groupBy="status"
                  getDeptForTask={getDeptForTask}
                />
              ))}
            </div>
          )}

          {groupBy === "project" && (
            <div className="flex h-full gap-3">
              {projectColumns.map((col) => {
                // Resolve department for project-level column header
                const projInfo = projectList.find((p) => p.id === col.id);
                const deptInfo = projInfo?.departmentId
                  ? projectDeptMap.get(projInfo.id)
                  : null;

                return (
                  <div
                    key={col.id}
                    className="flex h-full w-72 min-w-[18rem] flex-col rounded-lg bg-column-bg"
                  >
                    {/* Column header */}
                    <div className="flex items-center justify-between rounded-t-lg border-b border-column-border bg-column-header px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">
                          {col.label}
                        </h3>
                        <span className="rounded-full bg-tag-bg px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                          {col.tasks.length}
                        </span>
                      </div>
                      {deptInfo?.deptName && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                          style={{
                            backgroundColor: deptInfo.deptColor
                              ? `${deptInfo.deptColor}18`
                              : undefined,
                            color: deptInfo.deptColor || undefined,
                          }}
                        >
                          {deptInfo.deptName}
                        </span>
                      )}
                    </div>
                    {/* Reuse KanbanColumn's droppable wrapper via a pseudo-column */}
                    <KanbanColumn
                      column={{
                        id: col.id as TaskStatus,
                        label: col.label,
                        wipLimit: 0,
                        tasks: col.tasks,
                      }}
                      wipLimit={0}
                      onTaskClick={(task) => openTaskModal(task)}
                      onRefresh={fetchBoard}
                      displayPreset={displayPreset}
                      showMetadata={showMetadata}
                      selectedTaskId={selectedTaskId}
                      onSelectTask={setSelectedTaskId}
                      groupBy="project"
                      droppableIdPrefix={`proj-${col.id}:`}
                      getDeptForTask={getDeptForTask}
                      hideHeader
                    />
                  </div>
                );
              })}
            </div>
          )}

          {groupBy === "department" && (
            <div className="flex h-full gap-3">
              {departmentColumns.map((col) => (
                <div
                  key={col.id}
                  className="flex h-full w-72 min-w-[18rem] flex-col rounded-lg bg-column-bg"
                >
                  {/* Column header */}
                  <div className="flex items-center justify-between rounded-t-lg border-b border-column-border bg-column-header px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {col.color && (
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: col.color }}
                        />
                      )}
                      <h3 className="text-sm font-semibold text-foreground">
                        {col.label}
                      </h3>
                      <span className="rounded-full bg-tag-bg px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {col.tasks.length}
                      </span>
                    </div>
                  </div>
                  <KanbanColumn
                    column={{
                      id: col.id as TaskStatus,
                      label: col.label,
                      wipLimit: 0,
                      tasks: col.tasks,
                    }}
                    wipLimit={0}
                    onTaskClick={(task) => openTaskModal(task)}
                    onRefresh={fetchBoard}
                    displayPreset={displayPreset}
                    showMetadata={showMetadata}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={setSelectedTaskId}
                    groupBy="department"
                    departmentName={col.label}
                    departmentColor={col.color}
                    droppableIdPrefix={`dept-${col.id}:`}
                    getDeptForTask={getDeptForTask}
                    hideHeader
                  />
                </div>
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
