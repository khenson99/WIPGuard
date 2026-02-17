"use client";

import Link from "next/link";

interface DashboardErrorBannerProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  settingsHref?: string;
}

export function DashboardErrorBanner({
  message,
  onRetry,
  retryLabel = "Retry",
  settingsHref,
}: DashboardErrorBannerProps) {
  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
      <p className="font-medium text-foreground">Data could not be refreshed.</p>
      <p className="mt-1 text-red-600 dark:text-red-400">{message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-500/15 dark:text-red-300"
          >
            {retryLabel}
          </button>
        ) : null}
        {settingsHref ? (
          <Link
            href={settingsHref}
            className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Open integration settings
          </Link>
        ) : null}
      </div>
    </div>
  );
}
