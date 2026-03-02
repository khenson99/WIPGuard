"use client";

import React, { useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { buildRangeQuery } from "@/lib/analytics/time-range";
import { ANALYTICS_PRIMARY_SECTIONS } from "@/lib/analytics/section-registry";
import { AnalyticsTimeRangeControls } from "@/components/analytics/time-range-controls";
import { LifecycleFunnelPanel } from "@/components/analytics/lifecycle-funnel-panel";
import { AiInsightsPanel } from "@/components/analytics/ai-insights-panel";
import { CrossDomainInsightsPanel } from "@/components/analytics/cross-domain-insights";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardStaleBanner } from "@/components/dashboard/dashboard-stale-banner";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-error-banner";
import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";
import { Download } from "lucide-react";
import { downloadCsv } from "@/lib/analytics/csv-export";

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

const STATUS_CLASS: Record<string, string> = {
  connected: "text-emerald-600",
  degraded: "text-amber-600",
  partial: "text-amber-600",
  missing: "text-muted-foreground",
};

const STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  connected: CheckCircle,
  degraded: AlertTriangle,
  partial: AlertTriangle,
  missing: XCircle,
};

const SUMMARY_CACHE_PREFIX = "analytics:summary:v1:";

interface SummaryViewModel {
  summary: SummaryPayload;
  overview: AnalyticsDashboardData;
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

  const exportHighlightsCsv = useCallback(() => {
    if (!summary) return;
    const h = summary.highlights;
    downloadCsv(
      "analytics-highlights.csv",
      ["Metric", "Value"],
      [
        ["Total Tasks", String(h.totalTasks)],
        ["Overdue Tasks", String(h.overdueTasks)],
        ["Active Projects", String(h.activeProjects)],
        ["Active Contributors", String(h.activeContributors)],
        ["Discipline Coverage (%)", String(h.disciplineCoverage)],
      ],
    );
  }, [summary]);

  const exportSectionsCsv = useCallback(() => {
    if (!summary) return;
    downloadCsv(
      "analytics-sections.csv",
      ["ID", "Label", "Status", "Integration Count", "Connected Count"],
      summary.primarySections.map((s) => [
        s.id,
        s.label,
        s.status,
        String(s.integrationCount),
        String(s.connectedCount),
      ]),
    );
  }, [summary]);

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
  const erroredDomains = unique([
    ...(overview?.errors ?? []).map((item) => item.source),
    ...(overview?.meta?.erroredDomains ?? []),
  ]);
  const connected = summary.primarySections.filter((section) => section.status === "connected").length;
  const degraded = summary.primarySections.filter((section) => section.status === "degraded").length;
  const missing = summary.primarySections.filter((section) => section.status === "missing").length;

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
            aria-label="Refresh analytics data"
            className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-70"
          >
            {resource.refreshing ? "Refreshing..." : "Refresh now"}
          </button>
        </div>
      </div>

      <div aria-live="polite">
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
      </div>

      <div role="region" aria-label="Section status summary" className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>
            Sections: <span className="font-semibold text-foreground">{connected}</span> connected
          </span>
          <span>
            <span className="font-semibold text-amber-600">{degraded}</span> degraded
          </span>
          <span>
            <span className="font-semibold text-muted-foreground">{missing}</span> missing
          </span>
          <span>
            Stale domains: <span className="font-semibold text-foreground">{staleDomains.length}</span>
          </span>
          <span>
            Error domains: <span className="font-semibold text-foreground">{erroredDomains.length}</span>
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Key Metrics</h2>
        <button
          type="button"
          onClick={exportHighlightsCsv}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          <Download className="h-3 w-3" aria-hidden="true" />
          Export CSV
        </button>
      </div>
      <div role="region" aria-label="Key metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
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

      <div tabIndex={0} role="group" aria-label="Lifecycle funnel chart">
        <LifecycleFunnelPanel lifecycle={overview?.lifecycleFunnel ?? null} insights={overview?.aiInsights?.global ?? []} sectionFocus="all" />
      </div>
      <div tabIndex={0} role="group" aria-label="Cross-domain insights chart">
        <CrossDomainInsightsPanel
          data={null}
        />
      </div>
      <div tabIndex={0} role="group" aria-label="AI insights panel">
        <AiInsightsPanel bundle={overview?.aiInsights ?? null} defaultFilter="all" />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Primary Sections</h2>
        <button
          type="button"
          onClick={exportSectionsCsv}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          <Download className="h-3 w-3" aria-hidden="true" />
          Export CSV
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        {ANALYTICS_PRIMARY_SECTIONS.map((primary) => {
          const section = summary.primarySections.find((item) => item.id === primary.id);
          return (
            <Link
              key={primary.id}
              href={`${primary.path}${rangeQuery ? `?${rangeQuery}` : ""}`}
              aria-label={`${primary.label}: ${section?.status ?? "missing"}`}
              className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">{primary.label}</h3>
                {(() => {
                  const status = section?.status ?? "missing";
                  const Icon = STATUS_ICON[status] ?? XCircle;
                  return (
                    <span className={`flex items-center gap-1 text-[11px] uppercase ${STATUS_CLASS[status] ?? "text-muted-foreground"}`}>
                      <Icon className="h-3 w-3" aria-hidden="true" />
                      {status}
                    </span>
                  );
                })()}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{primary.description}</p>
              {section && (
                <>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {section.connectedCount}/{section.integrationCount} integrations connected
                  </p>
                  {section.children?.some((child) => child.lastError) ? (
                    <p className="mt-1 text-[11px] text-amber-600">Some integrations are failing and need attention.</p>
                  ) : null}
                </>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
