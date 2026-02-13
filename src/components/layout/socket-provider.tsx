"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useSocket } from "@/hooks/use-socket";
import { useBoardStore } from "@/store/board-store";
import type { TaskWithRelations, BoardColumn } from "@/types";
import { COLUMN_ORDER, COLUMN_LABELS } from "@/types";

interface EventEnvelope<T = unknown> {
  eventId: string;
  emittedAt: string;
  payload: T;
}

function parseEventPayload<T>(raw: unknown): {
  eventId: string | null;
  payload: T;
} {
  if (
    raw &&
    typeof raw === "object" &&
    "eventId" in raw &&
    "payload" in raw &&
    typeof (raw as { eventId?: unknown }).eventId === "string"
  ) {
    const envelope = raw as EventEnvelope<T>;
    return { eventId: envelope.eventId, payload: envelope.payload };
  }
  return { eventId: null, payload: raw as T };
}

/**
 * SocketProvider — listens for real-time board events and updates the
 * Zustand store so every connected client sees changes instantly.
 *
 * Place this inside the DashboardLayout so it connects once per session.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const { on } = useSocket();
  const { setColumns } = useBoardStore();
  const seenEventIds = useRef<Set<string>>(new Set());

  const markSeen = (eventId: string | null): boolean => {
    if (!eventId) return false;
    if (seenEventIds.current.has(eventId)) return true;
    seenEventIds.current.add(eventId);
    if (seenEventIds.current.size > 500) {
      const oldest = seenEventIds.current.values().next().value;
      if (oldest) seenEventIds.current.delete(oldest);
    }
    return false;
  };

  useEffect(() => {
    // ── task:created – add the new task into the right column ──
    const offCreated = on("task:created", (raw: unknown) => {
      const { eventId, payload: task } = parseEventPayload<TaskWithRelations>(raw);
      if (markSeen(eventId)) return;
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
    const offUpdated = on("task:updated", (raw: unknown) => {
      const { eventId, payload: task } = parseEventPayload<TaskWithRelations>(raw);
      if (markSeen(eventId)) return;
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
    const offDeleted = on("task:deleted", (raw: unknown) => {
      const { eventId, payload } = parseEventPayload<{ taskId: string }>(raw);
      if (markSeen(eventId)) return;
      const { taskId } = payload as { taskId: string };
      setColumns(
        useBoardStore.getState().columns.map((col) => ({
          ...col,
          tasks: col.tasks.filter((t) => t.id !== taskId),
        })),
      );
    });

    // ── task:reordered – full refresh (cheapest correct approach) ──
    const offReordered = on("task:reordered", (raw: unknown) => {
      const { eventId } = parseEventPayload(raw);
      if (markSeen(eventId)) return;
      // Trigger a lightweight board refresh by re-fetching tasks
      refreshBoard();
    });

    // ── board:refresh – explicit full refresh signal ──
    const offRefresh = on("board:refresh", (raw: unknown) => {
      const { eventId } = parseEventPayload(raw);
      if (markSeen(eventId)) return;
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
