"use client";

import { Draggable } from "@hello-pangea/dnd";
import { clsx } from "clsx";
import { ChevronRight, AlertTriangle } from "lucide-react";
import type { TaskWithRelations } from "@/types";
import { PRIORITY_COLORS } from "@/types";

interface TaskCardProps {
  task: TaskWithRelations;
  index: number;
  onClick: () => void;
  onAdvance: () => void;
}

export function TaskCard({ task, index, onClick, onAdvance }: TaskCardProps) {
  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={clsx(
            "group cursor-pointer rounded-md border bg-zinc-900 p-3 transition-shadow",
            snapshot.isDragging
              ? "border-amber-600 shadow-lg shadow-amber-900/20"
              : "border-zinc-800 hover:border-zinc-700"
          )}
        >
          {/* Priority indicator + title */}
          <div className="flex items-start gap-2">
            <div
              className="mt-1 h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
              title={task.priority}
            />
            <h4 className="flex-1 text-sm font-medium text-zinc-200 leading-snug">
              {task.title}
            </h4>
          </div>

          {/* Meta row */}
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {task.project && (
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                  {task.project.name}
                </span>
              )}
              {task.unplanned && (
                <span title="Unplanned">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {/* Assignee avatars */}
              {task.responsible && task.responsible.length > 0 && (
                <div className="flex -space-x-1">
                  {task.responsible.slice(0, 3).map((user) => (
                    <div
                      key={user.id}
                      className="h-5 w-5 rounded-full border border-zinc-900 bg-zinc-700 text-[9px] font-medium text-zinc-300 flex items-center justify-center"
                      title={user.name || user.email}
                    >
                      {(user.name || user.email)[0].toUpperCase()}
                    </div>
                  ))}
                </div>
              )}

              {/* Advance button */}
              {task.status !== "DONE" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdvance();
                  }}
                  className="rounded p-0.5 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-800 hover:text-amber-500"
                  title="Advance status"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Due date if present */}
          {task.dueDate && (
            <div className="mt-1.5 text-[10px] text-zinc-500">
              Due {new Date(task.dueDate).toLocaleDateString()}
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}
