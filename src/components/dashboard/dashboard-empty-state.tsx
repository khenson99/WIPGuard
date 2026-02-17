"use client";

interface DashboardEmptyStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function DashboardEmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: DashboardEmptyStateProps) {
  return (
    <div className="rounded-xl border border-border bg-card px-6 py-8 text-center">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs text-foreground hover:bg-secondary/60"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
