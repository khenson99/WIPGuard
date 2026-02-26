"use client";

import { useWhipData } from "@/components/whip/use-whip-data";
import { WhipFilterBar } from "@/components/whip/whip-filter-bar";
import { ScopeCreepSummary } from "@/components/whip/scope-creep-summary";
import { ScopeTimeline } from "@/components/whip/scope-timeline";
import { WipPressureHeatmap } from "@/components/whip/wip-pressure-heatmap";
import { QuickActionsPanel } from "@/components/whip/quick-actions-panel";
import { RetroExport } from "@/components/whip/retro-export";
import { getSprintLabel } from "@/lib/sprints";

export default function WhipPage() {
  const {
    sprints,
    sprintData,
    riskReport,
    tasks,
    loading,
    error,
    filters,
    setFilters,
    updateTask,
  } = useWhipData();

  const activeSprint = sprints.find((s) => s.id === filters.sprintId);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Whip View
          </h1>
          <p className="text-sm text-muted-foreground">
            Scope creep visibility and WIP pressure for standup triage
          </p>
        </div>
        {activeSprint && (
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-foreground">
              {getSprintLabel(activeSprint)}
            </span>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-wip-over-border bg-wip-over-bg px-4 py-3 text-sm text-wip-over-text">
          {error}
        </div>
      )}

      {/* Filters */}
      <WhipFilterBar
        sprints={sprints}
        tasks={tasks}
        filters={filters}
        setFilters={setFilters}
      />

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-lg border border-border bg-muted"
              />
            ))}
          </div>
          <div className="h-48 animate-pulse rounded-lg border border-border bg-muted" />
          <div className="h-40 animate-pulse rounded-lg border border-border bg-muted" />
        </div>
      )}

      {/* Main content (visible once loaded) */}
      {!loading && (
        <>
          {/* Scope creep summary cards */}
          <ScopeCreepSummary data={sprintData} />

          {/* Two-column layout for timeline + heatmap on wider screens */}
          <div className="grid gap-6 lg:grid-cols-2">
            <ScopeTimeline data={sprintData} />
            <WipPressureHeatmap riskReport={riskReport} />
          </div>

          {/* Quick actions for unplanned tasks */}
          <QuickActionsPanel tasks={tasks} updateTask={updateTask} />

          {/* Retrospective export */}
          <RetroExport
            sprintName={
              activeSprint
                ? getSprintLabel(activeSprint, { includeYear: true })
                : null
            }
            sprintData={sprintData}
            riskReport={riskReport}
            tasks={tasks}
          />
        </>
      )}
    </div>
  );
}
