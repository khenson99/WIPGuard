import {
  emitBoardEvent,
  emitTaskCreated,
  emitTaskUpdated,
  emitTaskDeleted,
  emitTaskReordered,
} from "@/lib/socket-emit";
import * as socketServer from "@/lib/socket-server";

describe("socket-emit", () => {
  let mockEmit: jest.Mock;
  let mockTo: jest.Mock;

  beforeEach(() => {
    mockEmit = jest.fn();
    mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does not throw when IO is not initialized", () => {
    jest.spyOn(socketServer, "getIO").mockReturnValue(null);
    expect(() =>
      emitBoardEvent("proj-1", "task:created", { id: "t1" })
    ).not.toThrow();
  });

  it("does not emit when projectId is empty", () => {
    jest
      .spyOn(socketServer, "getIO")
      .mockReturnValue({ to: mockTo } as unknown as ReturnType<typeof socketServer.getIO>);
    emitBoardEvent("", "task:created", { id: "t1" });
    expect(mockTo).not.toHaveBeenCalled();
  });

  it("emits to the correct project room", () => {
    jest
      .spyOn(socketServer, "getIO")
      .mockReturnValue({ to: mockTo } as unknown as ReturnType<typeof socketServer.getIO>);

    emitBoardEvent("proj-42", "task:created", { id: "t1", title: "Test" });

    expect(mockTo).toHaveBeenCalledWith("project:proj-42");
    expect(mockEmit).toHaveBeenCalledWith("task:created", {
      type: "task:created",
      projectId: "proj-42",
      data: { id: "t1", title: "Test" },
    });
  });

  it("emitTaskCreated emits task:created", () => {
    jest
      .spyOn(socketServer, "getIO")
      .mockReturnValue({ to: mockTo } as unknown as ReturnType<typeof socketServer.getIO>);

    emitTaskCreated("proj-1", { id: "t1" });

    expect(mockEmit).toHaveBeenCalledWith(
      "task:created",
      expect.objectContaining({ type: "task:created" })
    );
  });

  it("emitTaskUpdated emits task:updated", () => {
    jest
      .spyOn(socketServer, "getIO")
      .mockReturnValue({ to: mockTo } as unknown as ReturnType<typeof socketServer.getIO>);

    emitTaskUpdated("proj-1", { id: "t1", status: "done" });

    expect(mockEmit).toHaveBeenCalledWith(
      "task:updated",
      expect.objectContaining({ type: "task:updated" })
    );
  });

  it("emitTaskDeleted emits task:deleted with id", () => {
    jest
      .spyOn(socketServer, "getIO")
      .mockReturnValue({ to: mockTo } as unknown as ReturnType<typeof socketServer.getIO>);

    emitTaskDeleted("proj-1", "t1");

    expect(mockEmit).toHaveBeenCalledWith(
      "task:deleted",
      expect.objectContaining({
        type: "task:deleted",
        data: { id: "t1" },
      })
    );
  });

  it("emitTaskReordered emits task:reordered", () => {
    jest
      .spyOn(socketServer, "getIO")
      .mockReturnValue({ to: mockTo } as unknown as ReturnType<typeof socketServer.getIO>);

    emitTaskReordered("proj-1", { order: ["t2", "t1"] });

    expect(mockEmit).toHaveBeenCalledWith(
      "task:reordered",
      expect.objectContaining({ type: "task:reordered" })
    );
  });
});
