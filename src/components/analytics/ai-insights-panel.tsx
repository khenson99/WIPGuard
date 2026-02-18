"use client";

import { useEffect, useMemo, useState } from "react";
import type { AiInsight, AiInsightsBundle, AnalyticsSectionId } from "@/lib/analytics/types";

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
}

function severityClass(severity: AiInsight["severity"]): string {
  if (severity === "critical") return "text-red-500";
  if (severity === "warning") return "text-amber-500";
  return "text-blue-500";
}

export function AiInsightsPanel({ bundle, defaultFilter = "all" }: AiInsightsPanelProps) {
  const [filter, setFilter] = useState<InsightFilter>(defaultFilter);

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
            <article key={insight.id} className="rounded-lg border border-border/70 bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{insight.title}</p>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className={severityClass(insight.severity)}>{insight.severity.toUpperCase()}</span>
                  <span className="text-muted-foreground">Conf. {(insight.confidence * 100).toFixed(0)}%</span>
                  {insight.stale && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-600">stale data</span>}
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{insight.why}</p>
              <p className="mt-1 text-xs text-foreground">{insight.expectedImpact}</p>

              {insight.evidence.length > 0 && (
                <div className="mt-2 space-y-1">
                  {insight.evidence.slice(0, 3).map((evidence) => (
                    <p key={`${insight.id}-${evidence.metric}`} className="text-[11px] text-muted-foreground">
                      {evidence.source}: {evidence.metric} {evidence.value} ({evidence.delta})
                    </p>
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
          ))}
        </div>
      )}
    </section>
  );
}
