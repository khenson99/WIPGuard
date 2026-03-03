import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSocket } from "../use-socket";
import type { TypedEventHandler } from "../use-socket";

// ─── Mock socket ─────────────────────────────────────────────────────────────

function createMockSocketInstance() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(handler);
    }),
    emit: vi.fn(),
    connected: true,
    // Test helper: simulate receiving an event
    _simulateEvent(event: string, payload: unknown) {
      listeners.get(event)?.forEach((h) => h(payload));
    },
    _getListenerCount(event: string) {
      return listeners.get(event)?.size ?? 0;
    },
  };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const validTask = {
  id: "task-1",
  title: "Test",
  status: "todo",
  columnId: "col-1",
  boardId: "board-1",
  order: 0,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useSocket", () => {
  let mockSocket: ReturnType<typeof createMockSocketInstance>;

  beforeEach(() => {
    mockSocket = createMockSocketInstance();
  });

  it("returns on and emit functions", () => {
    const { result } = renderHook(() => useSocket({ socket: mockSocket }));
    expect(typeof result.current.on).toBe("function");
    expect(typeof result.current.emit).toBe("function");
  });

  describe("on", () => {
    it("subscribes to an event and receives validated payloads", () => {
      const { result } = renderHook(() => useSocket({ socket: mockSocket }));
      const handler = vi.fn();

      act(() => {
        result.current.on("task:created", handler);
      });

      expect(mockSocket.on).toHaveBeenCalledWith(
        "task:created",
        expect.any(Function),
      );

      // Simulate receiving a valid payload
      act(() => {
        mockSocket._simulateEvent("task:created", { task: validTask });
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          task: expect.objectContaining({ id: "task-1" }),
        }),
      );
    });

    it("does not call handler for invalid payloads", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { result } = renderHook(() => useSocket({ socket: mockSocket }));
      const handler = vi.fn();

      act(() => {
        result.current.on("task:deleted", handler);
      });

      // Simulate receiving an invalid payload (missing taskId)
      act(() => {
        mockSocket._simulateEvent("task:deleted", { wrong: "field" });
      });

      expect(handler).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid payload for "task:deleted"'),
        expect.anything(),
      );

      errorSpy.mockRestore();
    });

    it("returns an unsubscribe function that removes the listener", () => {
      const { result } = renderHook(() => useSocket({ socket: mockSocket }));
      const handler = vi.fn();
      let unsub: () => void;

      act(() => {
        unsub = result.current.on("task:deleted", handler);
      });

      expect(mockSocket._getListenerCount("task:deleted")).toBe(1);

      act(() => {
        unsub();
      });

      expect(mockSocket.off).toHaveBeenCalledWith(
        "task:deleted",
        expect.any(Function),
      );
    });

    it("returns noop unsubscribe when socket is null", () => {
      const { result } = renderHook(() => useSocket({ socket: null }));
      let unsub: () => void;

      act(() => {
        unsub = result.current.on("task:created", vi.fn());
      });

      // Should not throw
      expect(() => unsub()).not.toThrow();
    });

    it("handles task:reordered event correctly", () => {
      const { result } = renderHook(() => useSocket({ socket: mockSocket }));
      const handler = vi.fn();

      act(() => {
        result.current.on("task:reordered", handler);
      });

      const payload = {
        columnUpdates: [{ columnId: "col-1", taskIds: ["t-1"] }],
      };

      act(() => {
        mockSocket._simulateEvent("task:reordered", payload);
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          columnUpdates: expect.arrayContaining([
            expect.objectContaining({ columnId: "col-1" }),
          ]),
        }),
      );
    });

    it("handles board:refresh event correctly", () => {
      const { result } = renderHook(() => useSocket({ socket: mockSocket }));
      const handler = vi.fn();

      act(() => {
        result.current.on("board:refresh", handler);
      });

      act(() => {
        mockSocket._simulateEvent("board:refresh", {});
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("validates task:updated payloads", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { result } = renderHook(() => useSocket({ socket: mockSocket }));
      const handler = vi.fn();

      act(() => {
        result.current.on("task:updated", handler);
      });

      // Invalid: task missing required fields
      act(() => {
        mockSocket._simulateEvent("task:updated", { task: { id: "t-1" } });
      });

      expect(handler).not.toHaveBeenCalled();

      // Valid payload
      act(() => {
        mockSocket._simulateEvent("task:updated", { task: validTask });
      });

      expect(handler).toHaveBeenCalledTimes(1);

      errorSpy.mockRestore();
    });
  });

  describe("multiple listeners", () => {
    it("supports multiple handlers for the same event", () => {
      const { result } = renderHook(() => useSocket({ socket: mockSocket }));
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      act(() => {
        result.current.on("task:deleted", handler1);
        result.current.on("task:deleted", handler2);
      });

      act(() => {
        mockSocket._simulateEvent("task:deleted", { taskId: "t-1" });
      });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it("unsubscribing one handler does not affect others", () => {
      const { result } = renderHook(() => useSocket({ socket: mockSocket }));
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      let unsub1: () => void;

      act(() => {
        unsub1 = result.current.on("task:deleted", handler1);
        result.current.on("task:deleted", handler2);
      });

      act(() => {
        unsub1();
      });

      act(() => {
        mockSocket._simulateEvent("task:deleted", { taskId: "t-1" });
      });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });
});
