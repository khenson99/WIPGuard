import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";

export interface UseSocketOptions {
  url?: string;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onReconnect?: (attemptNumber: number) => void;
  onBoardEvent?: (event: string, data: unknown) => void;
  refreshBoard?: () => void;
  showToast?: (message: string) => void;
}

export function useSocket(options: UseSocketOptions = {}) {
  const {
    url = "/",
    onConnect,
    onDisconnect,
    onReconnect,
    onBoardEvent,
    refreshBoard,
    showToast,
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const connectedRef = useRef(false);

  const getSocket = useCallback(() => socketRef.current, []);

  useEffect(() => {
    const socket = io(url, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      connectedRef.current = true;
      onConnect?.();
    });

    socket.on("disconnect", (reason: string) => {
      connectedRef.current = false;
      onDisconnect?.(reason);
    });

    socket.io.on("reconnect", (attemptNumber: number) => {
      connectedRef.current = true;
      socket.emit("join-board");

      // Re-fetch full board state to recover any events missed during disconnect
      if (refreshBoard) {
        refreshBoard();
      }

      // Notify user that board is being refreshed after reconnection
      if (showToast) {
        showToast("Reconnected — refreshing board...");
      }

      onReconnect?.(attemptNumber);
    });

    // Board event listeners
    const boardEvents = [
      "task:created",
      "task:updated",
      "task:deleted",
      "task:reordered",
    ];

    boardEvents.forEach((event) => {
      socket.on(event, (data: unknown) => {
        onBoardEvent?.(event, data);
      });
    });

    // Join board room on initial connect
    socket.on("connect", () => {
      socket.emit("join-board");
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      connectedRef.current = false;
    };
  }, [url, onConnect, onDisconnect, onReconnect, onBoardEvent, refreshBoard, showToast]);

  return {
    getSocket,
    isConnected: () => connectedRef.current,
  };
}
