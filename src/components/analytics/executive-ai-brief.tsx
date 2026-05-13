"use client";

import { useEffect, useState } from "react";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  Lightbulb,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  SectionCard,
  AlertBanner,
} from "@/components/analytics/dashboard-primitives";
import type { ExecutiveAnalysis, TrendItem, RiskItem, RecommendationItem } from "@/lib/analytics/executive-ai-analysis";

/* ── Subcomponents ───────────────────────────────────── */

function TrendBadge({ direction }: { direction: TrendItem["direction"] }) {
  const config = {
    improving: { icon: TrendingUp, color: "text-emerald-500 bg-emerald-500/10", label: "Improving" },
    declining: { icon: TrendingDown, color: "text-red-500 bg-red-500/10", label: "Declining" },
    stable: { icon: Minus, color: "text-blue-500 bg-blue-500/10", label: "Stable" },
  }[direction];
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.color}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: RiskItem["severity"] }) {
  const config = {
    critical: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
    warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
    info: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  }[severity];

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${config}`}>
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: RecommendationItem["priority"] }) {
  const config = {
    P0: "bg-red-500/15 text-red-600 dark:text-red-400",
    P1: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    P2: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  }[priority];

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${config}`}>
      {priority}
    </span>
  );
}

/* ── Main Component ──────────────────────────────────── */

export function ExecutiveAiBrief() {
  const [data, setData] = useState<ExecutiveAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const fetchAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/financial-planning/ai-analysis");
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysis();
  }, []);

  if (loading) {
    return (
      <SectionCard title="AI Executive Brief" subtitle="Generating analysis...">
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Analyzing financial data...</span>
        </div>
      </SectionCard>
    );
  }

  if (error) {
    return (
      <SectionCard title="AI Executive Brief" subtitle="Analysis unavailable">
        <AlertBanner severity="info" title="AI analysis unavailable" description={error} />
      </SectionCard>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Header with collapse toggle */}
      <div
        className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-violet-500/10 p-2">
            <Brain className="h-5 w-5 text-violet-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">AI Executive Brief</h3>
            <p className="text-xs text-muted-foreground">
              Generated {new Date(data.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              fetchAnalysis();
            }}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2.5 py-1 text-xs text-foreground hover:bg-secondary/60"
          >
            <RefreshCw className="h-3 w-3" />
            Regenerate
          </button>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="space-y-4">
          {/* Narrative */}
          <SectionCard title="Executive Summary">
            <div className="prose prose-sm max-w-none text-foreground dark:prose-invert">
              {data.narrative.split("\n\n").map((p, i) => (
                <p key={i} className="text-sm leading-relaxed text-foreground/90">
                  {p}
                </p>
              ))}
            </div>
          </SectionCard>

          {/* Trend Analysis */}
          {data.trendAnalysis.length > 0 && (
            <SectionCard title="Trend Analysis" subtitle="Key metric trajectories">
              <div className="space-y-3">
                {data.trendAnalysis.map((trend, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border border-border/50 bg-secondary/10 p-3">
                    <TrendBadge direction={trend.direction} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{trend.metric}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{trend.summary}</p>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Risks */}
          {data.risks.length > 0 && (
            <SectionCard title="Risk Flags" subtitle="Items requiring attention">
              <div className="space-y-3">
                {data.risks.map((risk, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border border-border/50 bg-secondary/10 p-3">
                    <SeverityBadge severity={risk.severity} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{risk.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{risk.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Recommendations */}
          {data.recommendations.length > 0 && (
            <SectionCard title="Recommendations" subtitle="Prioritized actions">
              <div className="space-y-3">
                {data.recommendations.map((rec, i) => (
                  <div key={i} className="rounded-lg border border-border/50 bg-secondary/10 p-3">
                    <div className="flex items-start gap-3">
                      <PriorityBadge priority={rec.priority} />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{rec.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{rec.description}</p>
                        <div className="mt-2 flex items-center gap-1.5">
                          <Lightbulb className="h-3 w-3 text-amber-500" />
                          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                            Expected: {rec.expectedImpact}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}
