"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { ANALYTICS_PRIMARY_SECTIONS } from "@/lib/analytics/section-registry";
import { AnalyticsTimeRangeControls } from "@/components/analytics/time-range-controls";
import { LifecycleFunnelPanel } from "@/components/analytics/lifecycle-funnel-panel";
import { AiInsightsPanel } from "@/components/analytics/ai-insights-panel";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardStaleBanner } from "@/components/dashboard/dashboard-stale-banner";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-error-banner";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";

interface SummaryPayload {
  generatedAt: string;
  meta?: {
    servedAt: string;
    isPartial: boolean;
  };
  timeRange: {
    preset: string;
    from: string;
    to: string;
    days: number;
    label: string;
  };
  highlights: {
    totalTasks: number;
    overdueTasks: number;
    activeProjects: number;
    activeContributors: number;
    disciplineCoverage: number;
  };
  primarySections: Array<{
    id: string;
    label: string;
    description: string;
    href: string;
    status: "connected" | "partial" | "degraded" | "missing";
    integrationCount: number;
    connectedCount: number;
    children?: Array<{
      id: string;
      label: string;
      href: string;
      status: "connected" | "partial" | "degraded" | "missing";
      lastSnapshotAt?: string | null;
      lastError?: string | null;
    }>;
  }>;
}

const SUMMARY_CACHE_PREFIX = "analytics:summary:v1:";

interface SummaryViewModel {
  summary: SummaryPayload;
  overview: AnalyticsDashboardData;
}

function buildRangeQuery(searchParams: URLSearchParams | null): string {
  const params = new URLSearchParams();
  const range = searchParams?.get("range");
  const from = searchParams?.get("from");
  const to = searchParams?.get("to");
  if (range) params.set("range", range);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return params.toString();
}

function summaryCacheKey(rangeQuery: string): string {
  return `${SUMMARY_CACHE_PREFIX}${rangeQuery || "default"}`;
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.filter((item) => item.trim().length > 0)));
}

export function AnalyticsSummaryPage() {
  const searchParams = useSearchParams();
  const rangeQuery = useMemo(() => buildRangeQuery(searchParams), [searchParams]);

  const resource = useDashboardResource<SummaryViewModel>({
    cacheKey: summaryCacheKey(rangeQuery),
    deps: [rangeQuery],
    load: async ({ signal, refresh }) => {
      const summaryParams = new URLSearchParams(rangeQuery);
      if (refresh) {
        summaryParams.set("refresh", "true");
      }

      const overviewParams = new URLSearchParams(rangeQuery);
      overviewParams.set("section", "overview");
      if (refresh) {
        overviewParams.set("refresh", "true");
      }

      const [summaryResponse, overviewResponse] = await Promise.all([
        fetch(`/api/analytics/summary${summaryParams.toString() ? `?${summaryParams.toString()}` : ""}`, {
          signal,
          cache: refresh ? "no-store" : "default",
        }),
        fetch(`/api/analytics?${overviewParams.toString()}`, {
          signal,
          cache: refresh ? "no-store" : "default",
        }),
      ]);

      if (!summaryResponse.ok) {
        throw new Error(`Analytics summary request failed (${summaryResponse.status})`);
      }
      if (!overviewResponse.ok) {
        throw new Error(`Analytics overview request failed (${overviewResponse.status})`);
      }

      const [summaryPayload, overviewPayload] = await Promise.all([
        summaryResponse.json(),
        overviewResponse.json(),
      ]);

      return {
        summary: summaryPayload as SummaryPayload,
        overview: overviewPayload as AnalyticsDashboardData,
      };
    },
    getLastUpdatedAt: (payload) => {
      return (
        payload.summary.meta?.servedAt ??
        payload.overview.meta?.servedAt ??
        payload.overview.lastFullRefresh ??
        payload.summary.generatedAt
      );
    },
    mapError: (error) => {
      if (error instanceof Error && error.message) return error.message;
      return "Could not load analytics summary.";
    },
  });

  const summary = resource.data?.summary ?? null;
  const overview = resource.data?.overview ?? null;

  if (resource.loading && !resource.data) {
    return <DashboardLoadingState message="Loading analytics summary..." />;
  }

  if (!summary) {
    return (
      <div className="p-4">
        <DashboardEmptyState
          title="Analytics summary unavailable"
          message={resource.error ?? "No summary data is available for the selected range."}
          actionLabel="Refresh now"
          onAction={resource.refresh}
        />
      </div>
    );
  }

  const staleDomains = unique([...(overview?.staleDomains ?? []), ...(overview?.meta?.staleDomains ?? [])]);

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Analytics Overview</h1>
          <p className="text-xs text-muted-foreground">
            Distilled cross-platform insights across Ads, Finance, Sales, and Customer Success.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Last updated: {resource.lastUpdatedAt ? new Date(resource.lastUpdatedAt).toLocaleString() : "Unknown"}
            {resource.fromCache ? " (cache warm start)" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AnalyticsTimeRangeControls />
          <button
            type="button"
            onClick={resource.refresh}
            disabled={resource.refreshing}
            className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-70"
          >
            {resource.refreshing ? "Refreshing..." : "Refresh now"}
          </button>
        </div>
      </div>

      {(resource.stale || staleDomains.length > 0) && (
        <DashboardStaleBanner
          lastUpdatedAt={resource.lastUpdatedAt}
          refreshing={resource.refreshing}
          onRefresh={resource.refresh}
          label="Showing cached analytics while background refresh completes or retries."
        />
      )}

      {resource.error ? (
        <DashboardErrorBanner
          message={resource.error}
          onRetry={resource.refresh}
          settingsHref="/settings?tab=integrations"
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Discipline Coverage</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{summary.highlights.disciplineCoverage}%</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Active Projects</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{summary.highlights.activeProjects}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Active Contributors</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{summary.highlights.activeContributors}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Total Tasks</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{summary.highlights.totalTasks}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Overdue Tasks</p>
          <p className="mt-1 text-2xl font-semibold text-red-500">{summary.highlights.overdueTasks}</p>
        </div>
      </div>

      <LifecycleFunnelPanel lifecycle={overview?.lifecycleFunnel ?? null} insights={overview?.aiInsights?.global ?? []} sectionFocus="all" />
      <AiInsightsPanel bundle={overview?.aiInsights ?? null} defaultFilter="all" />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        {ANALYTICS_PRIMARY_SECTIONS.map((primary) => {
          return (
            <Link
              key={primary.id}
              href={`${primary.path}${rangeQuery ? `?${rangeQuery}` : ""}`}
              className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <h3 className="text-sm font-semibold text-foreground">{primary.label}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{primary.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
