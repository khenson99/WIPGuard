"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { InsightCardFull } from "./insight-card-full";
import { StatCard } from "./stat-card";
import { DismissUndoToast } from "./dismiss-undo-toast";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-error-banner";
import { DashboardStaleBanner } from "@/components/dashboard/dashboard-stale-banner";
import type { AnalyticsDashboardData, AnalyticsSectionId, AiInsight } from "@/lib/analytics/types";
import { AlertTriangle, AlertCircle, Info, BarChart3 } from "lucide-react";
import { populateConnectionStatus } from "@/hooks/use-connection-status";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";
import { useInsightPreferences } from "@/lib/hooks/use-insight-preferences";

type SeverityFilter = "all" | "critical" | "warning" | "info";
type SectionFilter = "all" | AnalyticsSectionId;
type SortMode = "severity" | "confidence";

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };
const PAGE_SIZES = [10, 25, 50] as const;

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function AiInsightsPage() {
  const resource = useDashboardResource<AnalyticsDashboardData>({
    cacheKey: "analytics:ai-insights:v1",
    deps: [],
    load: async ({ signal, refresh }) => {
      const params = new URLSearchParams({ section: "ai-insights" });
      if (refresh) {
        params.set("refresh", "true");
      }

      const response = await fetch(`/api/analytics?${params.toString()}`, {
        signal,
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Analytics overview request failed (${response.status})`);
      }
      return (await response.json()) as AnalyticsDashboardData;
    },
    getLastUpdatedAt: (payload) =>
      payload.meta?.servedAt ?? payload.lastFullRefresh ?? null,
    mapError: (error) =>
      error instanceof Error && error.message ? error.message : "Could not load insights.",
  });

  const data = resource.data;
  const loading = resource.loading && !resource.data;
  const error = resource.error;
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("severity");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(25);
  const [showDismissed, setShowDismissed] = useState(false);
  const [recentlyDismissed, setRecentlyDismissed] = useState<{ id: string; title: string } | null>(null);

  const {
    isPinned,
    isDismissed,
    togglePin,
    dismiss,
    undoDismiss,
    sortAndFilter,
  } = useInsightPreferences();

  useEffect(() => {
    if (!data) return;
    populateConnectionStatus(data.freshness, data);
  }, [data]);

  const allInsights = useMemo(() => data?.aiInsights?.global ?? [], [data?.aiInsights?.global]);

  const dismissedCount = useMemo(
    () => allInsights.filter((i) => isDismissed(i.id)).length,
    [allInsights, isDismissed]
  );

  const filtered = useMemo(() => {
    // First apply sortAndFilter (handles pin order + dismissed filtering)
    let result = sortAndFilter(allInsights, showDismissed);

    // Then apply severity/section filters
    if (severityFilter !== "all") {
      result = result.filter((i) => i.severity === severityFilter);
    }
    if (sectionFilter !== "all") {
      result = result.filter((i) => i.section === sectionFilter);
    }

    // Sort within unpinned group (pinned always stay on top from sortAndFilter)
    const pinned = result.filter((i) => isPinned(i.id));
    const unpinned = result.filter((i) => !isPinned(i.id));

    const sortFn = (a: AiInsight, b: AiInsight) =>
      sortMode === "severity"
        ? (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
        : b.confidence - a.confidence;

    return [...pinned, ...unpinned.sort(sortFn)];
  }, [allInsights, severityFilter, sectionFilter, sortMode, sortAndFilter, showDismissed, isPinned]);

  const totalInsights = filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalInsights / pageSize));
  const currentPage = clamp(page, 1, pageCount);
  const pageStartIndex = (currentPage - 1) * pageSize;
  const pageEndIndexExclusive = Math.min(pageStartIndex + pageSize, totalInsights);
  const pagedInsights = useMemo(
    () => filtered.slice(pageStartIndex, pageEndIndexExclusive),
    [filtered, pageEndIndexExclusive, pageStartIndex],
  );

  const visiblePages = useMemo(() => {
    if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
    const pages = new Set<number>([1, pageCount]);
    for (let p = currentPage - 2; p <= currentPage + 2; p++) {
      if (p > 1 && p < pageCount) pages.add(p);
    }
    return Array.from(pages).sort((a, b) => a - b);
  }, [currentPage, pageCount]);

  const criticalCount = allInsights.filter((i) => i.severity === "critical").length;
  const warningCount = allInsights.filter((i) => i.severity === "warning").length;
  const infoCount = allInsights.filter((i) => i.severity === "info").length;
  const avgConfidence = allInsights.length > 0
    ? allInsights.reduce((sum, i) => sum + i.confidence, 0) / allInsights.length
    : 0;

  const handleDismiss = useCallback((insight: AiInsight) => {
    void dismiss(insight.id);
    setRecentlyDismissed({ id: insight.id, title: insight.title });
  }, [dismiss]);

  const handleUndoDismiss = useCallback(() => {
    if (recentlyDismissed) {
      void undoDismiss(recentlyDismissed.id);
      setRecentlyDismissed(null);
    }
  }, [recentlyDismissed, undoDismiss]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading insights…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4">
        <DashboardEmptyState
          title="AI insights unavailable"
          message={error ?? "Could not load insights."}
          actionLabel="Rerun insights"
          onAction={resource.refresh}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">AI Insights</h2>
          <p className="text-sm text-muted-foreground">
            Cross-functional recommendations based on all connected data sources
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Last updated: {resource.lastUpdatedAt ? new Date(resource.lastUpdatedAt).toLocaleString() : "Unknown"}
            {resource.fromCache ? " (cache warm start)" : ""}
          </p>
        </div>

        <button
          type="button"
          onClick={resource.refresh}
          disabled={resource.refreshing}
          aria-label="Rerun AI insights"
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-70"
        >
          {resource.refreshing ? "Rerunning..." : "Rerun insights"}
        </button>
      </div>

      {!error && resource.stale ? (
        <DashboardStaleBanner
          lastUpdatedAt={resource.lastUpdatedAt}
          onRefresh={resource.refresh}
          refreshing={resource.refreshing}
          label="Showing cached AI insights while the latest rerun completes or retries."
        />
      ) : null}

      {error ? (
        <DashboardErrorBanner
          message={error}
          onRetry={resource.refresh}
          retryLabel="Rerun insights"
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Critical" value={String(criticalCount)} icon={AlertTriangle} iconColor="text-red-500" />
        <StatCard label="Warnings" value={String(warningCount)} icon={AlertCircle} iconColor="text-yellow-500" />
        <StatCard label="Info" value={String(infoCount)} icon={Info} iconColor="text-blue-500" />
        <StatCard label="Avg Confidence" value={`${(avgConfidence * 100).toFixed(0)}%`} icon={BarChart3} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-secondary/50 p-0.5" role="group" aria-label="Severity filter">
          {(["all", "critical", "warning", "info"] as SeverityFilter[]).map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => {
                setSeverityFilter(sev);
                setPage(1);
              }}
              aria-pressed={severityFilter === sev}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                severityFilter === sev ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {sev === "all" ? "All" : sev.charAt(0).toUpperCase() + sev.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex gap-1 rounded-lg bg-secondary/50 p-0.5" role="group" aria-label="Section filter">
          {(["all", "ads-traffic", "finance", "sales-pipeline", "customer-success"] as SectionFilter[]).map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => {
                setSectionFilter(sec);
                setPage(1);
              }}
              aria-pressed={sectionFilter === sec}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                sectionFilter === sec ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {sec === "all" ? "All" : sec === "ads-traffic" ? "Ads" : sec === "sales-pipeline" ? "Sales" : sec === "customer-success" ? "CS" : "Finance"}
            </button>
          ))}
        </div>

        <div className="flex gap-1 rounded-lg bg-secondary/50 p-0.5" role="group" aria-label="Sort mode">
          {(["severity", "confidence"] as SortMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setSortMode(mode);
                setPage(1);
              }}
              aria-pressed={sortMode === mode}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                sortMode === mode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-xl border border-border bg-card">
            <p className="text-sm text-muted-foreground">No insights match current filters</p>
          </div>
        ) : (
          pagedInsights.map((insight) => (
            <InsightCardFull
              key={insight.id}
              insight={insight}
              isPinned={isPinned(insight.id)}
              onTogglePin={() => void togglePin(insight.id)}
              onDismiss={() => handleDismiss(insight)}
            />
          ))
        )}
      </div>

      {dismissedCount > 0 && (
        <button
          type="button"
          onClick={() => {
            setShowDismissed((prev) => !prev);
            setPage(1);
          }}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          {showDismissed
            ? "Hide dismissed insights"
            : `Show ${dismissedCount} dismissed insight${dismissedCount !== 1 ? "s" : ""}`}
        </button>
      )}

      {totalInsights > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Page {currentPage} of {pageCount}
            </p>
            <span className="text-xs text-muted-foreground">•</span>
            <p className="text-xs text-muted-foreground">
              Showing{" "}
              <span className="font-medium text-foreground tabular-nums">
                {pageStartIndex + 1}
              </span>
              –
              <span className="font-medium text-foreground tabular-nums">
                {pageEndIndexExclusive}
              </span>{" "}
              of{" "}
              <span className="font-medium text-foreground tabular-nums">
                {totalInsights}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted-foreground" htmlFor="ai-insights-page-size">
              Per page
            </label>
            <select
              id="ai-insights-page-size"
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              value={String(pageSize)}
              onChange={(e) => {
                setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number]);
                setPage(1);
              }}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={String(size)}>
                  {size}
                </option>
              ))}
            </select>

            {pageCount > 1 && (
              <nav aria-label="AI insights pagination" className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  aria-label="Previous page"
                >
                  Prev
                </button>

                {visiblePages.map((p, idx) => {
                  const prev = visiblePages[idx - 1];
                  const showEllipsis = prev != null && p - prev > 1;
                  return (
                    <span key={p} className="flex items-center gap-1">
                      {showEllipsis ? (
                        <span className="px-1 text-xs text-muted-foreground" aria-hidden="true">
                          …
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className={`h-8 min-w-8 rounded-md border px-2 text-xs font-medium tabular-nums ${
                          p === currentPage
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-background text-muted-foreground hover:text-foreground"
                        }`}
                        onClick={() => setPage(p)}
                        aria-label={`Go to page ${p}`}
                        aria-current={p === currentPage ? "page" : undefined}
                      >
                        {p}
                      </button>
                    </span>
                  );
                })}

                <button
                  type="button"
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage >= pageCount}
                  aria-label="Next page"
                >
                  Next
                </button>
              </nav>
            )}
          </div>
        </div>
      )}

      {recentlyDismissed && (
        <DismissUndoToast
          insightTitle={recentlyDismissed.title}
          onUndo={handleUndoDismiss}
          onClose={() => setRecentlyDismissed(null)}
        />
      )}
    </div>
  );
}
