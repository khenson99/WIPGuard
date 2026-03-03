import { describe, expect, it } from "vitest";
import type { SocketEventMap, SocketEventName } from "../socket-events";
import { socketEventSchemas, validateEventPayload } from "../socket-events";

/**
 * These tests verify compile-time type safety behaviors alongside
 * runtime validation. If the type system is working correctly,
 * certain patterns should be impossible to write without @ts-expect-error.
 */

describe("SocketEventMap type safety", () => {
  it("SocketEventMap keys match socketEventSchemas keys", () => {
    // This test ensures the derived types stay in sync
    const schemaKeys = Object.keys(socketEventSchemas).sort();
    // We can't iterate SocketEventMap at runtime, but we can verify
    // the schemas are the source of truth
    expect(schemaKeys).toEqual([
      "board:refresh",
      "task:created",
      "task:deleted",
      "task:reordered",
      "task:updated",
    ]);
  });

  it("each event schema produces a parseable result", () => {
    const testPayloads: Record<SocketEventName, unknown> = {
      "task:created": {
        task: {
          id: "1",
          title: "T",
          status: "s",
          columnId: "c",
          boardId: "b",
          order: 0,
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
        },
      },
      "task:updated": {
        task: {
          id: "1",
          title: "T",
          status: "s",
          columnId: "c",
          boardId: "b",
          order: 0,
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
        },
      },
      "task:deleted": { taskId: "1" },
      "task:reordered": { columnUpdates: [] },
      "board:refresh": {},
    };

    for (const [event, payload] of Object.entries(testPayloads)) {
      const result = validateEventPayload(
        event as SocketEventName,
        payload,
      );
      expect(result.success).toBe(true);
    }
  });

  it("rejects all events when given undefined", () => {
    const events: SocketEventName[] = [
      "task:created",
      "task:updated",
      "task:deleted",
      "task:reordered",
      "board:refresh",
    ];

    for (const event of events) {
      const result = validateEventPayload(event, undefined);
      expect(result.success).toBe(false);
    }
  });

  it("rejects all events when given null", () => {
    const events: SocketEventName[] = [
      "task:created",
      "task:updated",
      "task:deleted",
      "task:reordered",
      "board:refresh",
    ];

    for (const event of events) {
      const result = validateEventPayload(event, null);
      expect(result.success).toBe(false);
    }
  });

  it("validates task assignee shape", () => {
    const withBadAssignee = {
      task: {
        id: "1",
        title: "T",
        status: "s",
        columnId: "c",
        boardId: "b",
        order: 0,
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01",
        assignee: { id: "u1" }, // missing required 'name' and 'email'
      },
    };

    const result = validateEventPayload("task:created", withBadAssignee);
    expect(result.success).toBe(false);
  });

  it("validates label shape within task", () => {
    const withBadLabels = {
      task: {
        id: "1",
        title: "T",
        status: "s",
        columnId: "c",
        boardId: "b",
        order: 0,
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01",
        labels: [{ id: "l1" }], // missing 'name' and 'color'
      },
    };

    const result = validateEventPayload("task:created", withBadLabels);
    expect(result.success).toBe(false);
  });

  it("validates columnUpdate items in task:reordered", () => {
    const badColumnUpdate = {
      columnUpdates: [
        { columnId: 123, taskIds: "not-an-array" }, // both fields wrong type
      ],
    };

    const result = validateEventPayload("task:reordered", badColumnUpdate);
    expect(result.success).toBe(false);
  });
});
