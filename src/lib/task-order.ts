import type { TaskStatus } from "@/generated/prisma/client";

type SortOrder = "asc" | "desc";

interface TaskOrderClient {
  task: {
    count(args: {
      where: { status: TaskStatus; id?: { not?: string } };
    }): Promise<number>;
    findMany(args: {
      where: { status: TaskStatus };
      select: { id: true; columnOrder: true };
      orderBy: Array<
        { columnOrder: SortOrder } | { updatedAt: SortOrder } | { id: SortOrder }
      >;
    }): Promise<Array<{ id: string; columnOrder: number }>>;
    update(args: {
      where: { id: string };
      data: { columnOrder: number };
    }): Promise<unknown>;
  };
}

export async function getNextColumnOrder(
  db: TaskOrderClient,
  status: TaskStatus,
  excludeTaskId?: string
): Promise<number> {
  const count = await db.task.count({
    where: {
      status,
      id: excludeTaskId ? { not: excludeTaskId } : undefined,
    },
  });
  return count;
}

export async function compactColumnOrders(
  db: TaskOrderClient,
  status: TaskStatus
): Promise<number> {
  const tasks = await db.task.findMany({
    where: { status },
    select: { id: true, columnOrder: true },
    orderBy: [{ columnOrder: "asc" }, { updatedAt: "asc" }, { id: "asc" }],
  });

  let updates = 0;
  for (let idx = 0; idx < tasks.length; idx += 1) {
    const task = tasks[idx];
    if (task.columnOrder !== idx) {
      await db.task.update({
        where: { id: task.id },
        data: { columnOrder: idx },
      });
      updates += 1;
    }
  }

  return updates;
}

export async function compactColumns(
  db: TaskOrderClient,
  statuses: Iterable<TaskStatus>
): Promise<number> {
  let totalUpdates = 0;
  for (const status of new Set(statuses)) {
    totalUpdates += await compactColumnOrders(db, status);
  }
  return totalUpdates;
}
