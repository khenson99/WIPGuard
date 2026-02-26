"use client";

import { Droppable } from "@hello-pangea/dnd";
import { clsx } from "clsx";
import { TaskCard, type GroupByMode } from "./task-card";
import type { BoardColumn, Priority, TaskWithRelations } from "@/types";

interface KanbanColumnProps {
  column: BoardColumn;
  wipLimit: number;
  onTaskClick: (task: TaskWithRelations) => void;
  onRefresh: () => void;
  displayPreset: "standard" | "dense" | "triage";
  showMetadata: boolean;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  groupBy?: GroupByMode;
  departmentName?: string | null;
  departmentColor?: string | null;
  droppableIdPrefix?: string;
  getDeptForTask?: (task: TaskWithRelations) => { name: string; color: string | null } | null;
  hideHeader?: boolean;
  currentUserId?: string | null;
  activeSprintId?: string | null;
  committedTaskIds?: Set<string>;
  queuedCount?: number;
  queuedWipLimit?: number;
  onReplenishTask?: (task: TaskWithRelations) => Promise<void>;
}

export function KanbanColumn({
  column,
  wipLimit,
  onTaskClick,
  onRefresh,
  displayPreset,
  showMetadata,
  selectedTaskId,
  onSelectTask,
  groupBy = "status",
  departmentName,
  departmentColor,
  droppableIdPrefix = "",
  getDeptForTask,
  hideHeader = false,
  currentUserId = null,
  activeSprintId = null,
  committedTaskIds = new Set<string>(),
  queuedCount = 0,
  queuedWipLimit = 0,
  onReplenishTask,
}: KanbanColumnProps) {
  const isOverLimit = wipLimit > 0 && column.tasks.length > wipLimit;
  const isAtLimit = wipLimit > 0 && column.tasks.length === wipLimit;
  const isCompact = displayPreset !== "standard";
  const queuedBudgetExceeded =
    queuedWipLimit > 0 && queuedCount >= queuedWipLimit;

  const nextPriority = (current: Priority): Priority => {
    const order: Priority[] = ["P3", "P2", "P1", "P0"];
    const index = order.indexOf(current);
    return order[(index + 1) % order.length];
  };

  const patchTask = async (
    task: TaskWithRelations,
    payload: Record<string, unknown>,
    conflictFallbackMessage: string
  ): Promise<boolean> => {
    const response = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        expectedUpdatedAt: task.updatedAt,
      }),
    });
    if (!response.ok) {
      if (response.status === 409) {
        const conflict = await response.json().catch(() => null);
        window.alert(
          conflict?.conflict?.message ||
            conflict?.error ||
            conflictFallbackMessage
        );
      } else {
        window.alert("Task update failed. Please try again.");
      }
      return false;
    }
    return true;
  };

  return (
    <div
      className={clsx(
        "flex h-full flex-col backdrop-blur-md transition-all",
        !hideHeader && "rounded-xl bg-column-bg/80 border border-border/40 shadow-sm hover:shadow-md",
        !hideHeader && (isCompact ? "w-64 min-w-[16rem]" : "w-72 min-w-[18rem]")
      )}
    >
      {/* Column header — hidden when parent provides its own */}
      {!hideHeader && (
        <div
          className={clsx(
            "flex items-center justify-between rounded-t-xl border-b px-4 py-3 bg-gradient-to-b from-transparent to-background/20",
            isOverLimit
              ? "border-wip-over-border bg-wip-over-bg"
              : isAtLimit
                ? "border-wip-at-border bg-wip-at-bg"
                : "border-border/50 bg-column-header/50"
          )}
        >
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-bold tracking-tight text-foreground">
              {column.label}
            </h3>
            <span
              className={clsx(
                "rounded-md px-2 py-0.5 text-[11px] font-bold shadow-sm border",
                isOverLimit
                  ? "bg-red-500/10 text-red-500 border-red-500/20"
                  : "bg-primary/10 text-primary border-primary/20"
              )}
            >
              {column.tasks.length}
            </span>
          </div>
          {wipLimit > 0 && (
            <span
              className={clsx(
                "text-[11px] font-bold px-2 py-0.5 rounded-md border",
                isOverLimit 
                  ? "bg-red-500/10 text-red-500 border-red-500/20" 
                  : "bg-muted/50 text-muted-foreground border-border/40"
              )}
            >
              WIP: {wipLimit}
            </span>
          )}
        </div>
      )}

      {/* Droppable area */}
      <Droppable droppableId={`${droppableIdPrefix}${column.id}`}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={clsx(
              "flex-1 overflow-y-auto transition-colors",
              isCompact ? "space-y-1 p-1.5" : "space-y-2 p-2"
            )}
            style={{
              background: snapshot.isDraggingOver
                ? "var(--drop-highlight)"
                : undefined,
            }}
          >
            {column.tasks.map((task, index) => {
              const taskDept = getDeptForTask ? getDeptForTask(task) : null;
              const commitmentState =
                activeSprintId && task.sprintId === activeSprintId
                  ? committedTaskIds.has(task.id)
                    ? "committed"
                    : "opportunistic"
                  : null;
              const isAssignedToMe = Boolean(
                currentUserId &&
                  task.responsible?.some((member) => member.id === currentUserId)
              );
              const replenishWarning =
                task.status === "BACKLOG" && queuedBudgetExceeded
                  ? `Queued WIP budget is full (${queuedCount}/${queuedWipLimit}).`
                  : null;
              return (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                onClick={() => onTaskClick(task)}
                onSelect={() => onSelectTask(task.id)}
                selected={selectedTaskId === task.id}
                displayPreset={displayPreset}
                showMetadata={showMetadata}
                groupBy={groupBy}
                departmentName={departmentName || taskDept?.name}
                departmentColor={departmentColor || taskDept?.color}
                commitmentState={commitmentState}
                isAssignedToMe={isAssignedToMe}
                replenishWarning={replenishWarning}
                onAdvance={async () => {
                  if (task.status === "BACKLOG" && onReplenishTask) {
                    await onReplenishTask(task);
                    return;
                  }
                  const response = await fetch(`/api/tasks/${task.id}/advance`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      expectedUpdatedAt: task.updatedAt,
                    }),
                  });
                  if (!response.ok && response.status === 409) {
                    const conflict = await response.json().catch(() => null);
                    window.alert(
                      conflict?.conflict?.message ||
                        conflict?.error ||
                        "Task changed before advance was applied. Refreshing board."
                    );
                  }
                  onRefresh();
                }}
                onReplenish={
                  onReplenishTask
                    ? async () => {
                        await onReplenishTask(task);
                      }
                    : undefined
                }
                onRetreat={async () => {
                  const response = await fetch(`/api/tasks/${task.id}/retreat`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      expectedUpdatedAt: task.updatedAt,
                    }),
                  });
                  if (!response.ok && response.status === 409) {
                    const conflict = await response.json().catch(() => null);
                    window.alert(
                      conflict?.conflict?.message ||
                        conflict?.error ||
                        "Task changed before retreat was applied. Refreshing board."
                    );
                  }
                  onRefresh();
                }}
                onAssignToMe={
                  currentUserId
                    ? async () => {
                        if (isAssignedToMe) return;
                        const currentResponsible =
                          task.responsible?.map((member) => member.id) ?? [];
                        const ok = await patchTask(
                          task,
                          {
                            responsibleIds: Array.from(
                              new Set([...currentResponsible, currentUserId])
                            ),
                          },
                          "Task changed before assignment was applied. Refreshing board."
                        );
                        if (ok) onRefresh();
                      }
                    : undefined
                }
                onCyclePriority={async () => {
                  const ok = await patchTask(
                    task,
                    { priority: nextPriority(task.priority) },
                    "Task changed before priority update was applied. Refreshing board."
                  );
                  if (ok) onRefresh();
                }}
                onComplete={async () => {
                  if (task.status === "DONE") return;
                  const ok = await patchTask(
                    task,
                    { status: "DONE" },
                    "Task changed before completion was applied. Refreshing board."
                  );
                  if (ok) onRefresh();
                }}
                onDelete={async () => {
                  const confirmed = window.confirm(
                    `Delete "${task.title}"? This cannot be undone.`
                  );
                  if (!confirmed) return;
                  const response = await fetch(`/api/tasks/${task.id}`, {
                    method: "DELETE",
                  });
                  if (!response.ok) {
                    window.alert("Failed to delete task. Please try again.");
                  }
                  onRefresh();
                }}
              />
              );
            })}
            {provided.placeholder}

            {column.tasks.length === 0 && !snapshot.isDraggingOver && (
              <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
                No tasks
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}
