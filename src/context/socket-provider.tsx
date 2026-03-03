import React, {
  createContext,
  useContext,
  useCallback,
  useState,
  useMemo,
  ReactNode,
} from "react";
import { useSocket } from "../hooks/use-socket";

export interface Task {
  id: string;
  title: string;
  status: string;
  order: number;
  [key: string]: unknown;
}

export interface BoardState {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  connected: boolean;
  reconnecting: boolean;
}

export interface SocketContextValue {
  state: BoardState;
  refreshBoard: () => Promise<void>;
  emitEvent: (event: string, data?: unknown) => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function useSocketContext(): SocketContextValue {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocketContext must be used within a SocketProvider");
  }
  return context;
}

export interface SocketProviderProps {
  children: ReactNode;
  apiBaseUrl?: string;
  socketUrl?: string;
  showToast?: (message: string) => void;
}

export function SocketProvider({
  children,
  apiBaseUrl = "/api",
  socketUrl = "/",
  showToast,
}: SocketProviderProps) {
  const [state, setState] = useState<BoardState>({
    tasks: [],
    loading: false,
    error: null,
    connected: false,
    reconnecting: false,
  });

  const refreshBoard = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch(`${apiBaseUrl}/board`);
      if (!response.ok) {
        throw new Error(`Failed to fetch board: ${response.statusText}`);
      }
      const data = await response.json();
      setState((prev) => ({
        ...prev,
        tasks: data.tasks ?? data,
        loading: false,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }));
    }
  }, [apiBaseUrl]);

  const handleConnect = useCallback(() => {
    setState((prev) => ({ ...prev, connected: true, reconnecting: false }));
  }, []);

  const handleDisconnect = useCallback(() => {
    setState((prev) => ({ ...prev, connected: false, reconnecting: true }));
  }, []);

  const handleReconnect = useCallback(() => {
    setState((prev) => ({ ...prev, connected: true, reconnecting: false }));
  }, []);

  const handleBoardEvent = useCallback(
    (event: string, data: unknown) => {
      const taskData = data as Task;

      switch (event) {
        case "task:created":
          setState((prev) => ({
            ...prev,
            tasks: [...prev.tasks, taskData],
          }));
          break;

        case "task:updated":
          setState((prev) => ({
            ...prev,
            tasks: prev.tasks.map((t) =>
              t.id === taskData.id ? { ...t, ...taskData } : t
            ),
          }));
          break;

        case "task:deleted":
          setState((prev) => ({
            ...prev,
            tasks: prev.tasks.filter((t) => t.id !== taskData.id),
          }));
          break;

        case "task:reordered":
          // Full refresh on reorder to ensure correct ordering
          refreshBoard();
          break;

        default:
          break;
      }
    },
    [refreshBoard]
  );

  const { getSocket } = useSocket({
    url: socketUrl,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    onReconnect: handleReconnect,
    onBoardEvent: handleBoardEvent,
    refreshBoard,
    showToast,
  });

  const emitEvent = useCallback(
    (event: string, data?: unknown) => {
      const socket = getSocket();
      if (socket) {
        socket.emit(event, data);
      }
    },
    [getSocket]
  );

  const value = useMemo(
    () => ({ state, refreshBoard, emitEvent }),
    [state, refreshBoard, emitEvent]
  );

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
}
