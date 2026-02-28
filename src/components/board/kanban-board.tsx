"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  DragDropContext,
  type DropResult,
} from "@hello-pangea/dnd";
import { useBoardStore } from "@/store/board-store";
import { KanbanColumn } from "./kanban-column";
import { TaskModal } from "../tasks/task-modal";
import { BoardFilters } from "./board-filters";
import type {
  TaskStatus,
  TaskWithRelations,
  BoardColumn,
  DepartmentSummary,
  ProjectSummary,
  UserSummary,
  SprintSummary,
} from "@/types";
import { COLUMN_ORDER, COLUMN_LABELS } from "@/types";
import type { GroupByMode } from "./task-card";
import { Eye, EyeOff, Keyboard, Plus, Layers, X, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useSession } from "next-auth/react";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";

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

interface BoardSettingsEntry {
  columnName: string;
  wipLimit: number;
}

type BoardProjectLite = ProjectSummary & {
  departmentId?: string | null;
};

interface KanbanSnapshot {
  tasks: TaskWithRelations[];
  settings: BoardSettingsEntry[];
  team: UserSummary[];
  projects: BoardProjectLite[];
  sprints: SprintSummary[];
  departments: DepartmentSummary[];
  activeSprintId?: string | null;
  committedTaskIds?: string[];
}

interface ReplenishmentNotice {
  taskId: string;
  title: string;
  updatedAt?: string;
}

/* ============================================================
   Confirm Dialog & Toast types
   ============================================================ */

interface ConfirmDialogState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "warning" | "destructive";
  resolve: (confirmed: boolean) => void;
}

type ToastVariant = "error" | "warning" | "success" | "info";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

/* ============================================================
   Inline Toast Component
   ============================================================ */

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => {
        const variantStyles: Record<ToastVariant, string> = {
          error: "border-red-500/30 bg-red-950/90 text-red-200",
          warning: "border-amber-500/30 bg-amber-950/90 text-amber-200",
          success: "border-emerald-500/30 bg-emerald-950/90 text-emerald-200",
          info: "border-blue-500/30 bg-blue-950/90 text-blue-200",
        };

        const iconMap: Record<ToastVariant, React.ReactNode> = {
          error: <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />,
          warning: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />,
          success: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />,
          info: <Info className="h-4 w-4 shrink-0 text-blue-400" />,
        };

        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 ${variantStyles[toast.variant]}`}
            role="alert"
          >
            {iconMap[toast.variant]}
            <p className="text-sm font-medium leading-snug">{toast.message}</p>
            <button
              onClick={() => onDismiss(toast.id)}
              className="ml-2 shrink-0 rounded-md p-0.5 opacity-70 transition-opacity hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   Inline Confirm Dialog Component
   ============================================================ */

function ConfirmDialog({
  dialog,
  onConfirm,
  onCancel,
}: {
  dialog: ConfirmDialogState;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!dialog.open) return null;

  const isDestructive = dialog.variant === "destructive";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in"
        onClick={onCancel}
      />
      {/* Dialog */}
      <div className="relative z-10 mx-4 w-full max-w-md rounded-2xl border border-border/60 bg-background p-6 shadow-2xl animate-in fade-in zoom-in-95" role="dialog" aria-modal="true">
        <div className="flex items-start gap-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isDestructive ? "bg-red-500/15" : "bg-amber-500/15"}`}>
            <AlertTriangle className={`h-5 w-5 ${isDestructive ? "text-red-500" : "text-amber-500"}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-foreground">{dialog.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{dialog.message}</p>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border/60 px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          >
            {dialog.cancelLabel || "Cancel"}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className={`rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background ${
              isDestructive
                ? "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
                : "bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-primary"
            }`}
          >
            {dialog.confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
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
  const [activeSprintId, setActiveSprintId] = useState<string | null>(null);
  const [committedTaskIds, setCommittedTaskIds] = useState<Set<string>>(new Set());
  const [replenishmentNotice, setReplenishmentNotice] = useState<ReplenishmentNotice | null>(null);

  /* ----- Confirm Dialog state ----- */
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const confirmResolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const showConfirm = useCallback(
    (opts: { title: string; message: string; confirmLabel?: string; cancelLabel?: string; variant?: "warning" | "destructive" }): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        confirmResolveRef.current = resolve;
        setConfirmDialog({
          open: true,
          title: opts.title,
          message: opts.message,
          confirmLabel: opts.confirmLabel,
          cancelLabel: opts.cancelLabel,
          variant: opts.variant ?? "warning",
          resolve,
        });
      });
    },
    []
  );

  const handleConfirmDialogConfirm = useCallback(() => {
    confirmResolveRef.current?.(true);
    confirmResolveRef.current = null;
    setConfirmDialog(null);
  }, []);

  const handleConfirmDialogCancel = useCallback(() => {
    confirmResolveRef.current?.(false);
    confirmResolveRef.current = null;
    setConfirmDialog(null);
  }, []);

  /* ----- Toast state ----- */
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdCounter = useRef(0);

  const addToast = useCallback((message: string, variant: ToastVariant = "error") => {
    const id = `toast-${++toastIdCounter.current}`;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const boardCacheKey = useMemo(() => {
    const statusKey = filterByStatus && filterByStatus.length > 0 ? filterByStatus.join(",") : "all";
    return [
      "dashboard:kanban:v1",
      filterByUser || "all",
      filterAssignee || "all",
      filterProject || "all",
      filterPriority || "all",
      filterSprint || "all",
      statusKey,
    ].join(":");
  }, [filterAssignee, filterByStatus, filterByUser, filterPriority, filterProject, filterSprint]);

  const applyBoardSnapshot = useCallback(
    (snapshot: KanbanSnapshot) => {
      const tasks = snapshot.tasks;
      const settings = snapshot.settings;
      const team = snapshot.team;
      const projects = snapshot.projects;
      const sprints = snapshot.sprints;
      const depts = snapshot.departments;

      setTeamMembers(team);
      setProjects(projects);
      setSprints(sprints);
      setDepartments(depts);
      const derivedActiveSprintId =
        snapshot.activeSprintId ?? sprints.find((s) => s.isActive)?.id ?? null;
      setActiveSprintId(derivedActiveSprintId);
      setCommittedTaskIds(new Set(snapshot.committedTaskIds ?? []));
      setAllTasks(tasks);
      setProjectList(
        projects.map((p) => ({
          id: p.id,
          name: p.name,
          departmentId: p.departmentId || null,
        }))
      );

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

      const limits: Record<TaskStatus, number> = {
        BACKLOG: 0,
        QUEUED: 0,
        WORKING_ON_TODAY: 3,
        ACTIVE: 1,
        NOT_DONE: 0,
        DONE: 0,
      };
      for (const s of settings) {
        if (s.columnName in limits) {
          limits[s.columnName as TaskStatus] = s.wipLimit;
        }
      }
      setWipLimits(limits);

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
    },
    [filterByStatus, setColumns, setProjects, setSprints, setTeamMembers, setWipLimits]
  );

  const fetchBoard = useCallback(async (signal?: AbortSignal) => {
    try {
      const params = new URLSearchParams();
      if (filterByUser) params.set("assignee", filterByUser);
      if (filterAssignee) params.set("assignee", filterAssignee);
      if (filterProject) params.set("project", filterProject);
      if (filterPriority) params.set("priority", filterPriority);
      if (filterSprint) params.set("sprint", filterSprint);

      const [tasksRes, settingsRes, teamRes, projectsRes, sprintsRes, deptsRes] =
        await Promise.all([
          fetch(`/api/tasks?${params}`, { signal }),
          fetch("/api/board-settings", { signal }),
          fetch("/api/team", { signal }),
          fetch("/api/projects", { signal }),
          fetch("/api/sprints", { signal }),
          fetch("/api/departments", { signal }),
        ]);

      const tasks: TaskWithRelations[] = await tasksRes.json();
      const settings: BoardSettingsEntry[] = await settingsRes.json();
      const team = await teamRes.json();
      const projects: BoardProjectLite[] = await projectsRes.json();
      const sprints = await sprintsRes.json();
      const depts: DepartmentSummary[] = deptsRes.ok ? await deptsRes.json() : [];
      const activeSprint = Array.isArray(sprints)
        ? (sprints as SprintSummary[]).find((s) => s.isActive)
        : null;

      let committedTaskIds: string[] = [];
      if (activeSprint?.id) {
        const reportRes = await fetch(`/api/sprints/${activeSprint.id}/report`, { signal });
        if (reportRes.ok) {
          const report = await reportRes.json();
          committedTaskIds =
            report?.plannedVsUnplanned?.commitmentSnapshot?.committedTaskIds ?? [];
        }
      }

      if (signal?.aborted) return;

      const snapshot: KanbanSnapshot = {
        tasks,
        settings: Array.isArray(settings) ? settings : [],
        team: Array.isArray(team) ? (team as UserSummary[]) : [],
        projects: Array.isArray(projects) ? projects : [],
        sprints: Array.isArray(sprints) ? (sprints as SprintSummary[]) : [],
        departments: depts,
        activeSprintId: activeSprint?.id ?? null,
        committedTaskIds,
      };

      applyBoardSnapshot(snapshot);
      writeSessionCache<KanbanSnapshot>(boardCacheKey, snapshot);
    } catch (err) {
      console.error("Failed to fetch board data:", err);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [
    applyBoardSnapshot,
    boardCacheKey,
    filterByUser,
    filterAssignee,
    filterProject,
    filterPriority,
    filterSprint,
  ]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const cached = readSessionCache<KanbanSnapshot>(boardCacheKey);

    if (cached) {
      queueMicrotask(() => {
        if (!active) return;
        applyBoardSnapshot(cached);
        setLoading(false);
      });
    } else {
      queueMicrotask(() => {
        if (!active) return;
        setLoading(true);
      });
    }

    void fetchBoard(controller.signal);

    return () => {
      active = false;
      controller.abort();
    };
  }, [applyBoardSnapshot, boardCacheKey, fetchBoard]);

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

    // Return only project columns that currently have tasks.
    const result: GenericColumn[] = [];
    for (const p of projectList) {
      const col = colMap.get(p.id)!;
      if (col.tasks.length > 0) {
        result.push(col);
      }
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
          const proceed = await showConfirm({
            title: "WIP Limit Exceeded",
            message: `The WIP limit (${limit}) for "${COLUMN_LABELS[toColumn]}" has been reached. Do you want to override it?`,
            confirmLabel: "Override",
            variant: "warning",
          });
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
            addToast(message, "warning");
          }
          throw new Error("Failed to reorder task");
        }
      } catch {
        // Revert on failure
        fetchBoard();
      }
    },
    [columns, wipLimits, moveTask, fetchBoard, groupBy, showConfirm, addToast]
  );

  const handleCreateTask = () => {
    openTaskModal(null);
  };

  const queuedTaskCount = useMemo(
    () => columns.find((column) => column.id === "QUEUED")?.tasks.length ?? 0,
    [columns]
  );

  const handleReplenishTask = useCallback(
    async (task: TaskWithRelations) => {
      if (task.status !== "BACKLOG") return;

      const queuedLimit = wipLimits.QUEUED;
      if (queuedLimit > 0 && queuedTaskCount >= queuedLimit) {
        const proceed = await showConfirm({
          title: "Queued Budget Full",
          message: `The Queued WIP budget is full (${queuedTaskCount}/${queuedLimit}). Do you want to replenish anyway?`,
          confirmLabel: "Replenish",
          variant: "warning",
        });
        if (!proceed) return;
      }

      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "QUEUED",
          expectedUpdatedAt: task.updatedAt,
        }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          const conflict = await response.json().catch(() => null);
          addToast(
            conflict?.conflict?.message ||
              conflict?.error ||
              "Task changed before replenish was applied. Refreshing board.",
            "warning"
          );
        } else {
          addToast("Failed to replenish task. Please try again.", "error");
        }
        void fetchBoard();
        return;
      }

      const updated = await response.json().catch(() => null);
      setReplenishmentNotice({
        taskId: task.id,
        title: task.title,
        updatedAt: updated?.updatedAt,
      });
      void fetchBoard();
    },
    [fetchBoard, queuedTaskCount, wipLimits.QUEUED, showConfirm, addToast]
  );

  const handleUndoReplenish = useCallback(async () => {
    if (!replenishmentNotice) return;

    const response = await fetch(`/api/tasks/${replenishmentNotice.taskId}/retreat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        replenishmentNotice.updatedAt
          ? { expectedUpdatedAt: replenishmentNotice.updatedAt }
          : {}
      ),
    });

    if (!response.ok) {
      if (response.status === 409) {
        const conflict = await response.json().catch(() => null);
        addToast(
          conflict?.conflict?.message ||
            conflict?.error ||
            "Task changed before undo was applied. Refreshing board.",
          "warning"
        );
      } else {
        addToast("Failed to undo replenish action.", "error");
      }
    }

    setReplenishmentNotice(null);
    void fetchBoard();
  }, [fetchBoard, replenishmentNotice, addToast]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  /* ----- Render ----- */
  return (
    <div className="relative h-full overflow-x-auto overflow-y-auto" onKeyDown={handleBoardKeyDown} tabIndex={0}>
      <div className="inline-flex min-w-full flex-col">
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b border-border/40 bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-sm">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <BoardFilters />
          <div className="flex items-center gap-2.5">
            {/* Group By selector */}
            <div className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-secondary/50 px-2.5 py-1.5 shadow-sm transition-colors hover:bg-secondary">
              <Layers className="h-4 w-4 text-muted-foreground" />
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
              className="rounded-lg border border-border/50 bg-secondary/50 px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-secondary outline-none"
              title="Display preset"
            >
              <option value="standard">Standard</option>
              <option value="dense">Dense</option>
              <option value="triage">Triage</option>
            </select>
            <button
              onClick={() => setShowMetadata((current) => !current)}
              className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-secondary/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-secondary hover:text-foreground outline-none"
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
          className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-primary to-primary/80 px-4 py-2 text-sm font-bold text-primary-foreground shadow-md transition-all hover:scale-105 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Task</span>
        </button>
      </div>
      {replenishmentNotice && (
        <div className="mx-6 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 to-transparent px-4 py-3 text-sm shadow-sm backdrop-blur-sm animate-in fade-in slide-in-from-top-2">
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            Replenished <strong className="font-bold">{replenishmentNotice.title}</strong> to Queued. Logged in status history.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleUndoReplenish}
              className="rounded-lg border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-600 shadow-sm transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
            >
              Undo
            </button>
            <button
              onClick={() => setReplenishmentNotice(null)}
              className="rounded-lg px-3 py-1 text-xs font-bold text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="p-6 pt-4">
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
                  currentUserId={session?.user?.id ?? null}
                  activeSprintId={activeSprintId}
                  committedTaskIds={committedTaskIds}
                  queuedCount={queuedTaskCount}
                  queuedWipLimit={wipLimits.QUEUED}
                  onReplenishTask={handleReplenishTask}
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
                      currentUserId={session?.user?.id ?? null}
                      activeSprintId={activeSprintId}
                      committedTaskIds={committedTaskIds}
                      queuedCount={queuedTaskCount}
                      queuedWipLimit={wipLimits.QUEUED}
                      onReplenishTask={handleReplenishTask}
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
                    currentUserId={session?.user?.id ?? null}
                    activeSprintId={activeSprintId}
                    committedTaskIds={committedTaskIds}
                    queuedCount={queuedTaskCount}
                    queuedWipLimit={wipLimits.QUEUED}
                    onReplenishTask={handleReplenishTask}
                  />
                </div>
              ))}
            </div>
          )}
        </DragDropContext>
      </div>
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

      {/* Confirm Dialog */}
      {confirmDialog && (
        <ConfirmDialog
          dialog={confirmDialog}
          onConfirm={handleConfirmDialogConfirm}
          onCancel={handleConfirmDialogCancel}
        />
      )}

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
