"use client";

import { useEffect, useMemo, useState } from "react";
import type { AiInsight, AiInsightsBundle, AnalyticsSectionId } from "@/lib/analytics/types";
import { MiniTrend } from "./evidence-mini-chart";

type InsightFilter = "all" | AnalyticsSectionId;

const FILTERS: Array<{ id: InsightFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "ads-traffic", label: "Ads" },
  { id: "finance", label: "Finance" },
  { id: "sales-pipeline", label: "Sales" },
  { id: "customer-success", label: "CS" },
];

const SEVERITY_RANK: Record<AiInsight["severity"], number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

interface AiInsightsPanelProps {
  bundle: AiInsightsBundle | null;
  defaultFilter?: InsightFilter;
  /** Compact mode for subsection views: shows max 3 insights with title+severity only, expandable. */
  compact?: boolean;
}

function severityClass(severity: AiInsight["severity"]): string {
  if (severity === "critical") return "text-red-500";
  if (severity === "warning") return "text-amber-500";
  return "text-blue-500";
}

function severityDot(severity: AiInsight["severity"]): string {
  if (severity === "critical") return "bg-red-500";
  if (severity === "warning") return "bg-amber-500";
  return "bg-blue-500";
}

function InsightCard({ insight }: { insight: AiInsight }) {
  return (
    <article className="rounded-lg border border-border/70 bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{insight.title}</p>
        <div className="flex items-center gap-2 text-[11px]">
          <span className={severityClass(insight.severity)}>{insight.severity.toUpperCase()}</span>
          <span className="text-muted-foreground">Conf. {(insight.confidence * 100).toFixed(0)}%</span>
          {insight.crossDomain && (
            <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-purple-500">cross-domain</span>
          )}
          {insight.subsectionId && (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-muted-foreground">{insight.subsectionId}</span>
          )}
          {insight.stale && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-600">stale data</span>}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{insight.why}</p>
      <p className="mt-1 text-xs text-foreground">{insight.expectedImpact}</p>

      {insight.evidence.length > 0 && (
        <div className="mt-2 space-y-1">
          {insight.evidence.slice(0, 3).map((evidence) => (
            <div key={`${insight.id}-${evidence.metric}`} className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>
                {evidence.source}: {evidence.metric} {evidence.value} ({evidence.delta})
              </span>
              {evidence.trendValues && evidence.trendValues.length >= 2 && (
                <MiniTrend
                  values={evidence.trendValues}
                  color={
                    insight.severity === "critical"
                      ? "var(--color-red-500, #ef4444)"
                      : insight.severity === "warning"
                        ? "var(--color-amber-500, #f59e0b)"
                        : "var(--color-blue-500, #3b82f6)"
                  }
                />
              )}
            </div>
          ))}
        </div>
      )}

      {insight.actions.length > 0 && (
        <div className="mt-2 border-t border-border/50 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Actions</p>
          <div className="mt-1 space-y-1">
            {insight.actions.slice(0, 2).map((action) => (
              <p key={`${insight.id}-${action.label}`} className="text-xs text-foreground">
                {action.label}
              </p>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function CompactInsightRow({ insight }: { insight: AiInsight }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/50 bg-background px-3 py-2">
      <span className={`h-2 w-2 shrink-0 rounded-full ${severityDot(insight.severity)}`} />
      <p className="flex-1 truncate text-xs font-medium text-foreground">{insight.title}</p>
      <span className={`shrink-0 text-[11px] ${severityClass(insight.severity)}`}>
        {insight.severity.toUpperCase()}
      </span>
      {insight.crossDomain && (
        <span className="shrink-0 rounded bg-purple-500/15 px-1.5 py-0.5 text-[10px] text-purple-500">cross</span>
      )}
    </div>
  );
}

export function AiInsightsPanel({ bundle, defaultFilter = "all", compact = false }: AiInsightsPanelProps) {
  const [filter, setFilter] = useState<InsightFilter>(defaultFilter);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setFilter(defaultFilter);
  }, [defaultFilter]);

  useEffect(() => {
    setFilter(defaultFilter);
  }, [defaultFilter]);

  const visible = useMemo(() => {
    if (!bundle) return [];
    const items = filter === "all" ? bundle.global : bundle.bySection[filter];
    return [...items].sort((a, b) => {
      if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
        return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      }
      return b.confidence - a.confidence;
    });
  }, [bundle, filter]);

  if (compact) {
    const compactVisible = expanded ? visible : visible.slice(0, 3);
    const hasMore = visible.length > 3;

    return (
      <section className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-foreground">AI Insights</h3>
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="text-[11px] text-primary hover:underline"
            >
              {expanded ? "Show less" : `+${visible.length - 3} more`}
            </button>
          )}
        </div>
        {compactVisible.length === 0 ? (
          <p className="mt-2 text-[11px] text-muted-foreground">No insights for this view.</p>
        ) : (
          <div className="mt-2 space-y-1">
            {compactVisible.map((insight) =>
              expanded ? (
                <InsightCard key={insight.id} insight={insight} />
              ) : (
                <CompactInsightRow key={insight.id} insight={insight} />
              ),
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">AI Insights</h2>
          <p className="text-xs text-muted-foreground">
            Explainable cross-domain recommendations ranked by severity and confidence.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={`rounded-md px-2 py-1 text-xs ${
                filter === item.id ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {!bundle || visible.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">No AI insights available for the selected filter.</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
          {visible.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}
    </section>
  );
}
