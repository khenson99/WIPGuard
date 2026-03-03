import { getIO } from "@/lib/socket-server";

export type BoardEventType =
  | "task:created"
  | "task:updated"
  | "task:deleted"
  | "task:reordered";

export interface BoardEventPayload {
  type: BoardEventType;
  projectId: string;
  data: Record<string, unknown>;
}

/**
 * Emit a board event to all authenticated clients in a project-scoped room.
 *
 * @param projectId - The project to target
 * @param type      - The event type (e.g. "task:created")
 * @param data      - The event payload
 */
export function emitBoardEvent(
  projectId: string,
  type: BoardEventType,
  data: Record<string, unknown>
): void {
  const io = getIO();
  if (!io) {
    console.warn(
      "[socket-emit] Socket.IO server not initialized, skipping emit"
    );
    return;
  }

  if (!projectId) {
    console.warn("[socket-emit] No projectId provided, skipping emit");
    return;
  }

  const room = `project:${projectId}`;
  const payload: BoardEventPayload = { type, projectId, data };

  io.to(room).emit(type, payload);
}

/**
 * Emit a task created event to the project room.
 */
export function emitTaskCreated(
  projectId: string,
  task: Record<string, unknown>
): void {
  emitBoardEvent(projectId, "task:created", task);
}

/**
 * Emit a task updated event to the project room.
 */
export function emitTaskUpdated(
  projectId: string,
  task: Record<string, unknown>
): void {
  emitBoardEvent(projectId, "task:updated", task);
}

/**
 * Emit a task deleted event to the project room.
 */
export function emitTaskDeleted(
  projectId: string,
  taskId: string
): void {
  emitBoardEvent(projectId, "task:deleted", { id: taskId });
}

/**
 * Emit a task reordered event to the project room.
 */
export function emitTaskReordered(
  projectId: string,
  reorderData: Record<string, unknown>
): void {
  emitBoardEvent(projectId, "task:reordered", reorderData);
}
