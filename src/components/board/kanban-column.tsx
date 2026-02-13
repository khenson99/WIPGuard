"use client";

import { Droppable } from "@hello-pangea/dnd";
import { TaskCard } from "./task-card";
import type { BoardColumn, TaskWithRelations } from "@/types";

interface KanbanColumnProps {
  column: BoardColumn;
  wipLimit: number;
  onTaskClick: (task: TaskWithRelations) => void;
  onRefresh: () => void;
}

export function KanbanColumn({
  column,
  wipLimit,
  onTaskClick,
  onRefresh,
}: KanbanColumnProps) {
  const isOverLimit = wipLimit > 0 && column.tasks.length > wipLimit;
  const isAtLimit = wipLimit > 0 && column.tasks.length === wipLimit;

  return (
    <div
      className="flex h-full w-72 min-w-[18rem] flex-col rounded-lg"
      style={{ background: "var(--column-bg)" }}
    >
      {/* Column header */}
      <div
        className="flex items-center justify-between rounded-t-lg border-b px-3 py-2.5"
        style={{
          borderColor: isOverLimit
            ? "var(--wip-over-border)"
            : isAtLimit
              ? "var(--wip-at-border)"
              : "var(--column-border)",
          background: isOverLimit
            ? "var(--wip-over-bg)"
            : isAtLimit
              ? "var(--wip-at-bg)"
              : "var(--column-header)",
        }}
      >
        <div className="flex items-center gap-2">
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--foreground)" }}
          >
            {column.label}
          </h3>
          <span
            className="rounded-full px-1.5 py-0.5 text-xs font-medium"
            style={{
              background: isOverLimit
                ? "var(--wip-over-border)"
                : "var(--tag-bg)",
              color: isOverLimit
                ? "var(--wip-over-text)"
                : "var(--muted-foreground)",
            }}
          >
            {column.tasks.length}
          </span>
        </div>
        {wipLimit > 0 && (
          <span
            className="text-xs font-medium"
            style={{
              color: isOverLimit
                ? "var(--wip-over-text)"
                : "var(--muted-foreground)",
            }}
          >
            WIP: {wipLimit}
          </span>
        )}
      </div>

      {/* Droppable area */}
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="flex-1 space-y-2 overflow-y-auto p-2 transition-colors"
            style={{
              background: snapshot.isDraggingOver
                ? "var(--drop-highlight)"
                : undefined,
            }}
          >
            {column.tasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                onClick={() => onTaskClick(task)}
                onAdvance={async () => {
                  await fetch(`/api/tasks/${task.id}/advance`, {
                    method: "POST",
                  });
                  onRefresh();
                }}
                onRetreat={async () => {
                  await fetch(`/api/tasks/${task.id}/retreat`, {
                    method: "POST",
                  });
                  onRefresh();
                }}
              />
            ))}
            {provided.placeholder}

            {column.tasks.length === 0 && !snapshot.isDraggingOver && (
              <div
                className="flex h-24 items-center justify-center text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                No tasks
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}
