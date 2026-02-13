"use client";

import { Draggable } from "@hello-pangea/dnd";
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
  DIFFICULTY_STYLES,
  DIFFICULTY_TAG_STYLES,
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
          className="group cursor-pointer rounded-md border p-3 transition-all"
          style={{
            ...DIFFICULTY_STYLES[task.degreeOfDifficulty],
            borderColor: snapshot.isDragging
              ? "var(--card-drag-border)"
              : "var(--card-border)",
            boxShadow: snapshot.isDragging
              ? `${DIFFICULTY_STYLES[task.degreeOfDifficulty].boxShadow}, 0 10px 15px -3px var(--card-drag-shadow)`
              : DIFFICULTY_STYLES[task.degreeOfDifficulty].boxShadow,
            ...provided.draggableProps.style,
          }}
          onMouseEnter={(e) => {
            if (!snapshot.isDragging) {
              e.currentTarget.style.borderColor = "var(--card-hover-border)";
            }
          }}
          onMouseLeave={(e) => {
            if (!snapshot.isDragging) {
              e.currentTarget.style.borderColor = "var(--card-border)";
            }
          }}
        >
          {/* Status dot + title row */}
          <div className="flex items-start gap-2">
            <div
              className="mt-1 h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[task.status] }}
              title={task.status.replace(/_/g, " ")}
            />
            <h4
              className="flex-1 text-sm font-medium leading-snug"
              style={{ color: "var(--foreground)" }}
            >
              {task.title}
            </h4>
          </div>

          {/* Tags row: project + difficulty + unplanned */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {task.project && (
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  background: "var(--tag-bg)",
                  color: "var(--tag-text)",
                }}
              >
                {task.project.name}
              </span>
            )}
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={DIFFICULTY_TAG_STYLES[task.degreeOfDifficulty]}
              title={`Difficulty: ${DIFFICULTY_LABELS[task.degreeOfDifficulty]}`}
            >
              <Gauge className="mr-0.5 inline h-2.5 w-2.5" />
              {DIFFICULTY_LABELS[task.degreeOfDifficulty]}
            </span>
            {task.unplanned && (
              <span title="Unplanned" className="flex items-center">
                <AlertTriangle
                  className="h-3 w-3"
                  style={{ color: "var(--primary)" }}
                />
              </span>
            )}
            {task.slackThread && (
              <span title="Has Slack thread" className="flex items-center">
                <MessageSquare
                  className="h-3 w-3"
                  style={{ color: "var(--muted-foreground)" }}
                />
              </span>
            )}
            {task.dependsOn && task.dependsOn.length > 0 && (
              <span
                title={`Depends on ${task.dependsOn.length} task(s)`}
                className="flex items-center"
              >
                <Link2
                  className="h-3 w-3"
                  style={{ color: "var(--muted-foreground)" }}
                />
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
                      className="flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-medium"
                      style={{
                        borderColor: "var(--avatar-border)",
                        background: "var(--avatar-bg)",
                        color: "var(--avatar-text)",
                      }}
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
                  className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ color: "var(--muted-foreground)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--sidebar-hover)";
                    e.currentTarget.style.color = "var(--info)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "";
                    e.currentTarget.style.color = "var(--muted-foreground)";
                  }}
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
                  className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ color: "var(--muted-foreground)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--sidebar-hover)";
                    e.currentTarget.style.color = "var(--primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "";
                    e.currentTarget.style.color = "var(--muted-foreground)";
                  }}
                  title="Advance status"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Due date */}
          {task.dueDate && (
            <div
              className="mt-1.5 text-[10px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              Due {new Date(task.dueDate).toLocaleDateString()}
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}
