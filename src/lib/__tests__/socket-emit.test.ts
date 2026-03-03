import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { emitBoardEvent, setSocket, getSocket } from "../socket-emit";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockSocket(connected = true) {
  return {
    emit: vi.fn(),
    connected,
  };
}

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

describe("socket-emit", () => {
  beforeEach(() => {
    setSocket(null);
  });

  afterEach(() => {
    setSocket(null);
  });

  describe("setSocket / getSocket", () => {
    it("stores and retrieves the socket reference", () => {
      const mock = createMockSocket();
      setSocket(mock);
      expect(getSocket()).toBe(mock);
    });

    it("can be set to null", () => {
      setSocket(createMockSocket());
      setSocket(null);
      expect(getSocket()).toBeNull();
    });
  });

  describe("emitBoardEvent", () => {
    it("emits the event with validated payload when socket is connected", () => {
      const mock = createMockSocket();
      setSocket(mock);

      emitBoardEvent("task:created", { task: validTask });

      expect(mock.emit).toHaveBeenCalledTimes(1);
      expect(mock.emit).toHaveBeenCalledWith(
        "task:created",
        expect.objectContaining({ task: expect.objectContaining({ id: "task-1" }) }),
      );
    });

    it("emits task:deleted with correct payload", () => {
      const mock = createMockSocket();
      setSocket(mock);

      emitBoardEvent("task:deleted", { taskId: "task-1" });

      expect(mock.emit).toHaveBeenCalledWith("task:deleted", { taskId: "task-1" });
    });

    it("emits task:reordered with column updates", () => {
      const mock = createMockSocket();
      setSocket(mock);

      const payload = {
        columnUpdates: [{ columnId: "col-1", taskIds: ["t-1", "t-2"] }],
      };
      emitBoardEvent("task:reordered", payload);

      expect(mock.emit).toHaveBeenCalledWith("task:reordered", payload);
    });

    it("emits board:refresh with empty payload", () => {
      const mock = createMockSocket();
      setSocket(mock);

      emitBoardEvent("board:refresh", {});

      expect(mock.emit).toHaveBeenCalledWith("board:refresh", {});
    });

    it("warns and does not emit when socket is null", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      emitBoardEvent("task:deleted", { taskId: "t-1" });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cannot emit "task:deleted"'),
      );
      warnSpy.mockRestore();
    });

    it("warns and does not emit when socket is disconnected", () => {
      const mock = createMockSocket(false);
      setSocket(mock);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      emitBoardEvent("task:deleted", { taskId: "t-1" });

      expect(mock.emit).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("not connected"),
      );
      warnSpy.mockRestore();
    });

    it("throws on invalid payload (runtime validation)", () => {
      const mock = createMockSocket();
      setSocket(mock);

      // @ts-expect-error — intentionally passing invalid payload to test runtime
      expect(() => emitBoardEvent("task:deleted", { wrong: true })).toThrow();
      expect(mock.emit).not.toHaveBeenCalled();
    });

    it("throws on completely wrong payload shape", () => {
      const mock = createMockSocket();
      setSocket(mock);

      // @ts-expect-error — intentionally passing invalid payload
      expect(() => emitBoardEvent("task:created", "not an object")).toThrow();
    });
  });
});
