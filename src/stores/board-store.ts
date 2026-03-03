import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Task, Column, BoardState } from "@/types/board";

export interface BoardStore extends BoardState {
  // Existing actions
  setTasks: (tasks: Task[]) => void;
  setColumns: (columns: Record<string, Column>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  refreshBoard: () => Promise<void>;

  // Optimistic update actions
  updateTaskInPlace: (task: Task) => void;
  removeTaskInPlace: (taskId: string) => void;
  addTaskInPlace: (task: Task) => void;
  reorderColumnInPlace: (columns: Record<string, string[]>) => void;
}

export const useBoardStore = create<BoardStore>()(
  immer((set, get) => ({
    tasks: [],
    columns: {},
    loading: false,
    error: null,

    setTasks: (tasks) =>
      set((state) => {
        state.tasks = tasks;
      }),

    setColumns: (columns) =>
      set((state) => {
        state.columns = columns;
      }),

    setLoading: (loading) =>
      set((state) => {
        state.loading = loading;
      }),

    setError: (error) =>
      set((state) => {
        state.error = error;
      }),

    refreshBoard: async () => {
      const state = get();
      state.setLoading(true);
      state.setError(null);
      try {
        const [tasksRes, columnsRes] = await Promise.all([
          fetch("/api/tasks"),
          fetch("/api/columns"),
        ]);

        if (!tasksRes.ok || !columnsRes.ok) {
          throw new Error("Failed to fetch board data");
        }

        const tasks = await tasksRes.json();
        const columns = await columnsRes.json();

        set((draft) => {
          draft.tasks = tasks;
          draft.columns = columns;
          draft.loading = false;
        });
      } catch (err) {
        set((draft) => {
          draft.loading = false;
          draft.error =
            err instanceof Error ? err.message : "Failed to refresh board";
        });
      }
    },

    /**
     * Update a task in place by replacing it in the tasks array.
     * If the task doesn't exist yet, it will be appended.
     */
    updateTaskInPlace: (task) =>
      set((state) => {
        const index = state.tasks.findIndex((t: Task) => t.id === task.id);
        if (index !== -1) {
          state.tasks[index] = task;
        } else {
          // Task not found locally — append it (may have been created on another client)
          state.tasks.push(task);
        }
      }),

    /**
     * Remove a task from the board state by ID.
     * Also removes the task ID from any column order arrays.
     */
    removeTaskInPlace: (taskId) =>
      set((state) => {
        state.tasks = state.tasks.filter((t: Task) => t.id !== taskId);

        // Clean up column order arrays
        const columnKeys = Object.keys(state.columns);
        for (const key of columnKeys) {
          const column = state.columns[key];
          if (column && Array.isArray(column.taskIds)) {
            column.taskIds = column.taskIds.filter(
              (id: string) => id !== taskId
            );
          }
        }
      }),

    /**
     * Add a new task to the board state.
     * If the task already exists, this is a no-op to prevent duplicates.
     */
    addTaskInPlace: (task) =>
      set((state) => {
        const exists = state.tasks.some((t: Task) => t.id === task.id);
        if (!exists) {
          state.tasks.push(task);
        }
      }),

    /**
     * Reorder columns in place using the provided column -> taskId[] mapping.
     * Only updates columns that are present in the payload.
     */
    reorderColumnInPlace: (columns) =>
      set((state) => {
        const columnKeys = Object.keys(columns);
        for (const key of columnKeys) {
          if (state.columns[key]) {
            state.columns[key].taskIds = columns[key];
          }
        }
      }),
  }))
);
