"use client";

import { clsx } from "clsx";
import {
  CONFERENCE_STATUS_LABELS,
  CONFERENCE_TYPE_LABELS,
  type ConferenceListItem,
} from "@/types";

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatRange(start: string, end: string): string {
  return `${formatDate(start)} → ${formatDate(end)}`;
}

function statusBadgeClass(status: ConferenceListItem["status"]): string {
  switch (status) {
    case "COMPLETE":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "CANCELED":
      return "bg-slate-500/10 text-slate-700 dark:text-slate-300";
    case "ONSITE":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-300";
    case "COMMITTED":
      return "bg-violet-500/10 text-violet-700 dark:text-violet-300";
    case "WRAP_UP":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "DRAFT":
      return "bg-slate-500/10 text-slate-700 dark:text-slate-300";
    case "PLANNING":
    default:
      return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
}

export function ConferenceCard({
  conference,
  onClick,
}: {
  conference: ConferenceListItem;
  onClick: () => void;
}) {
  const location = [conference.city, conference.region, conference.country]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "group w-full rounded-xl border border-border bg-card p-4 text-left shadow-sm transition",
        "hover:border-border/80 hover:bg-secondary/20"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {conference.name}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatRange(conference.startDate, conference.endDate)}
          </p>
          {location ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {location}
            </p>
          ) : null}
        </div>

        <span
          className={clsx(
            "shrink-0 rounded-full px-2 py-1 text-[11px] font-medium",
            statusBadgeClass(conference.status)
          )}
        >
          {CONFERENCE_STATUS_LABELS[conference.status]}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-secondary/40 px-2 py-1 text-[11px] text-muted-foreground">
          {CONFERENCE_TYPE_LABELS[conference.type]}
        </span>
        <span className="rounded-full bg-secondary/40 px-2 py-1 text-[11px] text-muted-foreground">
          Deadlines: {conference._count.deadlines}
        </span>
        <span className="rounded-full bg-secondary/40 px-2 py-1 text-[11px] text-muted-foreground">
          Leads: {conference._count.leads}
        </span>
        <span className="rounded-full bg-secondary/40 px-2 py-1 text-[11px] text-muted-foreground">
          Tasks: {conference._count.tasks}
        </span>
      </div>
    </button>
  );
}

