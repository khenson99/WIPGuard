"use client";

interface DashboardStaleBannerProps {
  lastUpdatedAt?: string | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  label?: string;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleString();
}

export function DashboardStaleBanner({
  lastUpdatedAt,
  onRefresh,
  refreshing = false,
  label = "Showing cached data while latest refresh failed.",
}: DashboardStaleBannerProps) {
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
      <p className="font-medium">{label}</p>
      <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-200/80">
        Last updated: {formatTimestamp(lastUpdatedAt)}
      </p>
      {onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="mt-3 rounded-md border border-amber-600/30 px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-70"
        >
          {refreshing ? "Refreshing..." : "Refresh now"}
        </button>
      ) : null}
    </div>
  );
}
