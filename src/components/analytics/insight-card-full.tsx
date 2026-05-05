"use client";

import Link from "next/link";
import type { AiInsight } from "@/lib/analytics/types";
import { AlertCircle, AlertTriangle, ExternalLink, Info, Sparkles } from "lucide-react";
import { InsightCardActions } from "./insight-card-actions";
import { MiniTrend } from "./evidence-mini-chart";

const SEVERITY_CONFIG = {
  critical: {
    border: "border-red-500/20",
    bg: "bg-red-500/5",
    icon: AlertTriangle,
    color: "text-red-500",
    badge: "bg-red-500/10 text-red-500",
  },
  warning: {
    border: "border-yellow-500/20",
    bg: "bg-yellow-500/5",
    icon: AlertCircle,
    color: "text-yellow-500",
    badge: "bg-yellow-500/10 text-yellow-500",
  },
  info: {
    border: "border-blue-500/20",
    bg: "bg-blue-500/5",
    icon: Info,
    color: "text-blue-500",
    badge: "bg-blue-500/10 text-blue-500",
  },
} as const;

function formatSectionLabel(section: AiInsight["section"]): string {
  switch (section) {
    case "website-traffic":
      return "Website Traffic";
    case "social-media":
      return "Social Media";
    case "sales-pipeline":
      return "Sales Pipeline";
    case "customer-success":
      return "Customer Success";
    case "customer-journey":
      return "Customer Journey";
    case "demo-analytics":
      return "Demo Analytics";
    case "process-analytics":
      return "Process Analytics";
    default:
      return section.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

interface InsightCardFullProps {
  insight: AiInsight;
  urgencyScore?: number | null;
  destinationHref?: string | null;
  destinationLabel?: string | null;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onDismiss?: () => void;
}

export function InsightCardFull({
  insight,
  urgencyScore = null,
  destinationHref = null,
  destinationLabel = null,
  isPinned = false,
  onTogglePin,
  onDismiss,
}: InsightCardFullProps) {
  const config = SEVERITY_CONFIG[insight.severity];
  const Icon = config.icon;
  const showActions = onTogglePin != null && onDismiss != null;

  return (
    <article
      className={`overflow-hidden rounded-3xl border bg-card shadow-sm transition-colors ${config.border} ${config.bg} ${
        isPinned ? "ring-1 ring-amber-400/50" : ""
      }`}
    >
      <div className="space-y-5 p-5 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`rounded-2xl border border-border bg-background/80 p-2 ${config.color}`}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>

            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${config.badge}`}>
                  {insight.severity}
                </span>
                <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  {formatSectionLabel(insight.section)}
                </span>
                {insight.crossDomain ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-700 dark:text-violet-300">
                    <Sparkles className="h-3 w-3" />
                    cross-domain
                  </span>
                ) : null}
                {isPinned ? (
                  <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    pinned
                  </span>
                ) : null}
                {insight.stale ? (
                  <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-300">
                    stale data
                  </span>
                ) : null}
                {urgencyScore !== null ? (
                  <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground">
                    urgency {urgencyScore}
                  </span>
                ) : null}
              </div>

              <div>
                <h3 className="text-base font-semibold text-foreground md:text-lg">{insight.title}</h3>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">{insight.why}</p>
              </div>
            </div>
          </div>

          {showActions ? (
            <div className="shrink-0">
              <InsightCardActions
                insightId={insight.id}
                isPinned={isPinned}
                onTogglePin={onTogglePin!}
                onDismiss={onDismiss!}
              />
            </div>
          ) : null}
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-5">
            {urgencyScore !== null ? (
              <section className="rounded-2xl border border-border bg-background/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Urgency
                  </h4>
                  <span className="text-sm font-semibold tabular-nums text-foreground">{urgencyScore}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-foreground transition-all"
                    style={{ width: `${Math.min((urgencyScore / 180) * 100, 100)}%` }}
                  />
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Composite of severity, confidence, evidence depth, actionability, and cross-domain leverage.
                </p>
              </section>
            ) : null}

            {insight.evidence.length > 0 ? (
              <section className="rounded-2xl border border-border bg-background/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Evidence
                  </h4>
                  <p className="text-xs text-muted-foreground">{insight.evidence.length} supporting signals</p>
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-xs text-muted-foreground">
                        <th className="pb-2 text-left font-medium">Source</th>
                        <th className="pb-2 text-left font-medium">Metric</th>
                        <th className="pb-2 text-right font-medium">Trend</th>
                        <th className="pb-2 text-right font-medium">Value</th>
                        <th className="pb-2 text-right font-medium">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {insight.evidence.map((evidence, index) => (
                        <tr key={`${evidence.source}-${evidence.metric}-${index}`} className="border-b border-border/30 last:border-0">
                          <td className="py-2 text-foreground">{evidence.source}</td>
                          <td className="py-2 text-muted-foreground">{evidence.metric}</td>
                          <td className="py-2 text-right text-muted-foreground">
                            {evidence.trendValues && evidence.trendValues.length > 1 ? (
                              <span className="inline-flex justify-end text-foreground">
                                <MiniTrend values={evidence.trendValues} />
                              </span>
                            ) : (
                              <span className="text-xs">—</span>
                            )}
                          </td>
                          <td className="py-2 text-right font-medium tabular-nums text-foreground">{evidence.value}</td>
                          <td className="py-2 text-right text-xs tabular-nums text-muted-foreground">{evidence.delta}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {insight.actions.length > 0 ? (
              <section className="rounded-2xl border border-border bg-background/60 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Recommended moves
                </h4>
                <div className="mt-3 flex flex-wrap gap-2">
                  {insight.actions.map((action, index) => (
                    <button
                      key={`${action.label}-${index}`}
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                    >
                      {action.label}
                      <ExternalLink className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-border bg-background/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Confidence
                </h4>
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {(insight.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${insight.confidence * 100}%` }}
                />
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Ranked by model confidence and surfaced with supporting evidence for operator review.
              </p>
            </section>

            <section className="rounded-2xl border border-border bg-background/60 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Expected impact
              </h4>
              <p className="mt-3 text-sm leading-6 text-foreground">{insight.expectedImpact}</p>
            </section>

            <section className="rounded-2xl border border-border bg-background/60 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Action readiness
              </h4>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Attached actions</span>
                  <span className="font-semibold tabular-nums text-foreground">{insight.actions.length}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Evidence rows</span>
                  <span className="font-semibold tabular-nums text-foreground">{insight.evidence.length}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Cross-functional</span>
                  <span className="font-semibold text-foreground">{insight.crossDomain ? "Yes" : "No"}</span>
                </div>
              </div>
            </section>

            {destinationHref ? (
              <section className="rounded-2xl border border-border bg-background/60 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Drill down
                </h4>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Open the underlying analytics surface to inspect the source metrics behind this insight.
                </p>
                <Link
                  href={destinationHref}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  Open {destinationLabel ?? "analytics section"}
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </Link>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </article>
  );
}
