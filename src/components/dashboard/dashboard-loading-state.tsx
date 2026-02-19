"use client";

interface DashboardLoadingStateProps {
  message?: string;
  className?: string;
}

export function DashboardLoadingState({
  message = "Loading dashboard...",
  className = "h-[40vh]",
}: DashboardLoadingStateProps) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
        <span>{message}</span>
      </div>
    </div>
  );
}
