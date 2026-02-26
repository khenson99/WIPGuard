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
            "group cursor-pointer rounded-xl border transition-all duration-300 outline-none relative overflow-hidden backdrop-blur-sm",
            isCompact ? "p-2.5" : "p-4",
            selected && "ring-2 ring-primary/60 outline-none",
            !snapshot.isDragging && "hover:-translate-y-0.5"
          )}
          style={{
            ...DIFFICULTY_STYLES[task.degreeOfDifficulty],
            borderColor: snapshot.isDragging
              ? "var(--card-drag-border)"
              : "var(--card-border)",
            boxShadow: snapshot.isDragging
              ? `${DIFFICULTY_STYLES[task.degreeOfDifficulty].boxShadow}, 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`
              : DIFFICULTY_STYLES[task.degreeOfDifficulty].boxShadow,
            ...provided.draggableProps.style,
          }}
          onMouseEnter={(e) => {
            onSelect();
            if (!snapshot.isDragging) {
              e.currentTarget.style.borderColor = "var(--primary)";
              e.currentTarget.style.boxShadow = `0 10px 15px -3px rgb(0 0 0 / 0.05), 0 4px 6px -4px rgb(0 0 0 / 0.05), inset 0 0 0 1px var(--primary)`;
            }
          }}
          onMouseLeave={(e) => {
            if (!snapshot.isDragging) {
              e.currentTarget.style.borderColor = "var(--card-border)";
              e.currentTarget.style.boxShadow = DIFFICULTY_STYLES[task.degreeOfDifficulty].boxShadow || "none";
            }
          }}
        >
          {/* Subtle gradient background overlay for hover */}
          <div className="absolute inset-0 bg-gradient-to-br from-foreground/0 to-foreground/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none" />
          
          <div className="relative z-10 block">
          {/* Status dot + title row */}
          <div className="flex items-start gap-2.5">
            <div
              className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ring-2 ring-background shadow-sm"
              style={{ backgroundColor: STATUS_COLORS[task.status] }}
              title={task.status.replace(/_/g, " ")}
            />
            <h4
              className={clsx(
                "flex-1 font-semibold tracking-tight leading-snug text-foreground",
                isCompact ? "text-[13px]" : "text-[15px]"
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
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {/* Status tag — show when NOT grouped by status */}
              {groupBy !== "status" && (
                <span
                  className="rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase shadow-sm border"
                  style={{
                    backgroundColor: `${STATUS_COLORS[task.status]}15`,
                    color: STATUS_COLORS[task.status],
                    borderColor: `${STATUS_COLORS[task.status]}30`
                  }}
                >
                  {COLUMN_LABELS[task.status as TStatus] || task.status}
                </span>
              )}
              {/* Project tag — show when NOT grouped by project */}
              {groupBy !== "project" && task.project && (
                <span className="rounded-md bg-secondary/60 border border-border/50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-secondary-foreground shadow-sm">
                  {task.project.name}
                </span>
              )}
              {/* Department tag — show when NOT grouped by department */}
              {groupBy !== "department" && departmentName && (
                <span
                  className="rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase shadow-sm border"
                  style={{
                    backgroundColor: departmentColor ? `${departmentColor}15` : undefined,
                    color: departmentColor || undefined,
                    borderColor: departmentColor ? `${departmentColor}30` : undefined,
                  }}
                >
                  {departmentName}
                </span>
              )}
              <span
                className="rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wider shadow-sm border border-border/40"
                style={DIFFICULTY_TAG_STYLES[task.degreeOfDifficulty]}
                title={`Difficulty: ${DIFFICULTY_LABELS[task.degreeOfDifficulty]}`}
              >
                <Gauge className="mr-1 inline h-3 w-3 -mt-0.5" />
                {DIFFICULTY_LABELS[task.degreeOfDifficulty]}
              </span>
              {task.unplanned && (
                <span title="Unplanned" className="flex items-center rounded-full bg-primary/10 p-1 text-primary">
                  <AlertTriangle className="h-3 w-3" />
                </span>
              )}
              {task.slackThread && (
                <span title="Has Slack thread" className="flex items-center rounded-full bg-muted p-1 text-muted-foreground">
                  <MessageSquare className="h-3 w-3" />
                </span>
              )}
              {task.dependsOn && task.dependsOn.length > 0 && (
                <span
                  title={`Depends on ${task.dependsOn.length} task(s)`}
                  className="flex items-center rounded-full bg-muted p-1 text-muted-foreground"
                >
                  <Link2 className="h-3 w-3" />
                </span>
              )}
            </div>
          )}

          {/* Bottom row: avatars + action buttons */}
          <div className={clsx("flex items-center justify-between", revealMetadata ? "mt-4" : "mt-2.5")}>
            {/* Assignee avatars */}
            <div className="flex items-center gap-1.5">
              {task.responsible && task.responsible.length > 0 && (
                <div className="flex -space-x-1.5 hover:space-x-0.5 transition-all duration-300">
                  {task.responsible.slice(0, isCompact ? 2 : 3).map((user) => (
                    <div
                      key={user.id}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-card bg-secondary text-[10px] font-bold text-secondary-foreground shadow-sm ring-1 ring-border/20 transition-transform hover:scale-110 hover:z-10"
                      title={user.name || user.email}
                    >
                      {(user.name || user.email)[0].toUpperCase()}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons — visible on hover */}
            <div className="flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              {/* Retreat button */}
              {canRetreat && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetreat?.();
                  }}
                  className="rounded-full bg-secondary/80 p-1.5 text-secondary-foreground shadow-sm hover:bg-secondary hover:text-foreground hover:scale-110 transition-all"
                  title="Move back"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
              )}
              {/* Advance button */}
              {canAdvance && task.status !== "BACKLOG" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdvance();
                  }}
                  className="rounded-full bg-primary/10 p-1.5 text-primary shadow-sm hover:bg-primary/20 hover:scale-110 transition-all"
                  title="Advance status"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
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
              "mt-3 flex items-center justify-between gap-1 border-t border-border/40 pt-2",
              isCompact && "gap-0.5"
            )}
          >
            <div className="flex items-center gap-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClick();
                }}
                className="rounded-md px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground flex items-center gap-1.5"
                title="Edit task"
              >
                <Pencil className="h-3 w-3" />
                <span className="sr-only sm:not-sr-only sm:inline">Edit</span>
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
        </div>
      )}
    </Draggable>
  );
}
