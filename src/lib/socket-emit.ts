import { getIO } from "./socket-server";
import { randomUUID } from "node:crypto";

export type SocketEvent =
  | "task:created"
  | "task:updated"
  | "task:deleted"
  | "task:reordered"
  | "board:refresh";

export interface SocketEnvelope<T = unknown> {
  eventId: string;
  emittedAt: string;
  payload: T;
}

/**
 * Emit a real-time event to all connected board clients.
 * Safe to call even if Socket.IO hasn't been initialised yet —
 * it silently no-ops so API routes still work for REST-only clients.
 */
export function emitBoardEvent(
  event: SocketEvent,
  payload?: unknown,
  eventId?: string
): void {
  const io = getIO();
  if (!io) {
    console.warn(`[socket.io] event dropped (server not initialised): ${event}`);
    return;
  }
  const envelope: SocketEnvelope = {
    eventId: eventId ?? `${event}:${randomUUID()}`,
    emittedAt: new Date().toISOString(),
    payload,
  };
  io.to("board").emit(event, envelope);
}
