"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { useBoardStore } from "@/stores/board-store";
import type { Task } from "@/types/board";

interface SocketContextValue {
  emit: (event: string, data?: unknown) => void;
  on: (event: string, handler: (...args: unknown[]) => void) => () => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return ctx;
}

interface SocketProviderProps {
  children: ReactNode;
  url?: string;
}

/**
 * Validates that a payload contains a task-like object with at minimum an `id` field.
 */
function isValidTaskPayload(data: unknown): data is { task: Task } {
  if (typeof data !== "object" || data === null) return false;
  const record = data as Record<string, unknown>;
  if (typeof record.task !== "object" || record.task === null) return false;
  const task = record.task as Record<string, unknown>;
  return typeof task.id === "string" && task.id.length > 0;
}

/**
 * Validates that a payload contains a taskId string.
 */
function isValidDeletePayload(
  data: unknown
): data is { taskId: string } {
  if (typeof data !== "object" || data === null) return false;
  const record = data as Record<string, unknown>;
  return typeof record.taskId === "string" && record.taskId.length > 0;
}

/**
 * Validates that a payload contains a columns mapping of string -> string[].
 */
function isValidReorderPayload(
  data: unknown
): data is { columns: Record<string, string[]> } {
  if (typeof data !== "object" || data === null) return false;
  const record = data as Record<string, unknown>;
  if (typeof record.columns !== "object" || record.columns === null)
    return false;
  const columns = record.columns as Record<string, unknown>;
  return Object.values(columns).every(
    (val) =>
      Array.isArray(val) && val.every((item) => typeof item === "string")
  );
}

export function SocketProvider({ children, url }: SocketProviderProps) {
  const socketRef = useRef<Socket | null>(null);

  const emit = useCallback((event: string, data?: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  const on = useCallback(
    (event: string, handler: (...args: unknown[]) => void) => {
      socketRef.current?.on(event, handler);
      return () => {
        socketRef.current?.off(event, handler);
      };
    },
    []
  );

  useEffect(() => {
    const socketUrl = url || process.env.NEXT_PUBLIC_SOCKET_URL || "";
    const socket = io(socketUrl, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    const store = useBoardStore.getState;

    // --- Optimistic WebSocket event handlers ---

    /**
     * task:created — Add the new task in place.
     * Falls back to full refresh if the payload doesn't include the full task.
     */
    socket.on("task:created", (data: unknown) => {
      try {
        if (isValidTaskPayload(data)) {
          store().addTaskInPlace(data.task);
        } else {
          console.warn(
            "[socket] task:created payload missing task data, falling back to refresh"
          );
          store().refreshBoard();
        }
      } catch (err) {
        console.error("[socket] Error handling task:created, refreshing", err);
        store().refreshBoard();
      }
    });

    /**
     * task:updated — Replace the task in place with the updated version.
     * Falls back to full refresh if the payload doesn't include the full task.
     */
    socket.on("task:updated", (data: unknown) => {
      try {
        if (isValidTaskPayload(data)) {
          store().updateTaskInPlace(data.task);
        } else {
          console.warn(
            "[socket] task:updated payload missing task data, falling back to refresh"
          );
          store().refreshBoard();
        }
      } catch (err) {
        console.error("[socket] Error handling task:updated, refreshing", err);
        store().refreshBoard();
      }
    });

    /**
     * task:deleted — Remove the task from the local state.
     * Falls back to full refresh if the payload doesn't include a taskId.
     */
    socket.on("task:deleted", (data: unknown) => {
      try {
        if (isValidDeletePayload(data)) {
          store().removeTaskInPlace(data.taskId);
        } else {
          console.warn(
            "[socket] task:deleted payload missing taskId, falling back to refresh"
          );
          store().refreshBoard();
        }
      } catch (err) {
        console.error("[socket] Error handling task:deleted, refreshing", err);
        store().refreshBoard();
      }
    });

    /**
     * task:reordered — Apply column order changes in place.
     * This is the key optimization: instead of 6 API calls, we just
     * reorder the taskIds arrays in the affected columns.
     * Falls back to full refresh if the payload doesn't include column data.
     */
    socket.on("task:reordered", (data: unknown) => {
      try {
        if (isValidReorderPayload(data)) {
          store().reorderColumnInPlace(data.columns);
        } else {
          console.warn(
            "[socket] task:reordered payload missing columns data, falling back to refresh"
          );
          store().refreshBoard();
        }
      } catch (err) {
        console.error(
          "[socket] Error handling task:reordered, refreshing",
          err
        );
        store().refreshBoard();
      }
    });

    socket.on("connect_error", (err) => {
      console.error("[socket] Connection error:", err.message);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [url]);

  return (
    <SocketContext.Provider value={{ emit, on }}>
      {children}
    </SocketContext.Provider>
  );
}
