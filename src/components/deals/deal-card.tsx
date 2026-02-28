"use client";

import { clsx } from "clsx";
import { Clock } from "lucide-react";
import { fmt$ } from "@/components/analytics/dashboard-primitives";
import type { DealListItem } from "@/types";

const STALE_THRESHOLD_DAYS = 14;

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function DealCard({
  deal,
  onClick,
}: {
  deal: DealListItem;
  onClick: () => void;
}) {
  const lastActivity = deal.lastMeetingAt
    ? new Date(Math.max(new Date(deal.updatedAt).getTime(), new Date(deal.lastMeetingAt).getTime())).toISOString()
    : deal.updatedAt;
  const staleDays = daysSince(lastActivity);
  const isStale = staleDays !== null && staleDays >= STALE_THRESHOLD_DAYS;

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "w-full rounded-lg border border-border bg-card p-3 text-left shadow-sm transition",
        "hover:border-border/80 hover:bg-secondary/20",
        isStale && "border-amber-500/30"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="truncate text-sm font-medium text-foreground">{deal.name}</h4>
        {isStale && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            <Clock className="h-3 w-3" />
            {staleDays}d
          </span>
        )}
      </div>

      {deal.company && (
        <p className="mt-1 truncate text-xs text-muted-foreground">{deal.company.name}</p>
      )}

      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {fmt$(deal.amount)}
        </span>
        {deal.owner && (
          <span className="truncate text-xs text-muted-foreground">
            {deal.owner.name || deal.owner.email}
          </span>
        )}
      </div>
    </button>
  );
}
