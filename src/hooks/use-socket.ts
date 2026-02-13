"use client";

import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";

type EventHandler = (payload: unknown) => void;

/**
 * useSocket – connects to the Socket.IO server (once) and joins the "board" room.
 * Returns an `on` helper to subscribe to events and a `connected` flag.
 */
export function useSocket() {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Hit the init endpoint first to ensure the IO server is bootstrapped
    fetch("/api/socketio").finally(() => {
      const socket = io({
        path: "/api/socketio",
        transports: ["websocket", "polling"],
      });

      socket.on("connect", () => {
        console.log("[socket.io] connected:", socket.id);
        socket.emit("join-board");
      });

      socketRef.current = socket;
    });

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
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

  return { on, socketRef };
}
