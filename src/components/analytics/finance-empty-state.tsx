"use client";

import Link from "next/link";

interface FinanceDataEmptyStateProps {
  title?: string;
  message?: string;
  provider?: string;
  reasons?: string[];
  reconnectHref?: string;
  primaryActionLabel?: string;
  primaryActionHref?: string;
}

export function FinanceDataEmptyState({
  title,
  message,
  provider,
  reasons = [],
  reconnectHref = "/settings?tab=integrations",
  primaryActionLabel,
  primaryActionHref,
}: FinanceDataEmptyStateProps) {
  const resolvedTitle = title ?? `${provider ?? "Integration"} data is unavailable`;
  const resolvedMessage =
    message ?? `We could not load ${provider ?? "integration"} data for this range.`;
  const resolvedPrimaryLabel = primaryActionLabel ?? "Reconnect Integration";
  const resolvedPrimaryHref = primaryActionHref ?? reconnectHref;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="text-base font-semibold text-foreground">{resolvedTitle}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{resolvedMessage}</p>

      {reasons.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {reasons.map((reason, index) => (
            <li key={`${reason}-${index}`}>{reason}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={resolvedPrimaryHref}
          className="btn-primary-theme rounded-lg px-3 py-2 text-xs"
        >
          {resolvedPrimaryLabel}
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
