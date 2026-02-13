"use client";

import { Draggable } from "@hello-pangea/dnd";
import { clsx } from "clsx";
import {
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  MessageSquare,
  Link2,
  Gauge,
} from "lucide-react";
import type { TaskWithRelations } from "@/types";
import {
  STATUS_COLORS,
  DIFFICULTY_BG,
  DIFFICULTY_LABELS,
  COLUMN_ORDER,
} from "@/types";

interface TaskCardProps {
  task: TaskWithRelations;
  index: number;
  onClick: () => void;
  onAdvance: () => void;
  onRetreat?: () => void;
}

export function TaskCard({
  task,
  index,
  onClick,
  onAdvance,
  onRetreat,
}: TaskCardProps) {
  const colIdx = COLUMN_ORDER.indexOf(task.status);
  const canRetreat = colIdx > 0;
  const canAdvance = task.status !== "DONE";

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={clsx(
            "group cursor-pointer rounded-md border p-3 transition-all",
            DIFFICULTY_BG[task.degreeOfDifficulty],
            snapshot.isDragging
              ? "border-amber-600 shadow-lg shadow-amber-900/20"
              : "border-zinc-800 hover:border-zinc-700"
          )}
        >
          {/* Status dot + title row */}
          <div className="flex items-start gap-2">
            <div
              className="mt-1 h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[task.status] }}
              title={task.status.replace(/_/g, " ")}
            />
            <h4 className="flex-1 text-sm font-medium text-zinc-200 leading-snug">
              {task.title}
            </h4>
          </div>

          {/* Tags row: project + difficulty + unplanned */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {task.project && (
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                {task.project.name}
              </span>
            )}
            <span
              className={clsx(
                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                task.degreeOfDifficulty === "EPIC"
                  ? "bg-red-900/60 text-red-300"
                  : task.degreeOfDifficulty === "HIGH"
                    ? "bg-amber-900/50 text-amber-300"
                    : task.degreeOfDifficulty === "MEDIUM"
                      ? "bg-yellow-900/40 text-yellow-300"
                      : "bg-zinc-800 text-zinc-500"
              )}
              title={`Difficulty: ${DIFFICULTY_LABELS[task.degreeOfDifficulty]}`}
            >
              <Gauge className="mr-0.5 inline h-2.5 w-2.5" />
              {DIFFICULTY_LABELS[task.degreeOfDifficulty]}
            </span>
            {task.unplanned && (
              <span title="Unplanned" className="flex items-center">
                <AlertTriangle className="h-3 w-3 text-amber-500" />
              </span>
            )}
            {task.slackThread && (
              <span title="Has Slack thread" className="flex items-center">
                <MessageSquare className="h-3 w-3 text-zinc-500" />
              </span>
            )}
            {task.dependsOn && task.dependsOn.length > 0 && (
              <span
                title={`Depends on ${task.dependsOn.length} task(s)`}
                className="flex items-center"
              >
                <Link2 className="h-3 w-3 text-zinc-500" />
              </span>
            )}
          </div>

          {/* Bottom row: avatars + action buttons */}
          <div className="mt-2 flex items-center justify-between">
            {/* Assignee avatars */}
            <div className="flex items-center gap-1.5">
              {task.responsible && task.responsible.length > 0 && (
                <div className="flex -space-x-1">
                  {task.responsible.slice(0, 3).map((user) => (
                    <div
                      key={user.id}
                      className="flex h-5 w-5 items-center justify-center rounded-full border border-zinc-900 bg-zinc-700 text-[9px] font-medium text-zinc-300"
                      title={user.name || user.email}
                    >
                      {(user.name || user.email)[0].toUpperCase()}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons — always visible */}
            <div className="flex items-center gap-0.5">
              {/* Retreat button */}
              {canRetreat && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetreat?.();
                  }}
                  className="rounded p-0.5 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-800 hover:text-blue-400"
                  title="Move back"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              {/* Advance button */}
              {canAdvance && (
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

          {/* Due date */}
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
