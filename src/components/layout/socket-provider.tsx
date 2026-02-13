"use client";

import { useEffect, type ReactNode } from "react";
import { useSocket } from "@/hooks/use-socket";
import { useBoardStore } from "@/store/board-store";
import type { TaskWithRelations, TaskStatus, BoardColumn } from "@/types";
import { COLUMN_ORDER, COLUMN_LABELS } from "@/types";

/**
 * SocketProvider — listens for real-time board events and updates the
 * Zustand store so every connected client sees changes instantly.
 *
 * Place this inside the DashboardLayout so it connects once per session.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const { on } = useSocket();
  const { columns, setColumns, wipLimits } = useBoardStore();

  useEffect(() => {
    // ── task:created – add the new task into the right column ──
    const offCreated = on("task:created", (payload: unknown) => {
      const task = payload as TaskWithRelations;
      setColumns(
        useBoardStore.getState().columns.map((col) => {
          if (col.id === task.status) {
            return { ...col, tasks: [...col.tasks, task] };
          }
          return col;
        }),
      );
    });

    // ── task:updated – replace the task in place (may change column) ──
    const offUpdated = on("task:updated", (payload: unknown) => {
      const task = payload as TaskWithRelations;
      const state = useBoardStore.getState();

      // Remove from old column, add to new one
      const newCols = state.columns.map((col) => {
        const without = col.tasks.filter((t) => t.id !== task.id);
        if (col.id === task.status) {
          // Insert at the right position
          const idx =
            task.columnOrder >= 0
              ? Math.min(task.columnOrder, without.length)
              : without.length;
          const tasks = [...without];
          tasks.splice(idx, 0, task);
          return { ...col, tasks };
        }
        return { ...col, tasks: without };
      });
      setColumns(newCols);
    });

    // ── task:deleted – remove from whichever column it was in ──
    const offDeleted = on("task:deleted", (payload: unknown) => {
      const { taskId } = payload as { taskId: string };
      setColumns(
        useBoardStore.getState().columns.map((col) => ({
          ...col,
          tasks: col.tasks.filter((t) => t.id !== taskId),
        })),
      );
    });

    // ── task:reordered – full refresh (cheapest correct approach) ──
    const offReordered = on("task:reordered", () => {
      // Trigger a lightweight board refresh by re-fetching tasks
      refreshBoard();
    });

    // ── board:refresh – explicit full refresh signal ──
    const offRefresh = on("board:refresh", () => {
      refreshBoard();
    });

    return () => {
      offCreated();
      offUpdated();
      offDeleted();
      offReordered();
      offRefresh();
    };
  }, [on, setColumns]);

  return <>{children}</>;
}

/** Re-fetch tasks from the API and rebuild columns */
async function refreshBoard() {
  try {
    const res = await fetch("/api/tasks");
    const tasks: TaskWithRelations[] = await res.json();
    const state = useBoardStore.getState();

    const boardColumns: BoardColumn[] = COLUMN_ORDER.map((status) => ({
      id: status,
      label: COLUMN_LABELS[status],
      wipLimit: state.wipLimits[status] ?? 0,
      tasks: tasks
        .filter((t) => t.status === status)
        .sort((a, b) => a.columnOrder - b.columnOrder),
    }));

    state.setColumns(boardColumns);
  } catch (err) {
    console.error("[socket] refreshBoard failed:", err);
  }
}
