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

type MockHandler = (...args: unknown[]) => void;

function getManagerHandler(event: string): MockHandler {
  const call = mockSocket.io.on.mock.calls.find((call) => call[0] === event);
  expect(call).toBeDefined();
  return call?.[1] as MockHandler;
}

function getSocketHandlers(event: string): MockHandler[] {
  return mockSocket.on.mock.calls
    .filter((call) => call[0] === event)
    .map((call) => call[1] as MockHandler);
}

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

    const reconnectHandler = getManagerHandler("reconnect");

    act(() => {
      reconnectHandler(1);
    });

    expect(mockSocket.emit).toHaveBeenCalledWith("join-board");
  });

  it("should call refreshBoard on reconnect", () => {
    const refreshBoard = vi.fn();

    renderHook(() => useSocket({ refreshBoard }));

    const reconnectHandler = getManagerHandler("reconnect");

    act(() => {
      reconnectHandler(1);
    });

    expect(refreshBoard).toHaveBeenCalledTimes(1);
  });

  it("should call showToast on reconnect with correct message", () => {
    const showToast = vi.fn();

    renderHook(() => useSocket({ showToast }));

    const reconnectHandler = getManagerHandler("reconnect");

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

    const reconnectHandler = getManagerHandler("reconnect");

    act(() => {
      reconnectHandler(3);
    });

    expect(onReconnect).toHaveBeenCalledWith(3);
  });

  it("should not throw if refreshBoard is not provided", () => {
    renderHook(() => useSocket());

    const reconnectHandler = getManagerHandler("reconnect");

    expect(() => {
      act(() => {
        reconnectHandler(1);
      });
    }).not.toThrow();
  });

  it("should not throw if showToast is not provided", () => {
    const refreshBoard = vi.fn();

    renderHook(() => useSocket({ refreshBoard }));

    const reconnectHandler = getManagerHandler("reconnect");

    expect(() => {
      act(() => {
        reconnectHandler(1);
      });
    }).not.toThrow();
  });

  it("should register board event listeners", () => {
    renderHook(() => useSocket());

    const registeredEvents = mockSocket.on.mock.calls.map((call) => String(call[0]));

    expect(registeredEvents).toContain("task:created");
    expect(registeredEvents).toContain("task:updated");
    expect(registeredEvents).toContain("task:deleted");
    expect(registeredEvents).toContain("task:reordered");
  });

  it("should emit join-board on initial connect", () => {
    renderHook(() => useSocket());

    const connectCalls = getSocketHandlers("connect");

    // There should be at least one connect handler that emits join-board
    expect(connectCalls.length).toBeGreaterThan(0);

    // Simulate connect event
    const connectHandler = connectCalls[connectCalls.length - 1];
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

    const reconnectHandler = getManagerHandler("reconnect");

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

    const reconnectHandler = getManagerHandler("reconnect");

    act(() => {
      reconnectHandler(1);
    });

    expect(result.current.isConnected()).toBe(true);
  });
});
