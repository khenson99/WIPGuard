import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSocket } from "../use-socket";

// Mock socket.io-client
const mockSocket = {
  on: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  removeAllListeners: vi.fn(),
  io: {
    on: vi.fn(),
  },
};

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => mockSocket),
}));

describe("useSocket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should register reconnect handler on socket.io manager", () => {
    renderHook(() => useSocket());

    expect(mockSocket.io.on).toHaveBeenCalledWith(
      "reconnect",
      expect.any(Function)
    );
  });

  it("should emit join-board on reconnect", () => {
    renderHook(() => useSocket());

    // Find the reconnect handler registered on socket.io manager
    const reconnectCall = mockSocket.io.on.mock.calls.find(
      (call: [string, (...args: unknown[]) => unknown]) => call[0] === "reconnect"
    );
    expect(reconnectCall).toBeDefined();

    const reconnectHandler = reconnectCall![1];

    act(() => {
      reconnectHandler(1);
    });

    expect(mockSocket.emit).toHaveBeenCalledWith("join-board");
  });

  it("should call refreshBoard on reconnect", () => {
    const refreshBoard = vi.fn();

    renderHook(() => useSocket({ refreshBoard }));

    const reconnectCall = mockSocket.io.on.mock.calls.find(
      (call: [string, (...args: unknown[]) => unknown]) => call[0] === "reconnect"
    );
    const reconnectHandler = reconnectCall![1];

    act(() => {
      reconnectHandler(1);
    });

    expect(refreshBoard).toHaveBeenCalledTimes(1);
  });

  it("should call showToast on reconnect with correct message", () => {
    const showToast = vi.fn();

    renderHook(() => useSocket({ showToast }));

    const reconnectCall = mockSocket.io.on.mock.calls.find(
      (call: [string, (...args: unknown[]) => unknown]) => call[0] === "reconnect"
    );
    const reconnectHandler = reconnectCall![1];

    act(() => {
      reconnectHandler(1);
    });

    expect(showToast).toHaveBeenCalledWith(
      "Reconnected — refreshing board..."
    );
  });

  it("should call onReconnect callback with attempt number", () => {
    const onReconnect = vi.fn();

    renderHook(() => useSocket({ onReconnect }));

    const reconnectCall = mockSocket.io.on.mock.calls.find(
      (call: [string, (...args: unknown[]) => unknown]) => call[0] === "reconnect"
    );
    const reconnectHandler = reconnectCall![1];

    act(() => {
      reconnectHandler(3);
    });

    expect(onReconnect).toHaveBeenCalledWith(3);
  });

  it("should not throw if refreshBoard is not provided", () => {
    renderHook(() => useSocket());

    const reconnectCall = mockSocket.io.on.mock.calls.find(
      (call: [string, (...args: unknown[]) => unknown]) => call[0] === "reconnect"
    );
    const reconnectHandler = reconnectCall![1];

    expect(() => {
      act(() => {
        reconnectHandler(1);
      });
    }).not.toThrow();
  });

  it("should not throw if showToast is not provided", () => {
    const refreshBoard = vi.fn();

    renderHook(() => useSocket({ refreshBoard }));

    const reconnectCall = mockSocket.io.on.mock.calls.find(
      (call: [string, (...args: unknown[]) => unknown]) => call[0] === "reconnect"
    );
    const reconnectHandler = reconnectCall![1];

    expect(() => {
      act(() => {
        reconnectHandler(1);
      });
    }).not.toThrow();
  });

  it("should register board event listeners", () => {
    renderHook(() => useSocket());

    const registeredEvents = mockSocket.on.mock.calls.map(
      (call: [string, (...args: unknown[]) => unknown]) => call[0]
    );

    expect(registeredEvents).toContain("task:created");
    expect(registeredEvents).toContain("task:updated");
    expect(registeredEvents).toContain("task:deleted");
    expect(registeredEvents).toContain("task:reordered");
  });

  it("should emit join-board on initial connect", () => {
    renderHook(() => useSocket());

    // Find the second connect handler (the one that emits join-board)
    const connectCalls = mockSocket.on.mock.calls.filter(
      (call: [string, (...args: unknown[]) => unknown]) => call[0] === "connect"
    );

    // There should be at least one connect handler that emits join-board
    expect(connectCalls.length).toBeGreaterThan(0);

    // Simulate connect event
    const connectHandler = connectCalls[connectCalls.length - 1][1];
    act(() => {
      connectHandler();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith("join-board");
  });

  it("should clean up on unmount", () => {
    const { unmount } = renderHook(() => useSocket());

    unmount();

    expect(mockSocket.removeAllListeners).toHaveBeenCalled();
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it("should call both refreshBoard and showToast on reconnect", () => {
    const refreshBoard = vi.fn();
    const showToast = vi.fn();

    renderHook(() => useSocket({ refreshBoard, showToast }));

    const reconnectCall = mockSocket.io.on.mock.calls.find(
      (call: [string, (...args: unknown[]) => unknown]) => call[0] === "reconnect"
    );
    const reconnectHandler = reconnectCall![1];

    act(() => {
      reconnectHandler(2);
    });

    expect(refreshBoard).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(
      "Reconnected — refreshing board..."
    );
  });

  it("should set connected state on reconnect", () => {
    const { result } = renderHook(() => useSocket());

    const reconnectCall = mockSocket.io.on.mock.calls.find(
      (call: [string, (...args: unknown[]) => unknown]) => call[0] === "reconnect"
    );
    const reconnectHandler = reconnectCall![1];

    act(() => {
      reconnectHandler(1);
    });

    expect(result.current.isConnected()).toBe(true);
  });
});
