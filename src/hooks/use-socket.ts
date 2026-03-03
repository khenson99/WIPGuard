import { useCallback, useEffect, useRef } from "react";
import type { SocketEventMap, SocketEventName } from "@/lib/socket-events";
import { validateEventPayload } from "@/lib/socket-events";
import { emitBoardEvent } from "@/lib/socket-emit";

// ─── Socket instance type (compatible with socket.io-client) ─────────────────

interface SocketInstance {
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
  connected: boolean;
}

// ─── Typed handler ───────────────────────────────────────────────────────────

export type TypedEventHandler<E extends SocketEventName> = (
  payload: SocketEventMap[E],
) => void;

// ─── Hook ────────────────────────────────────────────────────────────────────

interface UseSocketOptions {
  socket: SocketInstance | null;
}

export interface UseSocketReturn {
  /**
   * Subscribe to a typed socket event. Returns an unsubscribe function.
   * Payloads are validated at runtime with Zod — invalid payloads are
   * logged and silently dropped so one bad message doesn't crash the UI.
   */
  on: <E extends SocketEventName>(
    event: E,
    handler: TypedEventHandler<E>,
  ) => () => void;

  /**
   * Emit a typed socket event with runtime validation.
   */
  emit: typeof emitBoardEvent;
}

export function useSocket({ socket }: UseSocketOptions): UseSocketReturn {
  // Keep a stable ref to avoid re-registering listeners on every render
  const socketRef = useRef(socket);
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  const on = useCallback(
    <E extends SocketEventName>(
      event: E,
      handler: TypedEventHandler<E>,
    ): (() => void) => {
      const currentSocket = socketRef.current;
      if (!currentSocket) {
        return () => {
          /* noop */
        };
      }

      const wrappedHandler = (...args: unknown[]) => {
        const raw = args[0];
        const result = validateEventPayload(event, raw);

        if (!result.success) {
          console.error(
            `[use-socket] Invalid payload for "${event}":`,
            result.error.format(),
          );
          return;
        }

        handler(result.data);
      };

      currentSocket.on(event, wrappedHandler);

      return () => {
        currentSocket.off(event, wrappedHandler);
      };
    },
    [],
  );

  return { on, emit: emitBoardEvent };
}
