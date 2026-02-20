"use client";

import { clsx } from "clsx";
import {
  Clock,
  Users,
  AlertCircle,
  ListChecks,
  Lightbulb,
  Share2,
} from "lucide-react";
import type { StandupMetrics } from "@/lib/standup-engine";

interface StandupSummaryProps {
  metrics: StandupMetrics | null;
  slackMessage?: string;
  facilitatorMode?: boolean;
  onCopyToClipboard?: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function StandupSummary({
  metrics,
  slackMessage,
  facilitatorMode = false,
  onCopyToClipboard,
}: StandupSummaryProps) {
  if (!metrics) return null;

  const stats = [
    {
      label: "Duration",
      value: formatDuration(metrics.totalDurationSeconds),
      icon: Clock,
      color: metrics.totalDurationSeconds < 900 ? "text-emerald-500" : "text-amber-500",
    },
    {
      label: "Members",
      value: String(metrics.memberCount),
      icon: Users,
      color: "text-blue-500",
    },
    {
      label: "Avg / member",
      value: formatDuration(metrics.avgSecondsPerMember),
      icon: Clock,
      color: "text-muted-foreground",
    },
    {
      label: "Blockers",
      value: String(metrics.blockerCount),
      icon: AlertCircle,
      color: metrics.blockerCount > 0 ? "text-red-500" : "text-emerald-500",
    },
    {
      label: "Tasks discussed",
      value: String(metrics.tasksDiscussed),
      icon: ListChecks,
      color: "text-muted-foreground",
    },
    {
      label: "Coaching prompts",
      value: String(metrics.coachingPromptsShown),
      icon: Lightbulb,
      color: "text-amber-500",
    },
  ];

  return (
    <section aria-label="Standup summary" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Standup Summary
        </h2>
        {slackMessage && onCopyToClipboard && (
          <button
            onClick={onCopyToClipboard}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
            Copy for Slack
          </button>
        )}
      </div>

      <div
        className={clsx(
          "grid gap-3",
          facilitatorMode
            ? "grid-cols-2 sm:grid-cols-3"
            : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
        )}
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5"
          >
            <stat.icon
              className={clsx("h-4 w-4 shrink-0", stat.color)}
              aria-hidden="true"
            />
            <div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-sm font-bold text-foreground">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
