import { describe, expect, it, vi } from "vitest";
import {
  compactColumnOrders,
  compactColumns,
  getNextColumnOrder,
} from "@/lib/task-order";

describe("task-order helpers", () => {
  it("returns next column order using task count", async () => {
    const count = vi.fn().mockResolvedValue(4);
    const db = {
      task: {
        count,
      },
    } as unknown as Parameters<typeof getNextColumnOrder>[0];

    const next = await getNextColumnOrder(db, "ACTIVE");

    expect(next).toBe(4);
    expect(count).toHaveBeenCalledWith({
      where: { status: "ACTIVE", id: undefined },
    });
  });

  it("compacts sparse/duplicate order values deterministically", async () => {
    const update = vi.fn().mockResolvedValue({});
    const findMany = vi.fn().mockResolvedValue([
      { id: "a", columnOrder: 0 },
      { id: "b", columnOrder: 2 },
      { id: "c", columnOrder: 2 },
      { id: "d", columnOrder: 7 },
    ]);
    const db = {
      task: {
        findMany,
        update,
      },
    } as unknown as Parameters<typeof compactColumnOrders>[0];

    const updates = await compactColumnOrders(db, "QUEUED");

    expect(updates).toBe(2);
    expect(findMany).toHaveBeenCalledWith({
      where: { status: "QUEUED" },
      select: { id: true, columnOrder: true },
      orderBy: [{ columnOrder: "asc" }, { updatedAt: "asc" }, { id: "asc" }],
    });
    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: "b" },
      data: { columnOrder: 1 },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: "d" },
      data: { columnOrder: 3 },
    });
  });

  it("runs compaction once per unique status", async () => {
    const updatesByStatus = new Map([
      ["BACKLOG", 1],
      ["DONE", 2],
    ]);
    const findMany = vi.fn().mockImplementation(({ where }) => {
      const status = where.status as string;
      const count = updatesByStatus.get(status) ?? 0;
      return Promise.resolve(
        Array.from({ length: count }, (_, idx) => ({
          id: `${status}-${idx}`,
          columnOrder: idx + 1,
        }))
      );
    });
    const update = vi.fn().mockResolvedValue({});
    const db = {
      task: {
        findMany,
        update,
      },
    } as unknown as Parameters<typeof compactColumns>[0];

    const total = await compactColumns(db, ["BACKLOG", "DONE", "BACKLOG"]);

    expect(total).toBe(3);
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
