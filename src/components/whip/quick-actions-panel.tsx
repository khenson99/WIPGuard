"use client";

import { useCallback, useState } from "react";
import type { WhipTask } from "./types";

interface QuickActionsPanelProps {
  tasks: WhipTask[];
  updateTask: (taskId: string, patch: Record<string, unknown>) => Promise<boolean>;
}

type ActionType = "descope" | "defer";

const PRIORITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case "P0": return "bg-red-500/15 text-red-600 border-red-300/30";
    case "P1": return "bg-orange-500/15 text-orange-600 border-orange-300/30";
    case "P2": return "bg-blue-500/15 text-blue-600 border-blue-300/30";
    case "P3": return "bg-neutral-500/10 text-neutral-500 border-neutral-300/30";
    default: return "bg-neutral-500/10 text-neutral-500 border-neutral-300/30";
  }
}

function statusDotColor(status: string): string {
  switch (status) {
    case "BACKLOG": return "bg-neutral-400";
    case "QUEUED": return "bg-yellow-500";
    case "WORKING_ON_TODAY": return "bg-blue-500";
    case "ACTIVE": return "bg-emerald-500";
    case "NOT_DONE": return "bg-red-500";
    case "DONE": return "bg-emerald-400";
    default: return "bg-neutral-400";
  }
}

export function QuickActionsPanel({ tasks, updateTask }: QuickActionsPanelProps) {
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<Record<string, "success" | "error">>({});

  // Show unplanned tasks that are NOT done -- prime candidates for de-scope/defer
  const unplannedActive = tasks
    .filter((t) => t.unplanned && t.status !== "DONE")
    .sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 99;
      const pb = PRIORITY_ORDER[b.priority] ?? 99;
      return pb - pa; // lowest priority first (P3 first -- best descope candidates)
    });

  const handleAction = useCallback(
    async (taskId: string, action: ActionType) => {
      setActionInFlight(taskId);
      setActionResult((prev) => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });

      let patch: Record<string, unknown>;
      if (action === "descope") {
        // De-scope: remove from sprint, move to backlog
        patch = { sprintId: null, status: "BACKLOG" };
      } else {
        // Defer: move to backlog but keep in sprint
        patch = { status: "BACKLOG" };
      }

      const success = await updateTask(taskId, patch);
      setActionResult((prev) => ({ ...prev, [taskId]: success ? "success" : "error" }));
      setActionInFlight(null);
    },
    [updateTask]
  );

  if (unplannedActive.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">Quick Actions</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          No unplanned tasks to triage. Sprint scope is clean.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Triage Unplanned Tasks
        </h3>
        <span className="text-xs text-muted-foreground">
          {unplannedActive.length} task{unplannedActive.length !== 1 ? "s" : ""} to review
        </span>
      </div>

      <div className="max-h-72 space-y-1 overflow-y-auto">
        {unplannedActive.map((task) => {
          const isBusy = actionInFlight === task.id;
          const result = actionResult[task.id];

          return (
            <div
              key={task.id}
              className="flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-muted/50"
            >
              {/* Status dot */}
              <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotColor(task.status)}`} />

              {/* Priority */}
              <span
                className={`shrink-0 rounded border px-1 py-0.5 text-[10px] font-semibold ${priorityBadgeClass(task.priority)}`}
              >
                {task.priority}
              </span>

              {/* Title */}
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {task.title}
              </span>

              {/* Owner */}
              {task.responsible.length > 0 && (
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                  {task.responsible[0].name ?? task.responsible[0].email}
                </span>
              )}

              {/* Reason badge */}
              {task.unplannedReason && (
                <span className="hidden shrink-0 rounded bg-tag-bg px-1.5 py-0.5 text-[10px] text-tag-text lg:block">
                  {task.unplannedReason.replace(/_/g, " ").toLowerCase()}
                </span>
              )}

              {/* Action result */}
              {result === "success" && (
                <span className="text-xs font-medium text-success">Done</span>
              )}
              {result === "error" && (
                <span className="text-xs font-medium text-destructive">Failed</span>
              )}

              {/* Quick action buttons */}
              {!result && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleAction(task.id, "defer")}
                    className="rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                    title="Defer to backlog (keep in sprint)"
                  >
                    {isBusy ? "..." : "Defer"}
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleAction(task.id, "descope")}
                    className="rounded px-2 py-1 text-xs font-medium text-wip-over-text transition-colors hover:bg-wip-over-bg disabled:opacity-50"
                    title="De-scope from sprint entirely"
                  >
                    {isBusy ? "..." : "De-scope"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
