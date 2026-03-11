export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { invalidateHierarchy } from "@/lib/hierarchy-cache";
import { emitTaskReordered } from "@/lib/socket-emit";
import { loadPolicies, getUserRole, recordPolicyOverride } from "@/lib/policy-check";
import { checkWipPolicy } from "@/lib/policy-engine";
import { enforcePermission } from "@/lib/permissions";
import { getAuthenticatedUser } from "@/lib/session-user";
import { COLUMN_ORDER } from "@/types";
import type { TaskStatus } from "@/generated/prisma/client";

interface ReorderItem {
  taskId: string;
  status: TaskStatus;
  columnOrder: number;
  expectedUpdatedAt?: string;
}

const VALID_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "BACKLOG",
  "QUEUED",
  "WORKING_ON_TODAY",
  "ACTIVE",
  "NOT_DONE",
  "DONE",
]);

interface ConflictEntry {
  taskId: string;
  expectedUpdatedAt: string;
  currentUpdatedAt: string;
  currentStatus: TaskStatus;
  currentColumnOrder: number;
}

type ColumnVersionMap = Partial<Record<TaskStatus, number>>;

const DEFAULT_COLUMN_ORDER = COLUMN_ORDER.reduce(
  (acc, status, index) => {
    acc[status] = index;
    return acc;
  },
  {} as Record<TaskStatus, number>
);

class ColumnVersionConflictError extends Error {
  readonly columns: TaskStatus[];

  constructor(columns: Iterable<TaskStatus>) {
    super("STALE_COLUMN_VERSION");
    this.columns = [...columns];
  }
}

function parseIsoTimestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function isTaskStatus(value: string): value is TaskStatus {
  return VALID_STATUSES.has(value as TaskStatus);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createEmptyColumnVersions(): Record<TaskStatus, number> {
  return {
    BACKLOG: 0,
    QUEUED: 0,
    WORKING_ON_TODAY: 0,
    ACTIVE: 0,
    NOT_DONE: 0,
    DONE: 0,
  };
}

function parseExpectedColumnVersions(input: unknown): {
  versions: ColumnVersionMap;
  error?: string;
} {
  if (input === undefined || input === null) {
    return { versions: {} };
  }

  if (typeof input !== "object" || Array.isArray(input)) {
    return {
      versions: {},
      error: "expectedColumnVersions must be an object keyed by task status",
    };
  }

  const versions: ColumnVersionMap = {};
  for (const [status, value] of Object.entries(input as Record<string, unknown>)) {
    if (!isTaskStatus(status)) {
      return {
        versions: {},
        error: `Invalid expectedColumnVersions key: ${status}`,
      };
    }

    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      return {
        versions: {},
        error: `Invalid expectedColumnVersions value for ${status}`,
      };
    }

    versions[status] = value;
  }

  return { versions };
}

async function ensureBoardSettingsColumns(
  boardSettings: typeof prisma.boardSettings,
  statuses: Iterable<TaskStatus>
): Promise<void> {
  await Promise.all(
    [...new Set(statuses)].map((status) =>
      boardSettings.upsert({
        where: { columnName: status },
        update: {},
        create: {
          columnName: status,
          columnOrder: DEFAULT_COLUMN_ORDER[status],
        },
      })
    )
  );
}

async function readColumnVersions(
  statuses: Iterable<TaskStatus>
): Promise<Record<TaskStatus, number>> {
  const uniqueStatuses = [...new Set(statuses)];
  const versions = createEmptyColumnVersions();

  if (uniqueStatuses.length === 0) {
    return versions;
  }

  const rows = await prisma.boardSettings.findMany({
    where: { columnName: { in: uniqueStatuses } },
    select: { columnName: true, updatedAt: true },
  });

  for (const row of rows) {
    if (isTaskStatus(row.columnName)) {
      versions[row.columnName] = row.updatedAt.getTime();
    }
  }

  return versions;
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: user.id,
      action: "task.transition",
      request,
      targetType: "task_reorder",
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const body = await request.json();
    const itemsRaw = body.items ?? body;
    const overrideReason = body.overrideReason as string | undefined;
    const expectedColumnVersionParse = parseExpectedColumnVersions(
      body.expectedColumnVersions
    );
    if (expectedColumnVersionParse.error) {
      return NextResponse.json(
        { error: expectedColumnVersionParse.error },
        { status: 400 }
      );
    }
    const expectedColumnVersions = expectedColumnVersionParse.versions;
    const requestId =
      typeof body.requestId === "string" && body.requestId.trim().length > 0
        ? body.requestId.trim()
        : undefined;

    if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
      return NextResponse.json(
        { error: "Request body must include an array of reorder items" },
        { status: 400 }
      );
    }

    const items: ReorderItem[] = [];
    const seenTaskIds = new Set<string>();
    for (const raw of itemsRaw) {
      const taskId = raw?.taskId as string | undefined;
      const status = raw?.status as TaskStatus | undefined;
      const columnOrder = raw?.columnOrder as number | undefined;
      const expectedUpdatedAt = raw?.expectedUpdatedAt as string | undefined;

      if (!taskId || typeof taskId !== "string") {
        return NextResponse.json(
          { error: "Each reorder item must include taskId" },
          { status: 400 }
        );
      }
      if (seenTaskIds.has(taskId)) {
        return NextResponse.json(
          { error: `Duplicate taskId in reorder payload: ${taskId}` },
          { status: 400 }
        );
      }
      seenTaskIds.add(taskId);

      if (!status || !VALID_STATUSES.has(status)) {
        return NextResponse.json(
          { error: `Invalid task status for ${taskId}` },
          { status: 400 }
        );
      }
      if (
        typeof columnOrder !== "number" ||
        !Number.isFinite(columnOrder) ||
        columnOrder < 0
      ) {
        return NextResponse.json(
          { error: `Invalid columnOrder for ${taskId}` },
          { status: 400 }
        );
      }
      if (
        expectedUpdatedAt !== undefined &&
        (typeof expectedUpdatedAt !== "string" ||
          parseIsoTimestamp(expectedUpdatedAt) === null)
      ) {
        return NextResponse.json(
          { error: `Invalid expectedUpdatedAt for ${taskId}` },
          { status: 400 }
        );
      }

      items.push({ taskId, status, columnOrder, expectedUpdatedAt });
    }

    const taskIds = items.map((item) => item.taskId);
    const existingTasks = await prisma.task.findMany({
      where: { id: { in: taskIds } },
      select: {
        id: true,
        title: true,
        projectId: true,
        status: true,
        columnOrder: true,
        updatedAt: true,
      },
    });

    if (existingTasks.length !== taskIds.length) {
      const foundIds = new Set(existingTasks.map((task) => task.id));
      const missing = taskIds.filter((id) => !foundIds.has(id));
      return NextResponse.json(
        { error: `Task(s) not found: ${missing.join(", ")}` },
        { status: 404 }
      );
    }

    const existingById = new Map(
      existingTasks.map((task) => [task.id, task])
    );

    const affectedColumns = new Set<TaskStatus>();
    for (const item of items) {
      affectedColumns.add(item.status);
      const existing = existingById.get(item.taskId);
      if (existing) {
        affectedColumns.add(existing.status);
      }
    }

    if (Object.keys(expectedColumnVersions).length > 0) {
      const missingColumnVersions = [...affectedColumns].filter(
        (status) => expectedColumnVersions[status] === undefined
      );

      if (missingColumnVersions.length > 0) {
        return NextResponse.json(
          {
            error:
              "expectedColumnVersions must include every affected column for reorder operations",
            missingColumns: missingColumnVersions,
          },
          { status: 400 }
        );
      }
    }

    // Optimistic locking checks.
    const conflicts: ConflictEntry[] = [];
    for (const item of items) {
      if (!item.expectedUpdatedAt) continue;
      const expectedTs = parseIsoTimestamp(item.expectedUpdatedAt);
      const current = existingById.get(item.taskId);
      if (!current || expectedTs === null) continue;
      if (current.updatedAt.getTime() !== expectedTs) {
        conflicts.push({
          taskId: item.taskId,
          expectedUpdatedAt: item.expectedUpdatedAt,
          currentUpdatedAt: current.updatedAt.toISOString(),
          currentStatus: current.status,
          currentColumnOrder: current.columnOrder,
        });
      }
    }

    if (conflicts.length > 0) {
      return NextResponse.json(
        {
          error: "Conflict",
          conflict: {
            reason: "STALE_VERSION",
            message:
              "One or more tasks changed before this reorder was applied. Refresh and retry.",
            items: conflicts,
          },
        },
        { status: 409 }
      );
    }

    const statusChanges = items
      .map((item) => {
        const existing = existingById.get(item.taskId);
        if (!existing || existing.status === item.status) {
          return null;
        }
        return {
          taskId: item.taskId,
          from: existing.status,
          to: item.status,
        };
      })
      .filter((change): change is NonNullable<typeof change> => Boolean(change));

    // WIP policy enforcement for columns gaining tasks.
    if (statusChanges.length > 0) {
      const [policies, userRole] = await Promise.all([
        loadPolicies(),
        getUserRole(user.id),
      ]);

      const columnDeltas = new Map<TaskStatus, string[]>();
      for (const change of statusChanges) {
        const taskList = columnDeltas.get(change.to) ?? [];
        taskList.push(change.taskId);
        columnDeltas.set(change.to, taskList);
      }

      const movingTaskIds = new Set(statusChanges.map((change) => change.taskId));
      const affectedColumns = [...columnDeltas.keys()];
      const columnCounts = new Map<TaskStatus, number>();

      for (const col of affectedColumns) {
        const count = await prisma.task.count({
          where: {
            status: col,
            id: { notIn: [...movingTaskIds] },
          },
        });
        columnCounts.set(col, count);
      }

      const violations: Array<{
        column: TaskStatus;
        taskIds: string[];
        policy: ReturnType<typeof checkWipPolicy>;
      }> = [];

      for (const [column, movedTaskIds] of columnDeltas) {
        const baseCount = columnCounts.get(column) ?? 0;
        const projectedCount = baseCount + movedTaskIds.length;
        const policy = checkWipPolicy({
          targetColumn: column,
          currentColumnTaskCount: projectedCount,
          userRole,
          policies,
        });

        if (!policy.allowed || policy.requiresOverride) {
          violations.push({ column, taskIds: movedTaskIds, policy });
        }
      }

      const blocked = violations.filter((violation) => !violation.policy.allowed);
      if (blocked.length > 0) {
        return NextResponse.json(
          {
            error: "WIP limit exceeded",
            violations: blocked.map((violation) => ({
              column: violation.column,
              policy: violation.policy,
            })),
          },
          { status: 409 }
        );
      }

      const needsOverride = violations.filter(
        (violation) => violation.policy.requiresOverride
      );
      if (needsOverride.length > 0) {
        if (!overrideReason) {
          return NextResponse.json(
            {
              error: "Override reason required",
              violations: needsOverride.map((violation) => ({
                column: violation.column,
                policy: violation.policy,
              })),
            },
            { status: 409 }
          );
        }

        for (const violation of needsOverride) {
          for (const taskId of violation.taskIds) {
            await recordPolicyOverride({
              taskId,
              action: "reorder",
              reason: overrideReason,
              actorId: user.id,
              actorName: user.name ?? undefined,
              actorRole: userRole,
              column: violation.column,
              wipCount: violation.policy.currentCount,
              wipLimit: violation.policy.wipLimit,
            });
          }
        }
      }
    }

    const columnTasks = await prisma.task.findMany({
      where: { status: { in: [...affectedColumns] } },
      select: {
        id: true,
        status: true,
        columnOrder: true,
        updatedAt: true,
      },
      orderBy: [{ status: "asc" }, { columnOrder: "asc" }, { updatedAt: "asc" }, { id: "asc" }],
    });

    const movingIds = new Set(items.map((item) => item.taskId));
    const baselineByColumn = new Map<TaskStatus, string[]>();

    for (const task of columnTasks) {
      if (movingIds.has(task.id)) continue;
      const list = baselineByColumn.get(task.status) ?? [];
      list.push(task.id);
      baselineByColumn.set(task.status, list);
    }

    for (const status of affectedColumns) {
      if (!baselineByColumn.has(status)) {
        baselineByColumn.set(status, []);
      }
    }

    const insertionsByColumn = new Map<TaskStatus, ReorderItem[]>();
    for (const item of items) {
      const list = insertionsByColumn.get(item.status) ?? [];
      list.push(item);
      insertionsByColumn.set(item.status, list);
    }

    const finalByColumn = new Map<TaskStatus, string[]>();
    for (const status of affectedColumns) {
      const ordered = [...(baselineByColumn.get(status) ?? [])];
      const insertions = [...(insertionsByColumn.get(status) ?? [])].sort(
        (a, b) =>
          a.columnOrder - b.columnOrder || a.taskId.localeCompare(b.taskId)
      );

      for (const insertion of insertions) {
        const idx = clamp(insertion.columnOrder, 0, ordered.length);
        ordered.splice(idx, 0, insertion.taskId);
      }

      finalByColumn.set(status, ordered);
    }

    const now = new Date();
    const taskUpdates: Array<{
      taskId: string;
      status: TaskStatus;
      columnOrder: number;
      completedOn: Date | null | undefined;
    }> = [];

    for (const [status, orderedIds] of finalByColumn) {
      for (let index = 0; index < orderedIds.length; index += 1) {
        const taskId = orderedIds[index];
        const existing = existingById.get(taskId);
        const statusChanged = existing && existing.status !== status;
        const orderChanged = existing && existing.columnOrder !== index;

        if (!statusChanged && !orderChanged) {
          continue;
        }

        taskUpdates.push({
          taskId,
          status,
          columnOrder: index,
          completedOn: statusChanged
            ? status === "DONE"
              ? now
              : existing?.status === "DONE"
                ? null
                : undefined
            : undefined,
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      await ensureBoardSettingsColumns(tx.boardSettings, affectedColumns);

      for (const status of affectedColumns) {
        const expectedVersion = expectedColumnVersions[status];
        const result = await tx.boardSettings.updateMany({
          where:
            expectedVersion !== undefined
              ? { columnName: status, updatedAt: new Date(expectedVersion) }
              : { columnName: status },
          data: {
            updatedAt: new Date(),
          },
        });

        if (result.count !== 1) {
          throw new ColumnVersionConflictError(affectedColumns);
        }
      }

      await Promise.all(
        taskUpdates.map((update) =>
          tx.task.update({
            where: { id: update.taskId },
            data: {
              status: update.status,
              columnOrder: update.columnOrder,
              completedOn: update.completedOn,
            },
          })
        )
      );

      if (statusChanges.length > 0) {
        await tx.statusHistory.createMany({
          data: statusChanges.map((change) => ({
            taskId: change.taskId,
            fromStatus: change.from,
            toStatus: change.to,
            changedBy: user.id,
          })),
        });
      }
    });

    const currentColumnVersions = await readColumnVersions(affectedColumns);

    const doneChanges = statusChanges.filter((change) => change.to === "DONE");
    if (doneChanges.length > 0) {
      const doneTasks = await prisma.task.findMany({
        where: { id: { in: doneChanges.map((change) => change.taskId) } },
        include: {
          project: true,
          sprint: true,
          responsible: { select: { id: true, name: true } },
          accountable: { select: { id: true, name: true } },
        },
      });

      for (const task of doneTasks) {
        await prisma.logbookEntry.create({
          data: {
            taskId: task.id,
            taskTitle: task.title,
            taskNotes: task.notes,
            projectName: task.project?.name ?? null,
            sprintName: task.sprint?.name ?? null,
            priority: task.priority,
            status: task.status,
            responsible:
              task.responsible
                .map((user: { name: string | null }) => user.name)
                .join(", ") || null,
            accountable:
              task.accountable
                .map((user: { name: string | null }) => user.name)
                .join(", ") || null,
            completedOn: task.completedOn ?? now,
            metadata: {
              taskId: task.id,
              projectId: task.projectId,
              sprintId: task.sprintId,
              priority: task.priority,
              degreeOfDifficulty: task.degreeOfDifficulty,
              startDate: task.startDate,
              dueDate: task.dueDate,
              completedOn: task.completedOn,
              unplanned: task.unplanned,
              responsible: task.responsible,
              accountable: task.accountable,
            },
          },
        });
      }
    }

    const eventId = requestId ? `task:reordered:${requestId}` : undefined;
    const itemsWithProjectId = items.map((item) => ({
      ...item,
      projectId: existingById.get(item.taskId)?.projectId ?? null,
    }));
    const statusChangesWithProjectId = statusChanges.map((change) => ({
      ...change,
      projectId: existingById.get(change.taskId)?.projectId ?? null,
    }));

    const projectIds = new Set(
      itemsWithProjectId
        .map((item) => item.projectId)
        .filter((projectId): projectId is string => typeof projectId === "string")
    );

    for (const projectId of projectIds) {
      emitTaskReordered(projectId, {
        items: itemsWithProjectId
          .filter((item) => item.projectId === projectId)
          .map(({ taskId, status, columnOrder }) => ({
            taskId,
            status,
            columnOrder,
          })),
        statusChanges: statusChangesWithProjectId
          .filter((change) => change.projectId === projectId)
          .map(({ taskId, from, to }) => ({
            taskId,
            from,
            to,
          })),
        eventId: eventId ?? null,
      });
    }

    invalidateHierarchy(user.id);

    return NextResponse.json({
      success: true,
      updated: taskUpdates.length,
      statusChanges: statusChanges.length,
      eventId: eventId ?? null,
      columnVersions: currentColumnVersions,
    });
  } catch (error) {
    if (error instanceof ColumnVersionConflictError) {
      const currentColumnVersions = await readColumnVersions(error.columns);
      return NextResponse.json(
        {
          error: "Conflict",
          conflict: {
            reason: "STALE_COLUMN_VERSION",
            message:
              "This column changed before your reorder was applied. Refresh and retry.",
            columns: error.columns,
            columnVersions: currentColumnVersions,
          },
        },
        { status: 409 }
      );
    }

    console.error("PATCH /api/tasks/reorder error:", error);
    return NextResponse.json(
      { error: "Failed to reorder tasks" },
      { status: 500 }
    );
  }
}
