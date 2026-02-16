"use client";

import Link from "next/link";

interface FinanceDataEmptyStateProps {
  title: string;
  message: string;
  reasons?: string[];
  reconnectHref?: string;
}

export function FinanceDataEmptyState({
  title,
  message,
  reasons = [],
  reconnectHref = "/settings?tab=integrations",
}: FinanceDataEmptyStateProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>

      {reasons.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {reasons.map((reason, index) => (
            <li key={`${reason}-${index}`}>{reason}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={reconnectHref}
          className="btn-primary-theme rounded-lg px-3 py-2 text-xs"
        >
          Reconnect Integration
        </Link>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-ghost-muted rounded-lg border border-border px-3 py-2 text-xs"
        >
          Refresh Dashboard
        </button>
        <Link
          href="/settings?tab=integrations"
          className="btn-ghost-muted rounded-lg border border-border px-3 py-2 text-xs"
        >
          Open Settings
        </Link>
      </div>
    </div>
  );
}
