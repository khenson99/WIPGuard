import type { SocketEventMap, SocketEventName } from "./socket-events";
import { parseEventPayloadStrict } from "./socket-events";

// ─── Socket reference (set by the socket provider) ───────────────────────────

interface SocketLike {
  emit(event: string, payload: unknown): void;
  connected: boolean;
}

let _socket: SocketLike | null = null;

/**
 * Called by the socket provider to register the active socket instance.
 */
export function setSocket(socket: SocketLike | null): void {
  _socket = socket;
}

/**
 * Returns the current socket instance (mainly for testing).
 */
export function getSocket(): SocketLike | null {
  return _socket;
}

// ─── Type-safe emit ──────────────────────────────────────────────────────────

/**
 * Emit a board event with compile-time AND runtime payload validation.
 *
 * @example
 * emitBoardEvent("task:created", { task: myTask });
 * // TypeScript error if payload doesn't match SocketEventMap["task:created"]
 */
export function emitBoardEvent<E extends SocketEventName>(
  event: E,
  payload: SocketEventMap[E],
): void {
  // Runtime validation — catches issues in dev/test even when TS is bypassed
  const validated = parseEventPayloadStrict(event, payload);

  if (!_socket) {
    console.warn(
      `[socket-emit] Cannot emit "${event}": no socket connected`,
    );
    return;
  }

  if (!_socket.connected) {
    console.warn(
      `[socket-emit] Cannot emit "${event}": socket not connected`,
    );
    return;
  }

  _socket.emit(event, validated);
}
