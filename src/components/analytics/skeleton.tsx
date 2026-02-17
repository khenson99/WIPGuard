// ─── Analytics Loading Skeleton Components ───────────────
// Shimmer placeholders that match real component dimensions.

import type { CSSProperties } from "react";

function Pulse({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} style={style} />;
}

/** Matches StatCard dimensions */
export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <Pulse className="h-3 w-24" />
        <Pulse className="h-7 w-7 rounded-lg" />
      </div>
      <Pulse className="mt-3 h-7 w-28" />
      <Pulse className="mt-2 h-3 w-36" />
    </div>
  );
}

/** Grid of StatCard skeletons — pass count to match your layout */
export function StatCardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Horizontal bar chart skeleton */
export function ChartSkeleton({ bars = 5 }: { bars?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <Pulse className="mb-4 h-4 w-40" />
      <div className="space-y-4">
        {Array.from({ length: bars }).map((_, i) => (
          <div key={i}>
            <div className="mb-1.5 flex items-center justify-between">
              <Pulse className="h-3 w-20" />
              <Pulse className="h-3 w-12" />
            </div>
            <Pulse className="h-2 w-full rounded-full" style={{ opacity: 1 - i * 0.12 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ring/donut chart skeleton */
export function RingSkeleton({ size = 120 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="animate-pulse rounded-full border-8 border-muted"
        style={{ width: size, height: size }}
      />
      <Pulse className="h-3 w-16" />
    </div>
  );
}

/** Table skeleton */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <Pulse className="mb-4 h-4 w-48" />
      <div className="space-y-3">
        {/* Header */}
        <div className="flex gap-4 border-b border-border pb-2">
          {Array.from({ length: cols }).map((_, i) => (
            <Pulse key={i} className="h-3 flex-1" />
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Pulse key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Full section loading state — mimics a typical analytics tab layout */
export function SectionSkeleton() {
  return (
    <div className="space-y-6">
      <StatCardGridSkeleton count={4} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartSkeleton bars={5} />
        <ChartSkeleton bars={4} />
      </div>
      <TableSkeleton rows={4} cols={5} />
    </div>
  );
}

/** Compact skeleton for snapshot/KPI cards used on the summary page */
export function SnapshotCardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4">
          <Pulse className="mb-2 h-3 w-20" />
          <Pulse className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}
