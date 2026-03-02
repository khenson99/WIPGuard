"use client";

import { useMemo, useState, useId } from "react";
import {
  ArrowDown,
  Eye,
  Target,
  Calendar,
  MessageSquare,
  FileText,
  Link as LinkIcon,
  CheckCircle2,
  TrendingUp,
  XCircle
} from "lucide-react";
import { FunnelTooltip } from "./funnel-tooltip";

export interface FunnelStageData {
  id: string;
  label: string;
  count: number;
  value: number;
  avgDays?: number;
}

interface VisualFunnelProps {
  stages: FunnelStageData[];
  onStageClick?: (stage: FunnelStageData) => void;
}

// Fixed order of stages for the straight path
const MAIN_PATH = [
  "Prospect",
  "Lead",
  "Demo Scheduled",
  "Demo Follow-Up",
  "Budgetary Quote Sent",
  "Payment Link Sent",
  "Subscription",
];

// Helper to get stage aesthetics
function getStageStyle(label: string, pct: number) {
  switch (label) {
    case "Prospect":
      return { icon: Eye, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20", gradient: "to-blue-500/5" };
    case "Lead":
      return { icon: Target, color: "text-indigo-500", bg: "bg-indigo-500/10", border: "border-indigo-500/20", gradient: "to-indigo-500/5" };
    case "Demo Scheduled":
      return { icon: Calendar, color: "text-violet-500", bg: "bg-violet-500/10", border: "border-violet-500/20", gradient: "to-violet-500/5" };
    case "Demo Follow-Up":
      return { icon: MessageSquare, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/20", gradient: "to-purple-500/5" };
    case "Budgetary Quote Sent":
      return { icon: FileText, color: "text-fuchsia-500", bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/20", gradient: "to-fuchsia-500/5" };
    case "Payment Link Sent":
      return { icon: LinkIcon, color: "text-pink-500", bg: "bg-pink-500/10", border: "border-pink-500/20", gradient: "to-pink-500/5" };
    case "Subscription":
      return { icon: CheckCircle2, color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20", gradient: "to-rose-500/5" };
    default:
      return { icon: Target, color: "text-primary", bg: "bg-primary/10", border: "border-primary/20", gradient: "to-primary/5" };
  }
}

function formatTimeInStage(avgDays: number): string {
  if (avgDays < 1 / 24) {
    const minutes = Math.round(avgDays * 24 * 60);
    return `Avg: ${minutes} min in stage`;
  }
  if (avgDays < 1) {
    const hours = Math.round(avgDays * 24);
    return `Avg: ${hours} hour${hours !== 1 ? "s" : ""} in stage`;
  }
  const days = parseFloat(avgDays.toFixed(1));
  return `Avg: ${days} day${days === 1 ? "" : "s"} in stage`;
}

export function VisualFunnel({ stages, onStageClick }: VisualFunnelProps) {
  const [hoveredBadgeIndex, setHoveredBadgeIndex] = useState<number | null>(null);
  const [focusedBadgeIndex, setFocusedBadgeIndex] = useState<number | null>(null);
  const tooltipIdPrefix = useId();

  const stageMap = useMemo(() => {
    const map = new Map<string, FunnelStageData>();
    stages.forEach((s) => map.set(s.label, s));
    return map;
  }, [stages]);

  const maxCount = useMemo(() => {
    let m = 1;
    stages.forEach((s) => {
      if (MAIN_PATH.includes(s.label) && s.count > m) m = s.count;
    });
    return m;
  }, [stages]);

  const mainStages = MAIN_PATH.map((label) => stageMap.get(label)).filter(Boolean) as FunnelStageData[];
  const closedWon = stageMap.get("Closed Won");
  const closedLost = stageMap.get("Closed Lost");

  if (mainStages.length === 0) {
    return <div className="p-8 text-center text-sm text-muted-foreground">No pipeline stages available</div>;
  }

  return (
    <div className="flex w-full flex-col items-center py-8">
      {/* Container for the connected line and nodes */}
      <div className="relative flex w-full max-w-2xl flex-col items-center">

        {mainStages.map((stage, idx) => {
          const pct = Math.max((stage.count / maxCount) * 100, 15);
          const prevCount = idx > 0 ? mainStages[idx - 1].count : null;
          const conversion = prevCount ? Math.round((stage.count / prevCount) * 100) : null;
          // avgDays lives on the *previous* stage (time to get from prev → current)
          const prevStage = idx > 0 ? mainStages[idx - 1] : null;
          const badgeAvgDays = prevStage?.avgDays;
          const tooltipId = `${tooltipIdPrefix}-tooltip-${idx}`;
          const isTooltipVisible =
            (hoveredBadgeIndex === idx || focusedBadgeIndex === idx) &&
            badgeAvgDays != null;

          const { icon: StageIcon, color, bg, border, gradient } = getStageStyle(stage.label, pct);

          return (
            <div
              key={stage.id}
              className="relative flex w-full flex-col items-center group/stage motion-safe:animate-funnel-enter"
              style={{ animationDelay: `${idx * 80}ms` }}
            >
              {/* Vertical connector line from previous stage */}
              {idx > 0 && (
                <div className="relative flex h-12 w-full items-center justify-center">
                  <div className="absolute top-0 bottom-0 w-px bg-gradient-to-b from-border/80 to-border/30" />

                  {/* Conversion Badge */}
                  {conversion !== null && (
                    <div className="relative flex justify-center">
                      <button
                        type="button"
                        className="relative z-10 rounded-full border border-border/50 bg-background/95 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm transition-colors group-hover/stage:border-border group-hover/stage:text-foreground hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-default motion-safe:animate-funnel-badge-enter"
                        style={{ animationDelay: `${idx * 80 + 40}ms` }}
                        aria-label={`${conversion}% conversion${badgeAvgDays != null ? `. ${formatTimeInStage(badgeAvgDays)}` : ""}`}
                        aria-describedby={badgeAvgDays != null ? tooltipId : undefined}
                        onMouseEnter={() => setHoveredBadgeIndex(idx)}
                        onMouseLeave={() => setHoveredBadgeIndex(null)}
                        onFocus={() => setFocusedBadgeIndex(idx)}
                        onBlur={() => setFocusedBadgeIndex(null)}
                      >
                        {conversion}% conversion
                      </button>

                      {badgeAvgDays != null && (
                        <FunnelTooltip
                          id={tooltipId}
                          content={formatTimeInStage(badgeAvgDays)}
                          visible={isTooltipVisible}
                          className="absolute -top-9 left-1/2 -translate-x-1/2"
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Stage Card */}
              <div
                className={`relative flex w-full cursor-pointer items-center overflow-hidden rounded-xl border bg-card p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${border}`}
                onClick={() => onStageClick?.(stage)}
              >
                {/* Background glow and percentage fill */}
                <div className="absolute inset-x-0 bottom-0 top-0 opacity-0 transition-opacity duration-300 group-hover/stage:opacity-100">
                  <div className={`absolute inset-0 bg-gradient-to-r from-transparent via-transparent ${gradient}`} />
                </div>

                {/* Subtle percentage indicator on the left edge */}
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1 ${bg} opacity-50`}
                  style={{ height: `${pct}%`, top: 'auto', bottom: 0 }}
                />

                {/* Content */}
                <div className="relative z-10 flex w-full items-center gap-4">
                  {/* Icon Circle */}
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${bg} ${color} border border-white/5 shadow-inner`}>
                    <StageIcon className="h-5 w-5" />
                  </div>

                  {/* Labels */}
                  <div className="flex flex-1 flex-col">
                    <h4 className="text-base font-semibold tracking-tight text-foreground">{stage.label}</h4>
                    <div className="mt-1 flex items-center gap-3">

                      {/* Completion bar mini */}
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary/50">
                        <div
                          className={`h-full rounded-full bg-current ${color}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                        {Math.round(pct)}% of max
                      </span>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="flex shrink-0 flex-col items-end pl-4 border-l border-border/40">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{stage.count}</span>
                      <span className="text-xs font-medium text-muted-foreground">qty</span>
                    </div>
                    <div className="text-sm font-medium tabular-nums text-muted-foreground">
                      ${(stage.value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Split path for Won / Lost */}
        {(closedWon || closedLost) && (
          <div className="relative mt-2 flex w-full max-w-2xl">
            {/* Split connector lines */}
            <div className="absolute -top-2 left-1/4 right-1/4 h-8 border-t border-l border-r border-border/50 rounded-t-xl" />
            <div className="absolute top-6 left-1/4 h-6 w-px bg-border/50" />
            <div className="absolute top-6 right-1/4 h-6 w-px bg-border/50" />

            {/* Closed Won Branch */}
            <div className="flex w-1/2 flex-col items-center px-3 pt-12">
              <div className="group flex w-full flex-col items-center justify-center rounded-xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/5 to-transparent p-5 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-md">
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div className="mb-1 text-sm font-semibold tracking-wide text-emerald-600 dark:text-emerald-400 uppercase">Closed Won</div>
                <div className="text-3xl font-bold tabular-nums tracking-tight text-foreground">{closedWon?.count || 0}</div>
                <div className="mt-1 text-sm font-medium text-muted-foreground tabular-nums">
                  ${(closedWon?.value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>

            {/* Closed Lost Branch */}
            <div className="flex w-1/2 flex-col items-center px-3 pt-12">
              <div className="group flex w-full flex-col items-center justify-center rounded-xl border border-red-500/20 bg-gradient-to-b from-red-500/5 to-transparent p-5 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-red-500/40 hover:shadow-md">
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                  <XCircle className="h-5 w-5" />
                </div>
                <div className="mb-1 text-sm font-semibold tracking-wide text-red-600 dark:text-red-400 uppercase">Closed Lost</div>
                <div className="text-3xl font-bold tabular-nums tracking-tight text-foreground">{closedLost?.count || 0}</div>
                <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-muted-foreground tabular-nums">
                  <span>${(closedLost?.value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground/70 uppercase tracking-wider">(Inc. Unlikely)</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
