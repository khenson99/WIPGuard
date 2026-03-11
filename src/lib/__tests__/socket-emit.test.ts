import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emitBoardEvent,
  emitTaskCreated,
  emitTaskDeleted,
  emitTaskReordered,
  emitTaskUpdated,
} from "@/lib/socket-emit";
import * as socketServer from "@/lib/socket-server";

describe("socket-emit", () => {
  let mockEmit: ReturnType<typeof vi.fn>;
  let mockTo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockEmit = vi.fn();
    mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
  });

  it("does not throw when IO is not initialized", () => {
    vi.spyOn(socketServer, "getIO").mockReturnValue(null);
    expect(() => emitBoardEvent("proj-1", "task:created", { id: "t1" })).not.toThrow();
  });

  it("does not emit when projectId is empty", () => {
    vi.spyOn(socketServer, "getIO").mockReturnValue({ to: mockTo } as never);
    emitBoardEvent("", "task:created", { id: "t1" });
    expect(mockTo).not.toHaveBeenCalled();
  });

  it("emits to the correct project room", () => {
    vi.spyOn(socketServer, "getIO").mockReturnValue({ to: mockTo } as never);

    emitBoardEvent("proj-42", "task:created", { id: "t1", title: "Test" });

    expect(mockTo).toHaveBeenCalledWith("project:proj-42");
    expect(mockEmit).toHaveBeenCalledWith("task:created", {
      type: "task:created",
      projectId: "proj-42",
      data: { id: "t1", title: "Test" },
    });
  });

  it("emitTaskCreated emits task:created", () => {
    vi.spyOn(socketServer, "getIO").mockReturnValue({ to: mockTo } as never);
    emitTaskCreated("proj-1", { id: "t1" });
    expect(mockEmit).toHaveBeenCalledWith(
      "task:created",
      expect.objectContaining({ type: "task:created" })
    );
  });

  it("emitTaskUpdated emits task:updated", () => {
    vi.spyOn(socketServer, "getIO").mockReturnValue({ to: mockTo } as never);
    emitTaskUpdated("proj-1", { id: "t1", status: "done" });
    expect(mockEmit).toHaveBeenCalledWith(
      "task:updated",
      expect.objectContaining({ type: "task:updated" })
    );
  });

  it("emitTaskDeleted emits task:deleted with id", () => {
    vi.spyOn(socketServer, "getIO").mockReturnValue({ to: mockTo } as never);
    emitTaskDeleted("proj-1", "t1");
    expect(mockEmit).toHaveBeenCalledWith(
      "task:deleted",
      expect.objectContaining({ type: "task:deleted", data: { id: "t1" } })
    );
  });

  it("emitTaskReordered emits task:reordered", () => {
    vi.spyOn(socketServer, "getIO").mockReturnValue({ to: mockTo } as never);
    emitTaskReordered("proj-1", { order: ["t2", "t1"] });
    expect(mockEmit).toHaveBeenCalledWith(
      "task:reordered",
      expect.objectContaining({ type: "task:reordered" })
    );
  });
});
