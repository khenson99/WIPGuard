import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React, { ReactNode } from "react";
import { SocketProvider, useSocketContext } from "../socket-provider";

// Capture the options passed to useSocket so we can simulate events
let capturedOptions: Record<string, any> = {};

vi.mock("../../hooks/use-socket", () => ({
  useSocket: (options: Record<string, any>) => {
    capturedOptions = options;
    return {
      getSocket: vi.fn(() => ({
        emit: vi.fn(),
      })),
      isConnected: vi.fn(() => true),
    };
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("SocketProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOptions = {};
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tasks: [
          { id: "1", title: "Task 1", status: "todo", order: 0 },
          { id: "2", title: "Task 2", status: "done", order: 1 },
        ],
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createWrapper(props: { showToast?: (msg: string) => void } = {}) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return (
        <SocketProvider
          apiBaseUrl="/api"
          socketUrl="/"
          showToast={props.showToast}
        >
          {children}
        </SocketProvider>
      );
    };
  }

  it("should provide initial state", () => {
    const { result } = renderHook(() => useSocketContext(), {
      wrapper: createWrapper(),
    });

    expect(result.current.state).toEqual({
      tasks: [],
      loading: false,
      error: null,
      connected: false,
      reconnecting: false,
    });
  });

  it("should pass refreshBoard to useSocket options", () => {
    renderHook(() => useSocketContext(), {
      wrapper: createWrapper(),
    });

    expect(capturedOptions.refreshBoard).toBeDefined();
    expect(typeof capturedOptions.refreshBoard).toBe("function");
  });

  it("should pass showToast to useSocket options", () => {
    const showToast = vi.fn();
    renderHook(() => useSocketContext(), {
      wrapper: createWrapper({ showToast }),
    });

    expect(capturedOptions.showToast).toBe(showToast);
  });

  it("should fetch board data when refreshBoard is called", async () => {
    const { result } = renderHook(() => useSocketContext(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.refreshBoard();
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/board");
    expect(result.current.state.tasks).toHaveLength(2);
    expect(result.current.state.tasks[0].title).toBe("Task 1");
  });

  it("should set connected true when onConnect is called", () => {
    const { result } = renderHook(() => useSocketContext(), {
      wrapper: createWrapper(),
    });

    act(() => {
      capturedOptions.onConnect();
    });

    expect(result.current.state.connected).toBe(true);
    expect(result.current.state.reconnecting).toBe(false);
  });

  it("should set reconnecting true when onDisconnect is called", () => {
    const { result } = renderHook(() => useSocketContext(), {
      wrapper: createWrapper(),
    });

    act(() => {
      capturedOptions.onConnect();
    });

    act(() => {
      capturedOptions.onDisconnect("transport close");
    });

    expect(result.current.state.connected).toBe(false);
    expect(result.current.state.reconnecting).toBe(true);
  });

  it("should reset reconnecting on onReconnect", () => {
    const { result } = renderHook(() => useSocketContext(), {
      wrapper: createWrapper(),
    });

    // Simulate disconnect then reconnect
    act(() => {
      capturedOptions.onDisconnect("transport close");
    });

    expect(result.current.state.reconnecting).toBe(true);

    act(() => {
      capturedOptions.onReconnect(1);
    });

    expect(result.current.state.connected).toBe(true);
    expect(result.current.state.reconnecting).toBe(false);
  });

  it("should handle task:created event", () => {
    const { result } = renderHook(() => useSocketContext(), {
      wrapper: createWrapper(),
    });

    act(() => {
      capturedOptions.onBoardEvent("task:created", {
        id: "3",
        title: "New Task",
        status: "todo",
        order: 2,
      });
    });

    expect(result.current.state.tasks).toHaveLength(1);
    expect(result.current.state.tasks[0].title).toBe("New Task");
  });

  it("should handle task:updated event", async () => {
    const { result } = renderHook(() => useSocketContext(), {
      wrapper: createWrapper(),
    });

    // First add a task
    act(() => {
      capturedOptions.onBoardEvent("task:created", {
        id: "1",
        title: "Task 1",
        status: "todo",
        order: 0,
      });
    });

    // Then update it
    act(() => {
      capturedOptions.onBoardEvent("task:updated", {
        id: "1",
        title: "Updated Task 1",
        status: "done",
        order: 0,
      });
    });

    expect(result.current.state.tasks[0].title).toBe("Updated Task 1");
    expect(result.current.state.tasks[0].status).toBe("done");
  });

  it("should handle task:deleted event", () => {
    const { result } = renderHook(() => useSocketContext(), {
      wrapper: createWrapper(),
    });

    // Add a task
    act(() => {
      capturedOptions.onBoardEvent("task:created", {
        id: "1",
        title: "Task 1",
        status: "todo",
        order: 0,
      });
    });

    expect(result.current.state.tasks).toHaveLength(1);

    // Delete it
    act(() => {
      capturedOptions.onBoardEvent("task:deleted", {
        id: "1",
      });
    });

    expect(result.current.state.tasks).toHaveLength(0);
  });

  it("should call refreshBoard on task:reordered event", async () => {
    renderHook(() => useSocketContext(), {
      wrapper: createWrapper(),
    });

    act(() => {
      capturedOptions.onBoardEvent("task:reordered", {});
    });

    // refreshBoard triggers a fetch
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/board");
    });
  });

  it("should handle fetch error in refreshBoard", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: "Internal Server Error",
    });

    const { result } = renderHook(() => useSocketContext(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.refreshBoard();
    });

    expect(result.current.state.error).toBe(
      "Failed to fetch board: Internal Server Error"
    );
    expect(result.current.state.loading).toBe(false);
  });

  it("should handle network error in refreshBoard", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useSocketContext(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.refreshBoard();
    });

    expect(result.current.state.error).toBe("Network error");
    expect(result.current.state.loading).toBe(false);
  });

  it("refreshBoard passed to useSocket is callable and triggers fetch", async () => {
    renderHook(() => useSocketContext(), {
      wrapper: createWrapper(),
    });

    // Simulate what happens on reconnect: useSocket calls refreshBoard
    await act(async () => {
      await capturedOptions.refreshBoard();
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/board");
  });

  it("full reconnection flow: disconnect -> reconnect -> state refreshed", async () => {
    const showToast = vi.fn();
    const { result } = renderHook(() => useSocketContext(), {
      wrapper: createWrapper({ showToast }),
    });

    // Initial connect
    act(() => {
      capturedOptions.onConnect();
    });
    expect(result.current.state.connected).toBe(true);

    // Add a task via event
    act(() => {
      capturedOptions.onBoardEvent("task:created", {
        id: "1",
        title: "Task 1",
        status: "todo",
        order: 0,
      });
    });
    expect(result.current.state.tasks).toHaveLength(1);

    // Disconnect
    act(() => {
      capturedOptions.onDisconnect("transport close");
    });
    expect(result.current.state.connected).toBe(false);
    expect(result.current.state.reconnecting).toBe(true);

    // Reconnect — in real code, useSocket calls refreshBoard() and showToast()
    // Here we simulate what the reconnect handler does
    act(() => {
      capturedOptions.onReconnect(1);
    });

    // Simulate refreshBoard being called (as useSocket would do)
    await act(async () => {
      await capturedOptions.refreshBoard();
    });

    expect(result.current.state.connected).toBe(true);
    expect(result.current.state.reconnecting).toBe(false);
    expect(mockFetch).toHaveBeenCalledWith("/api/board");

    // State should be updated from API response
    expect(result.current.state.tasks).toHaveLength(2);
    expect(result.current.state.tasks[0].id).toBe("1");
    expect(result.current.state.tasks[1].id).toBe("2");
  });

  it("should throw error when useSocketContext is used outside provider", () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useSocketContext());
    }).toThrow("useSocketContext must be used within a SocketProvider");

    consoleSpy.mockRestore();
  });
});
