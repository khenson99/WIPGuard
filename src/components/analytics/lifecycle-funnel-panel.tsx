"use client";

import { useMemo, useState } from "react";
import type {
  AiInsight,
  AnalyticsSectionId,
  LifecycleFunnelData,
  LifecycleStageId,
} from "@/lib/analytics/types";

interface LifecycleFunnelPanelProps {
  lifecycle: LifecycleFunnelData | null;
  insights?: AiInsight[];
  sectionFocus?: AnalyticsSectionId | "all";
}

type ViewMode = "volume" | "conversion";

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function formatPct(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(1)}%`;
}

const STAGE_COLORS: Record<LifecycleStageId, string> = {
  awareness: "#3b82f6",
  acquisition: "#14b8a6",
  activation: "#6366f1",
  revenue: "#22c55e",
  retention: "#f97316",
  expansion: "#a855f7",
};

export function LifecycleFunnelPanel({ lifecycle, insights = [], sectionFocus = "all" }: LifecycleFunnelPanelProps) {
  const visibleStages = useMemo(() => {
    if (!lifecycle) return [];
    if (sectionFocus === "all") return lifecycle.stages;
    return lifecycle.stages.filter((stage) => stage.section === sectionFocus);
  }, [lifecycle, sectionFocus]);

  const [viewMode, setViewMode] = useState<ViewMode>("volume");
  const [activeStageId, setActiveStageId] = useState<LifecycleStageId | null>(visibleStages[0]?.id ?? null);
  const [hoveredStageId, setHoveredStageId] = useState<LifecycleStageId | null>(null);

  const firstStage = visibleStages[0] ?? null;
  const activeStage = visibleStages.find((stage) => stage.id === activeStageId) ?? firstStage;
  const hoveredStage = visibleStages.find((stage) => stage.id === hoveredStageId) ?? null;
  const displayStage = hoveredStage ?? activeStage;
  const displayStageId = displayStage?.id ?? null;
  const displayStageSection = displayStage?.section ?? null;

  const visibleTransitions = useMemo(() => {
    if (!lifecycle || !displayStageId) return [];
    return lifecycle.transitions.filter((item) => item.fromStageId === displayStageId);
  }, [lifecycle, displayStageId]);

  const relatedInsights = useMemo(() => {
    if (!displayStageSection) return [];
    return insights.filter((item) => item.section === displayStageSection);
  }, [insights, displayStageSection]);

  if (!lifecycle || visibleStages.length === 0 || !displayStage) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Lifecycle Funnel</h2>
        <p className="mt-2 text-xs text-muted-foreground">No lifecycle funnel data available for this range.</p>
      </section>
    );
  }

  const maxVolume = Math.max(1, ...visibleStages.map((stage) => stage.volume));

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Customer Lifecycle Funnel</h2>
          <p className="text-xs text-muted-foreground">Click a stage to inspect downstream transitions and related recommendations.</p>
        </div>
        <div className="flex gap-1 rounded-md border border-border p-1">
          <button
            type="button"
            onClick={() => setViewMode("volume")}
            className={`rounded px-2 py-1 text-xs ${viewMode === "volume" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Volume
          </button>
          <button
            type="button"
            onClick={() => setViewMode("conversion")}
            className={`rounded px-2 py-1 text-xs ${viewMode === "conversion" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Conversion
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {visibleStages.map((stage) => {
          const isActive = displayStage.id === stage.id;
          const barWidth = `${Math.max(8, Math.round((stage.volume / maxVolume) * 100))}%`;
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => setActiveStageId(stage.id)}
              onMouseEnter={() => setHoveredStageId(stage.id)}
              onMouseLeave={() => setHoveredStageId(null)}
              className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                isActive ? "border-primary/50 bg-primary/5" : "border-border bg-background hover:border-primary/30"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">{stage.label}</p>
                  <p className="text-xl font-semibold text-foreground">
                    {viewMode === "volume" ? formatNumber(stage.volume) : formatPct(stage.conversionFromPrevious)}
                  </p>
                </div>
                <span className="text-[11px] text-muted-foreground">Conf. {(stage.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-secondary">
                <div
                  className="h-full rounded-full"
                  style={{ width: barWidth, backgroundColor: STAGE_COLORS[stage.id] }}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Trend {stage.trendDeltaPct === null ? "n/a" : `${stage.trendDeltaPct.toFixed(1)}%`}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border/70 bg-background p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
            Evidence: {displayStage.label}
          </h3>
          <div className="mt-2 space-y-2">
            {displayStage.evidence.length === 0 ? (
              <p className="text-xs text-muted-foreground">No source evidence available for this stage.</p>
            ) : (
              displayStage.evidence.map((evidence) => (
                <div key={`${displayStage.id}-${evidence.source}-${evidence.domain}`} className="rounded-md border border-border/50 px-2 py-1.5">
                  <p className="text-xs font-medium text-foreground">{evidence.source}</p>
                  <p className="text-[11px] text-muted-foreground">{evidence.detail}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {evidence.contribution.toLocaleString()} contribution ({evidence.share.toFixed(1)}%)
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-background p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
            Downstream from {displayStage.label}
          </h3>
          <div className="mt-2 space-y-2">
            {visibleTransitions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No transition records for this stage.</p>
            ) : (
              visibleTransitions.map((transition) => (
                <div key={transition.id} className="rounded-md border border-border/50 px-2 py-1.5 text-xs">
                  <p className="font-medium text-foreground">
                    {transition.fromStageId}
                    {" -> "}
                    {transition.toStageId}
                  </p>
                  <p className="text-muted-foreground">
                    Conversion: {formatPct(transition.conversionRate)} · Dropoff: {transition.dropoff.toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
          <div className="mt-3 border-t border-border/50 pt-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Related recommendations</p>
            {relatedInsights.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">No AI recommendations for this stage yet.</p>
            ) : (
              <div className="mt-1 space-y-1">
                {relatedInsights.slice(0, 3).map((insight) => (
                  <p key={insight.id} className="text-xs text-foreground">
                    {insight.title}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
