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
  Check,
  Flag,
  UserPlus,
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
  onReplenish?: () => void;
  onAssignToMe?: () => void;
  onCyclePriority?: () => void;
  onComplete?: () => void;
  onDelete: () => void;
  displayPreset: "standard" | "dense" | "triage";
  showMetadata: boolean;
  selected: boolean;
  onSelect: () => void;
  groupBy?: GroupByMode;
  departmentName?: string | null;
  departmentColor?: string | null;
  commitmentState?: "committed" | "opportunistic" | null;
  isAssignedToMe?: boolean;
  replenishWarning?: string | null;
}

export function TaskCard({
  task,
  index,
  onClick,
  onAdvance,
  onRetreat,
  onReplenish,
  onAssignToMe,
  onCyclePriority,
  onComplete,
  onDelete,
  displayPreset,
  showMetadata,
  selected,
  onSelect,
  groupBy = "status",
  departmentName,
  departmentColor,
  commitmentState = null,
  isAssignedToMe = false,
  replenishWarning = null,
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
            {commitmentState && (
              <span
                className={clsx(
                  "mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  commitmentState === "committed"
                    ? "bg-emerald-500/15 text-emerald-600"
                    : "bg-amber-500/15 text-amber-700"
                )}
                title={
                  commitmentState === "committed"
                    ? "Committed sprint work"
                    : "Opportunistic sprint work"
                }
              >
                {commitmentState === "committed" ? "Committed" : "Opportunistic"}
              </span>
            )}
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
              {canAdvance && task.status !== "BACKLOG" && (
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
            </div>
          </div>

          {/* Due date */}
          {task.dueDate && revealMetadata && (
            <div className="mt-1.5 text-[10px] text-muted-foreground">
              Due {new Date(task.dueDate).toLocaleDateString()}
            </div>
          )}

          {/* Persistent footer actions */}
          <div
            className={clsx(
              "mt-2 flex items-center justify-between gap-1 border-t border-border/60 pt-1.5",
              isCompact && "gap-0.5"
            )}
          >
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClick();
                }}
                className="rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-tag-bg hover:text-foreground"
                title="Edit task"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {onAssignToMe && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAssignToMe();
                  }}
                  className={clsx(
                    "rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-tag-bg hover:text-foreground",
                    isAssignedToMe && "text-primary"
                  )}
                  title={isAssignedToMe ? "Already assigned to you" : "Assign to me"}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                </button>
              )}
              {onCyclePriority && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCyclePriority();
                  }}
                  className="rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-tag-bg hover:text-foreground"
                  title={`Cycle priority (current: ${task.priority})`}
                >
                  <Flag className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1">
              {task.status === "BACKLOG" && onReplenish && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReplenish();
                  }}
                  className={clsx(
                    "action-btn-advance rounded px-1.5 py-1 text-[11px]",
                    replenishWarning && "text-amber-600"
                  )}
                  title={replenishWarning || "Replenish to Queued"}
                >
                  {replenishWarning ? (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
              {canRetreat && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetreat?.();
                  }}
                  className="action-btn-retreat rounded px-1.5 py-1 text-[11px]"
                  title="Move back"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
              )}
              {canAdvance && task.status !== "BACKLOG" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdvance();
                  }}
                  className="action-btn-advance rounded px-1.5 py-1 text-[11px]"
                  title="Advance status"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
              {task.status !== "DONE" && onComplete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onComplete();
                  }}
                  className="rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-tag-bg hover:text-foreground"
                  title="Mark done"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                title="Delete task"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}
