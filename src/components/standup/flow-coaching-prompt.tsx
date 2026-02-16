"use client";

import { clsx } from "clsx";
import {
  AlertTriangle,
  Lightbulb,
  AlertOctagon,
  ArrowRightCircle,
} from "lucide-react";
import type { CoachingPrompt, SuggestedAction } from "@/lib/standup-engine";

interface FlowCoachingPromptProps {
  prompts: CoachingPrompt[];
  onAction?: (action: SuggestedAction) => void;
  /** Collapse to one-liner in facilitator mode */
  facilitatorMode?: boolean;
}

const SEVERITY_STYLES = {
  critical: {
    border: "border-red-400/50",
    bg: "bg-red-50 dark:bg-red-950/30",
    icon: AlertOctagon,
    iconColor: "text-red-500",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  },
  warning: {
    border: "border-amber-400/50",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    icon: AlertTriangle,
    iconColor: "text-amber-500",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  },
  info: {
    border: "border-blue-400/50",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    icon: Lightbulb,
    iconColor: "text-blue-500",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  },
} as const;

export function FlowCoachingPromptPanel({
  prompts,
  onAction,
  facilitatorMode = false,
}: FlowCoachingPromptProps) {
  if (prompts.length === 0) return null;

  return (
    <section aria-label="Flow coaching prompts" className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">
        Flow Coaching
      </h2>
      <ul className="space-y-2">
        {prompts.map((prompt, idx) => {
          const style = SEVERITY_STYLES[prompt.severity];
          const Icon = style.icon;

          return (
            <li
              key={`${prompt.type}-${prompt.targetTaskId ?? prompt.targetMemberId ?? idx}`}
              className={clsx(
                "rounded-lg border p-3",
                style.border,
                style.bg,
              )}
            >
              <div className="flex items-start gap-2">
                <Icon
                  className={clsx("mt-0.5 h-4 w-4 shrink-0", style.iconColor)}
                  aria-hidden="true"
                />
                <div className="flex-1 space-y-1.5">
                  <p className="text-sm font-medium text-foreground">
                    {prompt.message}
                  </p>

                  {!facilitatorMode && prompt.suggestedActions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {prompt.suggestedActions.map((action) => (
                        <button
                          key={`${action.kind}-${action.taskId}`}
                          onClick={() => onAction?.(action)}
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <ArrowRightCircle
                            className="h-3 w-3"
                            aria-hidden="true"
                          />
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <span
                  className={clsx(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                    style.badge,
                  )}
                >
                  {prompt.severity}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
