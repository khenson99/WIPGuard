"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";

type EventHandler = (payload: unknown) => void;

const BOOTSTRAP_URL = "/api/realtime/bootstrap";
const BOOTSTRAP_MAX_RETRIES = 3;
const BOOTSTRAP_BASE_DELAY_MS = 1000;

async function bootstrapWithRetry(): Promise<boolean> {
  for (let attempt = 1; attempt <= BOOTSTRAP_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(BOOTSTRAP_URL, { cache: "no-store" });
      if (res.ok) return true;
      console.warn(
        `[socket.io] bootstrap returned ${res.status} (attempt ${attempt}/${BOOTSTRAP_MAX_RETRIES})`,
      );
    } catch (err) {
      console.warn(
        `[socket.io] bootstrap fetch failed (attempt ${attempt}/${BOOTSTRAP_MAX_RETRIES}):`,
        err,
      );
    }
    if (attempt < BOOTSTRAP_MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, BOOTSTRAP_BASE_DELAY_MS * attempt));
    }
  }
  return false;
}

/**
 * useSocket – connects to the Socket.IO server (once) and joins the "board" room.
 * Automatically reconnects on disconnection with exponential backoff.
 * Returns an `on` helper to subscribe to events and a `connected` flag.
 */
export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      const bootstrapOk = await bootstrapWithRetry();
      if (cancelled) return;

      if (!bootstrapOk) {
        console.error(
          "[socket.io] bootstrap failed after retries — connecting anyway as fallback",
        );
      }

      const socket = io({
        path: "/api/socketio",
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
      });

      socket.on("connect", () => {
        console.log("[socket.io] connected:", socket.id);
        setConnected(true);
        socket.emit("join-board");
      });

      socket.on("disconnect", (reason) => {
        console.warn("[socket.io] disconnected:", reason);
        setConnected(false);
      });

      socket.on("reconnect", (attemptNumber: number) => {
        console.log(`[socket.io] reconnected after ${attemptNumber} attempt(s)`);
        // Re-join the board room after reconnection
        socket.emit("join-board");
      });

      socket.on("reconnect_error", (err: Error) => {
        console.warn("[socket.io] reconnect error:", err.message);
      });

      socket.on("reconnect_failed", () => {
        console.error("[socket.io] reconnection failed after all attempts");
      });

      socketRef.current = socket;
    }

    connect();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, []);

  const on = useCallback((event: string, handler: EventHandler) => {
    const socket = socketRef.current;
    if (!socket) return () => {};

    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
    };
  }, []);

  return { on, connected, socketRef };
}
