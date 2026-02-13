"use client";

import { Droppable } from "@hello-pangea/dnd";
import { clsx } from "clsx";
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
    <div className="flex h-full w-72 min-w-[18rem] flex-col rounded-lg bg-zinc-900/50">
      {/* Column header */}
      <div
        className={clsx(
          "flex items-center justify-between rounded-t-lg border-b px-3 py-2.5",
          isOverLimit
            ? "border-red-800 bg-red-950/50"
            : isAtLimit
              ? "border-amber-800 bg-amber-950/30"
              : "border-zinc-800 bg-zinc-900"
        )}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-zinc-200">
            {column.label}
          </h3>
          <span
            className={clsx(
              "rounded-full px-1.5 py-0.5 text-xs font-medium",
              isOverLimit
                ? "bg-red-900 text-red-300"
                : "bg-zinc-800 text-zinc-400"
            )}
          >
            {column.tasks.length}
          </span>
        </div>
        {wipLimit > 0 && (
          <span
            className={clsx(
              "text-xs font-medium",
              isOverLimit ? "text-red-400" : "text-zinc-500"
            )}
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
            className={clsx(
              "flex-1 space-y-2 overflow-y-auto p-2 transition-colors",
              snapshot.isDraggingOver && "bg-zinc-800/30"
            )}
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
              <div className="flex h-24 items-center justify-center text-xs text-zinc-600">
                No tasks
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}
