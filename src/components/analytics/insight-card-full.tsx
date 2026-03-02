"use client";

import type { AiInsight } from "@/lib/analytics/types";
import { AlertTriangle, AlertCircle, Info, ExternalLink } from "lucide-react";
import { InsightCardActions } from "./insight-card-actions";

const SEVERITY_CONFIG = {
  critical: { border: "border-red-500/20", bg: "bg-red-500/5", icon: AlertTriangle, color: "text-red-500", badge: "bg-red-500/10 text-red-500" },
  warning: { border: "border-yellow-500/20", bg: "bg-yellow-500/5", icon: AlertCircle, color: "text-yellow-500", badge: "bg-yellow-500/10 text-yellow-500" },
  info: { border: "border-blue-500/20", bg: "bg-blue-500/5", icon: Info, color: "text-blue-500", badge: "bg-blue-500/10 text-blue-500" },
} as const;

interface InsightCardFullProps {
  insight: AiInsight;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onDismiss?: () => void;
  onCreateTask?: () => void;
  isCreatingTask?: boolean;
}

export function InsightCardFull({
  insight,
  isPinned = false,
  onTogglePin,
  onDismiss,
  onCreateTask,
  isCreatingTask = false,
}: InsightCardFullProps) {
  const cfg = SEVERITY_CONFIG[insight.severity];
  const Icon = cfg.icon;

  const showActions = onTogglePin != null && onDismiss != null && onCreateTask != null;

  return (
    <div
      className={`rounded-xl border p-5 transition-colors ${cfg.border} ${cfg.bg} ${
        isPinned ? "ring-1 ring-amber-400/50" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${cfg.color}`} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{insight.title}</h3>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.badge}`}>
                {insight.severity}
              </span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {insight.section}
              </span>
              {isPinned && (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                  pinned
                </span>
              )}
              {insight.stale && (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                  stale data
                </span>
              )}
            </div>
            {showActions && (
              <div className="shrink-0">
                <InsightCardActions
                  insightId={insight.id}
                  isPinned={isPinned}
                  onTogglePin={onTogglePin!}
                  onDismiss={onDismiss!}
                  onCreateTask={onCreateTask!}
                  isCreatingTask={isCreatingTask}
                />
              </div>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{insight.why}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className="text-xs text-muted-foreground">Confidence</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${insight.confidence * 100}%` }} />
        </div>
        <span className="text-xs font-medium tabular-nums text-foreground">{(insight.confidence * 100).toFixed(0)}%</span>
      </div>

      {insight.evidence.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Evidence</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs text-muted-foreground">
                  <th className="pb-1.5 text-left font-medium">Source</th>
                  <th className="pb-1.5 text-left font-medium">Metric</th>
                  <th className="pb-1.5 text-right font-medium">Value</th>
                  <th className="pb-1.5 text-right font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {insight.evidence.map((ev, i) => (
                  <tr key={i} className="border-b border-border/30 last:border-0">
                    <td className="py-1.5 text-foreground">{ev.source}</td>
                    <td className="py-1.5 text-muted-foreground">{ev.metric}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums text-foreground">{ev.value}</td>
                    <td className="py-1.5 text-right text-xs tabular-nums text-muted-foreground">{ev.delta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {insight.expectedImpact && (
        <div className="mt-4 rounded-lg bg-secondary/40 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">Expected Impact: </span>
          <span className="text-xs text-foreground">{insight.expectedImpact}</span>
        </div>
      )}

      {insight.actions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {insight.actions.map((action, i) => (
            <button
              key={i}
              type="button"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
            >
              {action.label}
              <ExternalLink className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
