import { create } from "zustand";
import type {
  TaskWithRelations,
  TaskStatus,
  BoardColumn,
  SprintSummary,
  ProjectSummary,
  UserSummary,
  DepartmentSummary,
} from "@/types";
import { COLUMN_ORDER, COLUMN_LABELS } from "@/types";

interface BoardState {
  columns: BoardColumn[];
  wipLimits: Record<TaskStatus, number>;
  selectedTask: TaskWithRelations | null;
  isTaskModalOpen: boolean;
  sprints: SprintSummary[];
  activeSprint: SprintSummary | null;
  projects: ProjectSummary[];
  departments: DepartmentSummary[];
  teamMembers: UserSummary[];
  filterAssignee: string | null;
  filterProject: string | null;
  filterPriority: string | null;
  filterSprint: string | null;

  // Actions
  setColumns: (columns: BoardColumn[]) => void;
  setWipLimits: (limits: Record<TaskStatus, number>) => void;
  moveTask: (
    taskId: string,
    fromColumn: TaskStatus,
    toColumn: TaskStatus,
    newOrder: number
  ) => void;
  openTaskModal: (task: TaskWithRelations | null) => void;
  closeTaskModal: () => void;
  setSprints: (sprints: SprintSummary[]) => void;
  setActiveSprint: (sprint: SprintSummary | null) => void;
  setProjects: (projects: ProjectSummary[]) => void;
  setDepartments: (departments: DepartmentSummary[]) => void;
  setTeamMembers: (members: UserSummary[]) => void;
  setFilter: (
    key: "filterAssignee" | "filterProject" | "filterPriority" | "filterSprint",
    value: string | null
  ) => void;
  isWipExceeded: (column: TaskStatus) => boolean;
}

export const useBoardStore = create<BoardState>((set, get) => ({
  columns: COLUMN_ORDER.map((status) => ({
    id: status,
    label: COLUMN_LABELS[status],
    wipLimit: 0,
    tasks: [],
  })),
  wipLimits: {
    BACKLOG: 0,
    QUEUED: 0,
    WORKING_ON_TODAY: 3,
    ACTIVE: 1,
    NOT_DONE: 0,
    DONE: 0,
  },
  selectedTask: null,
  isTaskModalOpen: false,
  sprints: [],
  activeSprint: null,
  projects: [],
  departments: [],
  teamMembers: [],
  filterAssignee: null,
  filterProject: null,
  filterPriority: null,
  filterSprint: null,

  setColumns: (columns) => set({ columns }),

  setWipLimits: (limits) => set({ wipLimits: limits }),

  moveTask: (taskId, fromColumn, toColumn, newOrder) => {
    set((state) => {
      const newColumns = state.columns.map((col) => {
        if (col.id === fromColumn) {
          return {
            ...col,
            tasks: col.tasks.filter((t) => t.id !== taskId),
          };
        }
        if (col.id === toColumn) {
          const movedTask = state.columns
            .find((c) => c.id === fromColumn)
            ?.tasks.find((t) => t.id === taskId);
          if (!movedTask) return col;

          const updatedTask = {
            ...movedTask,
            status: toColumn,
            columnOrder: newOrder,
          };
          const newTasks = [...col.tasks];
          newTasks.splice(newOrder, 0, updatedTask);
          return { ...col, tasks: newTasks };
        }
        return col;
      });
      return { columns: newColumns };
    });
  },

  openTaskModal: (task) =>
    set({ selectedTask: task, isTaskModalOpen: true }),

  closeTaskModal: () =>
    set({ selectedTask: null, isTaskModalOpen: false }),

  setSprints: (sprints) => set({ sprints }),

  setActiveSprint: (sprint) => set({ activeSprint: sprint }),

  setProjects: (projects) => set({ projects }),

  setDepartments: (departments) => set({ departments }),

  setTeamMembers: (members) => set({ teamMembers: members }),

  setFilter: (key, value) => set({ [key]: value }),

  isWipExceeded: (column) => {
    const state = get();
    const limit = state.wipLimits[column];
    if (limit === 0) return false;
    const col = state.columns.find((c) => c.id === column);
    return col ? col.tasks.length >= limit : false;
  },
}));
