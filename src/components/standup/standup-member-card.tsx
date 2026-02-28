"use client";

import { clsx } from "clsx";
import {
  CheckCircle2,
  Circle,
  AlertCircle,
  PauseCircle,
  SkipForward,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";
import type {
  OwnerGroup,
  StandupAction,
  TaskSummary,
} from "@/lib/standup-engine";

interface StandupMemberCardProps {
  group: OwnerGroup;
  /** Currently active member for facilitator highlight */
  isActive?: boolean;
  /** Facilitator mode for screen-share */
  facilitatorMode?: boolean;
  onActionChange?: (memberId: string, action: StandupAction) => void;
}

const STATUS_ICON: Record<TaskSummary["status"], typeof Circle> = {
  todo: Circle,
  in_progress: AlertCircle,
  blocked: AlertCircle,
  done: CheckCircle2,
  deferred: PauseCircle,
};

const STATUS_COLOR: Record<TaskSummary["status"], string> = {
  todo: "text-muted-foreground",
  in_progress: "text-blue-500",
  blocked: "text-red-500",
  done: "text-emerald-500",
  deferred: "text-muted-foreground",
};

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-amber-500",
  medium: "bg-blue-400",
  low: "bg-muted-foreground",
};

export function StandupMemberCard({
  group,
  isActive = false,
  facilitatorMode = false,
  onActionChange,
}: StandupMemberCardProps) {
  const [expanded, setExpanded] = useState(true);

  const actionLabel =
    group.action === "completed"
      ? "Done"
      : group.action === "skipped"
        ? "Skipped"
        : "In progress";

  return (
    <article
      className={clsx(
        "rounded-lg border bg-card transition-shadow",
        isActive
          ? "border-primary shadow-md ring-2 ring-primary/20"
          : "border-border",
        facilitatorMode && "text-base",
      )}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        {/* Avatar placeholder */}
        <div
          className={clsx(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-semibold text-white",
            group.blockedCount > 0 ? "bg-red-500" : "bg-primary",
          )}
          aria-hidden="true"
        >
          {group.member.name.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <span className="font-semibold text-foreground">
            {group.member.name}
          </span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{group.inProgressCount} active</span>
            {group.blockedCount > 0 && (
              <span className="text-red-500 font-medium">
                {group.blockedCount} blocked
              </span>
            )}
          </div>
        </div>

        {/* Action selector */}
        <div className="flex items-center gap-2">
          {onActionChange && group.action === "started" && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onActionChange(group.member.id, "completed");
                }}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                aria-label={`Mark ${group.member.name} as done`}
              >
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Done
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onActionChange(group.member.id, "skipped");
                }}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Skip ${group.member.name}`}
              >
                <SkipForward className="h-3 w-3" aria-hidden="true" />
                Skip
              </button>
            </>
          )}

          {group.action !== "started" && (
            <span
              className={clsx(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                group.action === "completed"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {actionLabel}
            </span>
          )}

          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
      </div>

      {/* Task list */}
      {expanded && group.tasks.length > 0 && (
        <ul className="border-t border-border divide-y divide-border">
          {group.tasks.map((t) => {
            const Icon = STATUS_ICON[t.status];
            return (
              <li key={t.id} className="flex items-center gap-2.5 px-4 py-2">
                <Icon
                  className={clsx("h-4 w-4 shrink-0", STATUS_COLOR[t.status])}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate text-sm text-foreground">
                  {t.title}
                </span>
                <span
                  className={clsx(
                    "h-2 w-2 shrink-0 rounded-full",
                    PRIORITY_DOT[t.priority] ?? "bg-muted-foreground",
                  )}
                  title={t.priority}
                  aria-label={`Priority: ${t.priority}`}
                />
                {t.status === "blocked" && t.blockedReason && (
                  <span className="max-w-[140px] truncate text-[11px] text-red-500">
                    {t.blockedReason}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
