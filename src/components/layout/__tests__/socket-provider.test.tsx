import React from "react";
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SocketProvider } from "../socket-provider";
import { useBoardStore } from "@/stores/board-store";
import type { Column, Task } from "@/types/board";

const mockOn = vi.fn();
const mockEmit = vi.fn();
const mockOff = vi.fn();
const mockDisconnect = vi.fn();
const mockRemoveAllListeners = vi.fn();

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    on: mockOn,
    off: mockOff,
    emit: mockEmit,
    disconnect: mockDisconnect,
    removeAllListeners: mockRemoveAllListeners,
  })),
}));

function getHandler(eventName: string): ((...args: unknown[]) => void) | undefined {
  const call = mockOn.mock.calls.find((args) => args[0] === eventName);
  return typeof call?.[1] === "function" ? call[1] : undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  const store = useBoardStore.getState();
  store.setTasks([]);
  store.setColumns({});
  store.setLoading(false);
  store.setError(null);
});

describe("SocketProvider optimistic updates", () => {
  it("registers handlers for task events", () => {
    render(
      <SocketProvider>
        <div>Test</div>
      </SocketProvider>
    );

    const registeredEvents = mockOn.mock.calls.map((args) => args[0]);
    expect(registeredEvents).toEqual(
      expect.arrayContaining([
        "task:created",
        "task:updated",
        "task:deleted",
        "task:reordered",
      ])
    );
  });

  it("handles task:created with valid payload by adding task in place", () => {
    render(
      <SocketProvider>
        <div>Test</div>
      </SocketProvider>
    );

    const handler = getHandler("task:created");
    expect(handler).toBeDefined();

    act(() => {
      handler?.({
        task: { id: "task-new", title: "New Task", status: "QUEUED", order: 0 },
      });
    });

    expect(useBoardStore.getState().tasks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "task-new" })])
    );
  });

  it("handles task:updated with valid payload by updating task in place", () => {
    useBoardStore.getState().setTasks([
      { id: "task-1", title: "Original", status: "ACTIVE", order: 0, projectId: "proj-1" } as Task,
    ]);

    render(
      <SocketProvider>
        <div>Test</div>
      </SocketProvider>
    );

    act(() => {
      getHandler("task:updated")?.({
        task: { id: "task-1", title: "Updated", status: "ACTIVE", order: 0 },
      });
    });

    expect(useBoardStore.getState().tasks[0].title).toBe("Updated");
  });

  it("handles task:deleted with valid payload by removing task", () => {
    useBoardStore.getState().setTasks([
      { id: "task-1", title: "To Delete", status: "ACTIVE", order: 0, projectId: "proj-1" } as Task,
    ]);

    render(
      <SocketProvider>
        <div>Test</div>
      </SocketProvider>
    );

    act(() => {
      getHandler("task:deleted")?.({ taskId: "task-1" });
    });

    expect(useBoardStore.getState().tasks).toHaveLength(0);
  });

  it("handles task:reordered with valid payload by reordering columns", () => {
    useBoardStore.getState().setColumns({
      ACTIVE: { id: "ACTIVE", title: "Active", taskIds: ["a", "b", "c"] } as Column,
    });

    render(
      <SocketProvider>
        <div>Test</div>
      </SocketProvider>
    );

    act(() => {
      getHandler("task:reordered")?.({ columns: { ACTIVE: ["c", "a", "b"] } });
    });

    expect(useBoardStore.getState().columns.ACTIVE.taskIds).toEqual(["c", "a", "b"]);
  });

  it("falls back to refreshBoard when task:created payload is invalid", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    render(
      <SocketProvider>
        <div>Test</div>
      </SocketProvider>
    );

    act(() => {
      getHandler("task:created")?.({ invalid: "payload" });
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("task:created payload missing task data")
    );
  });

  it("falls back to refreshBoard when task:reordered payload is invalid", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    render(
      <SocketProvider>
        <div>Test</div>
      </SocketProvider>
    );

    act(() => {
      getHandler("task:reordered")?.({});
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("task:reordered payload missing columns data")
    );
  });

  it("cleans up socket listeners on unmount", () => {
    const { unmount } = render(
      <SocketProvider>
        <div>Test</div>
      </SocketProvider>
    );

    unmount();

    expect(mockRemoveAllListeners).toHaveBeenCalled();
    expect(mockDisconnect).toHaveBeenCalled();
  });
});
