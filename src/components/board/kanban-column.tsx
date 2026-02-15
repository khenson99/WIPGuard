"use client";

import { Droppable } from "@hello-pangea/dnd";
import { clsx } from "clsx";
import { TaskCard, type GroupByMode } from "./task-card";
import type { BoardColumn, TaskWithRelations } from "@/types";

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
}: KanbanColumnProps) {
  const isOverLimit = wipLimit > 0 && column.tasks.length > wipLimit;
  const isAtLimit = wipLimit > 0 && column.tasks.length === wipLimit;
  const isCompact = displayPreset !== "standard";

  return (
    <div
      className={clsx(
        "flex h-full flex-col",
        !hideHeader && "rounded-lg bg-column-bg",
        !hideHeader && (isCompact ? "w-64 min-w-[16rem]" : "w-72 min-w-[18rem]")
      )}
    >
      {/* Column header — hidden when parent provides its own */}
      {!hideHeader && (
        <div
          className={clsx(
            "flex items-center justify-between rounded-t-lg border-b px-3 py-2.5",
            isOverLimit
              ? "border-wip-over-border bg-wip-over-bg"
              : isAtLimit
                ? "border-wip-at-border bg-wip-at-bg"
                : "border-column-border bg-column-header"
          )}
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              {column.label}
            </h3>
            <span
              className={clsx(
                "rounded-full px-1.5 py-0.5 text-xs font-medium",
                isOverLimit
                  ? "bg-wip-over-border text-wip-over-text"
                  : "bg-tag-bg text-muted-foreground"
              )}
            >
              {column.tasks.length}
            </span>
          </div>
          {wipLimit > 0 && (
            <span
              className={clsx(
                "text-xs font-medium",
                isOverLimit ? "text-wip-over-text" : "text-muted-foreground"
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
                onAdvance={async () => {
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
