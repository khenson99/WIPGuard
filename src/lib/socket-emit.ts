import { getIO } from "./socket-server";

export type SocketEvent =
  | "task:created"
  | "task:updated"
  | "task:deleted"
  | "task:reordered"
  | "board:refresh";

/**
 * Emit a real-time event to all connected board clients.
 * Safe to call even if Socket.IO hasn't been initialised yet —
 * it silently no-ops so API routes still work for REST-only clients.
 */
export function emitBoardEvent(event: SocketEvent, payload?: unknown): void {
  const io = getIO();
  if (!io) return;
  io.to("board").emit(event, payload);
}
