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
    <div className={`flex flex-col gap-6 ${className}`}>
      {/* Top summary cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={`stat-${i}`} className="h-28 animate-pulse rounded-xl bg-secondary/60" />
        ))}
      </div>
      
      {/* Main chart/content area skeleton */}
      <div className="h-96 w-full animate-pulse rounded-xl bg-secondary/60" />

      {/* Optional bottom row skeleton */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl bg-secondary/60" />
        <div className="h-64 animate-pulse rounded-xl bg-secondary/60" />
      </div>
    </div>
  );
}
