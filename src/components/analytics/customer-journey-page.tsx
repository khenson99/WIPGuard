"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { HorizontalFunnel } from "@/components/charts";
import { StatCard } from "./stat-card";
import { DashboardSectionCard } from "./dashboard-section-card";
import { AiInsightsPanel } from "./ai-insights-panel";
import { AnalyticsTimeRangeControls } from "@/components/analytics/time-range-controls";
import { buildRangeQuery } from "@/lib/analytics/time-range";
import type {
  AnalyticsDashboardData,
  LifecycleStageId,
} from "@/lib/analytics/types";
import { Users, TrendingUp, ArrowRight, Sparkles, AlertTriangle } from "lucide-react";
import { populateConnectionStatus } from "@/hooks/use-connection-status";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";

const STAGE_COLORS: Record<LifecycleStageId, string> = {
  awareness: "#3b82f6",
  acquisition: "#14b8a6",
  activation: "#6366f1",
  revenue: "#22c55e",
  retention: "#f97316",
  expansion: "#a855f7",
};

const STAGE_ORDER: LifecycleStageId[] = [
  "awareness", "acquisition", "activation", "revenue", "retention", "expansion",
];

export function CustomerJourneyPage() {
  const searchParams = useSearchParams();
  const rangeQuery = useMemo(() => buildRangeQuery(searchParams), [searchParams]);
  const cacheKey = `analytics:overview:${rangeQuery || "all"}`;

  const resource = useDashboardResource<AnalyticsDashboardData>({
    cacheKey,
    deps: [rangeQuery],
    load: async ({ signal }) => {
      const response = await fetch(
        `/api/analytics?section=overview${rangeQuery ? `&${rangeQuery}` : ""}`,
        { signal }
      );
      if (!response.ok) {
        throw new Error(`Analytics overview request failed (${response.status})`);
      }
      return (await response.json()) as AnalyticsDashboardData;
    },
    getLastUpdatedAt: (payload) =>
      payload.meta?.servedAt ?? payload.lastFullRefresh ?? null,
    mapError: (error) =>
      error instanceof Error && error.message ? error.message : "Could not load journey data.",
  });

  const data = resource.data;
  const [selectedStage, setSelectedStage] = useState<LifecycleStageId | null>(null);

  useEffect(() => {
    if (!data) return;
    populateConnectionStatus(data.freshness, data);
  }, [data]);

  const lifecycle = data?.lifecycleFunnel ?? null;
  const insights = data?.aiInsights?.global ?? [];

  const stageGroupRef = useRef<HTMLDivElement>(null);

  const handleStageKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const group = stageGroupRef.current;
      if (!group) return;
      const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>("button"));
      const currentIndex = buttons.findIndex((btn) => btn === document.activeElement);
      if (currentIndex === -1) return;
      const nextIndex =
        e.key === "ArrowRight"
          ? (currentIndex + 1) % buttons.length
          : (currentIndex - 1 + buttons.length) % buttons.length;
      buttons[nextIndex].focus();
    },
    [],
  );

  if (resource.loading && !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading journey data…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-destructive/60" />
          <p className="text-sm font-medium text-destructive">
            {resource.error ?? "Could not load journey data."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Check your connection and try again
          </p>
          <button
            type="button"
            onClick={resource.refresh}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!lifecycle) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <ArrowRight className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No lifecycle data available</p>
          <p className="text-xs text-muted-foreground">Connect integrations to see the customer journey</p>
        </div>
      </div>
    );
  }

  // Build funnel stages
  const stages = STAGE_ORDER.map((id) => {
    const stage = lifecycle.stages.find((s) => s.id === id);
    return {
      label: stage?.label ?? id,
      value: stage?.volume ?? 0,
      color: STAGE_COLORS[id],
    };
  });

  // Compute avg conversion from stages (conversionFromPrevious is already a %, e.g. 45.2)
  const conversionValues = lifecycle.stages
    .map((s) => s.conversionFromPrevious)
    .filter((v): v is number => v !== null);
  const avgConversion = conversionValues.length > 0
    ? conversionValues.reduce((sum, v) => sum + v, 0) / conversionValues.length
    : null;

  const selectedStageData = selectedStage
    ? lifecycle.stages.find((s) => s.id === selectedStage)
    : null;

  // Get transitions FROM the selected stage
  const selectedTransitions = selectedStage
    ? lifecycle.transitions.filter((t) => t.fromStageId === selectedStage)
    : [];

  const totalVolume = stages.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="space-y-6">
      <AiInsightsPanel bundle={data?.aiInsights || null} defaultFilter="customer-journey" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Customer Journey</h2>
          <p className="text-sm text-muted-foreground">
            Full lifecycle funnel from awareness to expansion — click a stage to inspect
          </p>
        </div>
        <AnalyticsTimeRangeControls />
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Contacts" value={totalVolume.toLocaleString()} icon={Users} />
        <StatCard
          label="Avg Conversion"
          value={avgConversion !== null ? `${avgConversion.toFixed(1)}%` : "—"}
          icon={TrendingUp}
        />
        <StatCard label="Stages" value={String(lifecycle.stages.length)} icon={ArrowRight} />
        <StatCard label="Active Insights" value={String(insights.length)} icon={Sparkles} />
      </div>

      {/* Hero Funnel */}
      <DashboardSectionCard title="Lifecycle Funnel" subtitle="Click a stage to see details">
        <div aria-label="Lifecycle funnel visualization">
          <HorizontalFunnel stages={stages} height={360} />
        </div>
        <div
          ref={stageGroupRef}
          role="group"
          aria-label="Lifecycle stages"
          onKeyDown={handleStageKeyDown}
          className="mt-3 flex flex-wrap gap-2"
        >
          {STAGE_ORDER.map((id) => {
            const stage = lifecycle.stages.find((s) => s.id === id);
            return (
              <button
                key={id}
                aria-pressed={selectedStage === id}
                onClick={() => setSelectedStage(selectedStage === id ? null : id)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedStage === id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: STAGE_COLORS[id] }} />
                {stage?.label ?? id}
              </button>
            );
          })}
        </div>
      </DashboardSectionCard>

      {/* Stage Detail Panel */}
      <div aria-live="polite">
        {selectedStageData && (
          <DashboardSectionCard title={selectedStageData.label} subtitle="Stage evidence and transitions">
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Evidence (LifecycleSegment[]) */}
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Evidence Sources</h4>
                <div className="space-y-2">
                  {selectedStageData.evidence.length > 0 ? (
                    selectedStageData.evidence.map((ev, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2 text-sm">
                        <span className="text-foreground">{ev.source}: {ev.detail}</span>
                        <span className="font-semibold tabular-nums text-foreground">{ev.contribution}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">No evidence data for this stage</p>
                  )}
                </div>
              </div>
              {/* Transitions (from LifecycleFunnelData.transitions filtered by fromStageId) */}
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transitions</h4>
                <div className="space-y-2">
                  {selectedTransitions.length > 0 ? (
                    selectedTransitions.map((tr) => (
                      <div key={tr.id} className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2 text-sm">
                        <span className="text-muted-foreground">→ {tr.toStageId}</span>
                        <span className="font-semibold tabular-nums text-foreground">
                          {tr.conversionRate !== null ? `${tr.conversionRate.toFixed(1)}%` : "—"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">No transition data for this stage</p>
                  )}
                </div>
              </div>
            </div>
          </DashboardSectionCard>
        )}
      </div>

      {/* Journey Insights */}
      {insights.length > 0 && (
        <DashboardSectionCard title="Journey Insights" subtitle="AI-generated recommendations based on lifecycle data">
          <div className="grid gap-3 lg:grid-cols-2">
            {insights.slice(0, 4).map((insight) => (
              <div
                key={insight.id}
                className={`rounded-lg border px-4 py-3 ${
                  insight.severity === "critical"
                    ? "border-red-500/20 bg-red-500/5"
                    : insight.severity === "warning"
                      ? "border-yellow-500/20 bg-yellow-500/5"
                      : "border-blue-500/20 bg-blue-500/5"
                }`}
              >
                <p className="text-sm font-semibold text-foreground">{insight.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{insight.why}</p>
              </div>
            ))}
          </div>
        </DashboardSectionCard>
      )}
    </div>
  );
}
