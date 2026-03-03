import { describe, expect, it } from "vitest";
import {
  validateEventPayload,
  parseEventPayloadStrict,
  isSocketEventName,
  socketEventSchemas,
} from "../socket-events";
import type { SocketEventName } from "../socket-events";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const validTask = {
  id: "task-1",
  title: "Fix bug",
  description: "Something broke",
  status: "todo",
  columnId: "col-1",
  boardId: "board-1",
  order: 0,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  assignee: null,
  labels: [],
};

const validTaskCreated = { task: validTask };
const validTaskUpdated = { task: validTask };
const validTaskDeleted = { taskId: "task-1" };
const validTaskReordered = {
  columnUpdates: [
    { columnId: "col-1", taskIds: ["task-1", "task-2"] },
    { columnId: "col-2", taskIds: ["task-3"] },
  ],
};
const validBoardRefresh = {};

// ─── Schema coverage ─────────────────────────────────────────────────────────

describe("socketEventSchemas", () => {
  it("has schemas for all expected events", () => {
    const expectedEvents: SocketEventName[] = [
      "task:created",
      "task:updated",
      "task:deleted",
      "task:reordered",
      "board:refresh",
    ];
    expect(Object.keys(socketEventSchemas).sort()).toEqual(
      expectedEvents.sort(),
    );
  });
});

// ─── validateEventPayload ────────────────────────────────────────────────────

describe("validateEventPayload", () => {
  describe("task:created", () => {
    it("accepts a valid payload", () => {
      const result = validateEventPayload("task:created", validTaskCreated);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.task.id).toBe("task-1");
      }
    });

    it("rejects payload missing task", () => {
      const result = validateEventPayload("task:created", {});
      expect(result.success).toBe(false);
    });

    it("rejects payload with task missing required fields", () => {
      const result = validateEventPayload("task:created", {
        task: { id: "task-1" },
      });
      expect(result.success).toBe(false);
    });

    it("accepts task with optional assignee and labels", () => {
      const payload = {
        task: {
          ...validTask,
          assignee: {
            id: "user-1",
            name: "Alice",
            email: "alice@example.com",
            image: null,
          },
          labels: [{ id: "label-1", name: "Bug", color: "#ff0000" }],
        },
      };
      const result = validateEventPayload("task:created", payload);
      expect(result.success).toBe(true);
    });

    it("accepts task with Date objects for createdAt/updatedAt", () => {
      const payload = {
        task: {
          ...validTask,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      const result = validateEventPayload("task:created", payload);
      expect(result.success).toBe(true);
    });
  });

  describe("task:updated", () => {
    it("accepts a valid payload", () => {
      const result = validateEventPayload("task:updated", validTaskUpdated);
      expect(result.success).toBe(true);
    });

    it("rejects null payload", () => {
      const result = validateEventPayload("task:updated", null);
      expect(result.success).toBe(false);
    });
  });

  describe("task:deleted", () => {
    it("accepts a valid payload", () => {
      const result = validateEventPayload("task:deleted", validTaskDeleted);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.taskId).toBe("task-1");
      }
    });

    it("rejects payload with numeric taskId", () => {
      const result = validateEventPayload("task:deleted", { taskId: 123 });
      expect(result.success).toBe(false);
    });

    it("rejects payload missing taskId", () => {
      const result = validateEventPayload("task:deleted", {});
      expect(result.success).toBe(false);
    });
  });

  describe("task:reordered", () => {
    it("accepts a valid payload", () => {
      const result = validateEventPayload(
        "task:reordered",
        validTaskReordered,
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.columnUpdates).toHaveLength(2);
      }
    });

    it("accepts empty columnUpdates array", () => {
      const result = validateEventPayload("task:reordered", {
        columnUpdates: [],
      });
      expect(result.success).toBe(true);
    });

    it("rejects column update with missing taskIds", () => {
      const result = validateEventPayload("task:reordered", {
        columnUpdates: [{ columnId: "col-1" }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("board:refresh", () => {
    it("accepts an empty object", () => {
      const result = validateEventPayload("board:refresh", validBoardRefresh);
      expect(result.success).toBe(true);
    });

    it("accepts object with extra properties (strip by default)", () => {
      const result = validateEventPayload("board:refresh", { extra: true });
      // Zod strips unknown keys by default — should still succeed
      expect(result.success).toBe(true);
    });

    it("rejects non-object payloads", () => {
      const result = validateEventPayload("board:refresh", "invalid");
      expect(result.success).toBe(false);
    });
  });
});

// ─── parseEventPayloadStrict ─────────────────────────────────────────────────

describe("parseEventPayloadStrict", () => {
  it("returns validated data for valid payload", () => {
    const data = parseEventPayloadStrict("task:deleted", { taskId: "t-1" });
    expect(data.taskId).toBe("t-1");
  });

  it("throws ZodError for invalid payload", () => {
    expect(() =>
      parseEventPayloadStrict("task:deleted", { taskId: 999 }),
    ).toThrow();
  });

  it("throws for undefined payload on task:created", () => {
    expect(() =>
      parseEventPayloadStrict("task:created", undefined),
    ).toThrow();
  });
});

// ─── isSocketEventName ───────────────────────────────────────────────────────

describe("isSocketEventName", () => {
  it("returns true for known events", () => {
    expect(isSocketEventName("task:created")).toBe(true);
    expect(isSocketEventName("task:updated")).toBe(true);
    expect(isSocketEventName("task:deleted")).toBe(true);
    expect(isSocketEventName("task:reordered")).toBe(true);
    expect(isSocketEventName("board:refresh")).toBe(true);
  });

  it("returns false for unknown events", () => {
    expect(isSocketEventName("task:unknown")).toBe(false);
    expect(isSocketEventName("")).toBe(false);
    expect(isSocketEventName("random")).toBe(false);
  });
});
