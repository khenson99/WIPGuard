"use client";

import { useState } from "react";
import { Draggable } from "@hello-pangea/dnd";
import { clsx } from "clsx";
import {
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  MessageSquare,
  Link2,
  Gauge,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import type { TaskWithRelations } from "@/types";
import {
  STATUS_COLORS,
  DIFFICULTY_STYLES,
  DIFFICULTY_TAG_STYLES,
  DIFFICULTY_LABELS,
  COLUMN_ORDER,
  COLUMN_LABELS,
} from "@/types";
import type { TaskStatus as TStatus } from "@/types";

export type GroupByMode = "status" | "project" | "department";

interface TaskCardProps {
  task: TaskWithRelations;
  index: number;
  onClick: () => void;
  onAdvance: () => void;
  onRetreat?: () => void;
  onDelete: () => void;
  displayPreset: "standard" | "dense" | "triage";
  showMetadata: boolean;
  selected: boolean;
  onSelect: () => void;
  groupBy?: GroupByMode;
  departmentName?: string | null;
  departmentColor?: string | null;
}

export function TaskCard({
  task,
  index,
  onClick,
  onAdvance,
  onRetreat,
  onDelete,
  displayPreset,
  showMetadata,
  selected,
  onSelect,
  groupBy = "status",
  departmentName,
  departmentColor,
}: TaskCardProps) {
  const colIdx = COLUMN_ORDER.indexOf(task.status);
  const canRetreat = colIdx > 0;
  const canAdvance = task.status !== "DONE";
  const isCompact = displayPreset !== "standard";
  const [expanded, setExpanded] = useState(false);
  const revealMetadata = showMetadata || expanded || displayPreset === "standard";

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          tabIndex={0}
          onClick={() => {
            onSelect();
            onClick();
          }}
          onFocus={onSelect}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect();
              onClick();
              return;
            }
            if (e.key === "ArrowRight" && canAdvance) {
              e.preventDefault();
              onAdvance();
              return;
            }
            if (e.key === "ArrowLeft" && canRetreat) {
              e.preventDefault();
              onRetreat?.();
              return;
            }
            if (e.key.toLowerCase() === "m") {
              e.preventDefault();
              setExpanded((current) => !current);
            }
          }}
          className={clsx(
            "group cursor-pointer rounded-md border transition-all outline-none",
            isCompact ? "p-2" : "p-3",
            selected && "ring-1 ring-primary/70"
          )}
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
            onSelect();
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
              className={clsx(
                "flex-1 font-medium leading-snug text-foreground",
                isCompact ? "text-[13px]" : "text-sm"
              )}
            >
              {task.title}
            </h4>
            {displayPreset !== "standard" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((current) => !current);
                }}
                className="rounded p-0.5 text-muted-foreground hover:bg-tag-bg hover:text-foreground"
                title={
                  revealMetadata ? "Hide card metadata (M)" : "Show card metadata (M)"
                }
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Tags row: contextual metadata based on grouping */}
          {revealMetadata && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {/* Status tag — show when NOT grouped by status */}
              {groupBy !== "status" && (
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: `${STATUS_COLORS[task.status]}18`,
                    color: STATUS_COLORS[task.status],
                  }}
                >
                  {COLUMN_LABELS[task.status as TStatus] || task.status}
                </span>
              )}
              {/* Project tag — show when NOT grouped by project */}
              {groupBy !== "project" && task.project && (
                <span className="rounded bg-tag-bg px-1.5 py-0.5 text-[10px] font-medium text-tag-text">
                  {task.project.name}
                </span>
              )}
              {/* Department tag — show when NOT grouped by department */}
              {groupBy !== "department" && departmentName && (
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: departmentColor ? `${departmentColor}18` : undefined,
                    color: departmentColor || undefined,
                  }}
                >
                  {departmentName}
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
                  <AlertTriangle className="h-3 w-3 text-primary" />
                </span>
              )}
              {task.slackThread && (
                <span title="Has Slack thread" className="flex items-center">
                  <MessageSquare className="h-3 w-3 text-muted-foreground" />
                </span>
              )}
              {task.dependsOn && task.dependsOn.length > 0 && (
                <span
                  title={`Depends on ${task.dependsOn.length} task(s)`}
                  className="flex items-center"
                >
                  <Link2 className="h-3 w-3 text-muted-foreground" />
                </span>
              )}
            </div>
          )}

          {/* Bottom row: avatars + action buttons */}
          <div className={clsx("flex items-center justify-between", revealMetadata ? "mt-2" : "mt-1.5")}>
            {/* Assignee avatars */}
            <div className="flex items-center gap-1.5">
              {task.responsible && task.responsible.length > 0 && (
                <div className="flex -space-x-1">
                  {task.responsible.slice(0, isCompact ? 2 : 3).map((user) => (
                    <div
                      key={user.id}
                      className="flex h-5 w-5 items-center justify-center rounded-full border border-avatar-border bg-avatar-bg text-[9px] font-medium text-avatar-text"
                      title={user.name || user.email}
                    >
                      {(user.name || user.email)[0].toUpperCase()}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons — visible on hover */}
            <div className="flex items-center gap-0.5">
              {/* Edit button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClick();
                }}
                className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-tag-bg hover:text-foreground group-hover:opacity-100"
                title="Edit task"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {/* Retreat button */}
              {canRetreat && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetreat?.();
                  }}
                  className="action-btn-retreat rounded p-0.5 opacity-0 group-hover:opacity-100"
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
                  className="action-btn-advance rounded p-0.5 opacity-0 group-hover:opacity-100"
                  title="Advance status"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                title="Delete task"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Due date */}
          {task.dueDate && revealMetadata && (
            <div className="mt-1.5 text-[10px] text-muted-foreground">
              Due {new Date(task.dueDate).toLocaleDateString()}
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}
