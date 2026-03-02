"use client";

import { Pin, X, ListPlus, Loader2 } from "lucide-react";

interface InsightCardActionsProps {
  insightId: string;
  isPinned: boolean;
  onTogglePin: () => void;
  onDismiss: () => void;
  onCreateTask: () => void;
  isCreatingTask: boolean;
}

export function InsightCardActions({
  isPinned,
  onTogglePin,
  onDismiss,
  onCreateTask,
  isCreatingTask,
}: InsightCardActionsProps) {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Insight actions">
      <button
        type="button"
        onClick={onTogglePin}
        className={`rounded-md p-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
          isPinned
            ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        }`}
        aria-label={isPinned ? "Unpin insight" : "Pin insight"}
        aria-pressed={isPinned}
        title={isPinned ? "Unpin" : "Pin to top"}
      >
        <Pin
          className={`h-3.5 w-3.5 ${isPinned ? "fill-current" : ""}`}
          aria-hidden="true"
        />
      </button>

      <button
        type="button"
        onClick={onCreateTask}
        disabled={isCreatingTask}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Create task from this insight"
        title="Create task"
      >
        {isCreatingTask ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <ListPlus className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>

      <button
        type="button"
        onClick={onDismiss}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:hover:bg-red-900/20"
        aria-label="Dismiss insight"
        title="Dismiss"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
