"use client";

import { useEffect, useMemo, useState } from "react";
import { InsightCardFull } from "./insight-card-full";
import { StatCard } from "./stat-card";
import type { AnalyticsDashboardData, AnalyticsSectionId } from "@/lib/analytics/types";
import { AlertTriangle, AlertCircle, Info, BarChart3 } from "lucide-react";
import { populateConnectionStatus } from "@/hooks/use-connection-status";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";

type SeverityFilter = "all" | "critical" | "warning" | "info";
type SectionFilter = "all" | AnalyticsSectionId;
type SortMode = "severity" | "confidence";

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

export function AiInsightsPage() {
  const resource = useDashboardResource<AnalyticsDashboardData>({
    cacheKey: "analytics:overview:v1",
    deps: [],
    load: async ({ signal }) => {
      const response = await fetch("/api/analytics?section=overview", { signal });
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
  const loading = resource.loading && !data;
  const error = resource.error;
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("severity");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const handleSeverityChange = (sev: SeverityFilter) => {
    setSeverityFilter(sev);
    setPage(1);
  };
  const handleSectionChange = (sec: SectionFilter) => {
    setSectionFilter(sec);
    setPage(1);
  };
  const handleSortChange = (mode: SortMode) => {
    setSortMode(mode);
    setPage(1);
  };

  useEffect(() => {
    if (!data) return;
    populateConnectionStatus(data.freshness, data);
  }, [data]);

  const allInsights = useMemo(() => data?.aiInsights?.global ?? [], [data?.aiInsights?.global]);

  const filtered = useMemo(() => {
    let result = allInsights;
    if (severityFilter !== "all") {
      result = result.filter((i) => i.severity === severityFilter);
    }
    if (sectionFilter !== "all") {
      result = result.filter((i) => i.section === sectionFilter);
    }
    if (sortMode === "severity") {
      result = [...result].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
    } else {
      result = [...result].sort((a, b) => b.confidence - a.confidence);
    }
    return result;
  }, [allInsights, severityFilter, sectionFilter, sortMode]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedInsights = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const criticalCount = allInsights.filter((i) => i.severity === "critical").length;
  const warningCount = allInsights.filter((i) => i.severity === "warning").length;
  const infoCount = allInsights.filter((i) => i.severity === "info").length;
  const avgConfidence = allInsights.length > 0
    ? allInsights.reduce((sum, i) => sum + i.confidence, 0) / allInsights.length
    : 0;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading insights…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-4 rounded-xl border border-red-200 bg-red-50 px-8 py-6 dark:border-red-900 dark:bg-red-950/50">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
            <p className="text-sm font-medium">{error ?? "Failed to load AI insights"}</p>
          </div>
          <button
            type="button"
            onClick={resource.refresh}
            className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">AI Insights</h2>
        <p className="text-sm text-muted-foreground">
          Cross-functional recommendations based on all connected data sources
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Critical" value={String(criticalCount)} icon={AlertTriangle} iconColor="text-red-500" />
        <StatCard label="Warnings" value={String(warningCount)} icon={AlertCircle} iconColor="text-yellow-500" />
        <StatCard label="Info" value={String(infoCount)} icon={Info} iconColor="text-blue-500" />
        <StatCard label="Avg Confidence" value={`${(avgConfidence * 100).toFixed(0)}%`} icon={BarChart3} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-secondary/50 p-0.5">
          {(["all", "critical", "warning", "info"] as SeverityFilter[]).map((sev) => (
            <button
              key={sev}
              aria-pressed={severityFilter === sev}
              onClick={() => handleSeverityChange(sev)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                severityFilter === sev ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {sev === "all" ? "All" : sev.charAt(0).toUpperCase() + sev.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex gap-1 rounded-lg bg-secondary/50 p-0.5">
          {(["all", "ads-traffic", "finance", "sales-pipeline", "customer-success"] as SectionFilter[]).map((sec) => (
            <button
              key={sec}
              aria-pressed={sectionFilter === sec}
              onClick={() => handleSectionChange(sec)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                sectionFilter === sec ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {sec === "all" ? "All" : sec === "ads-traffic" ? "Ads" : sec === "sales-pipeline" ? "Sales" : sec === "customer-success" ? "CS" : "Finance"}
            </button>
          ))}
        </div>

        <div className="flex gap-1 rounded-lg bg-secondary/50 p-0.5">
          {(["severity", "confidence"] as SortMode[]).map((mode) => (
            <button
              key={mode}
              aria-pressed={sortMode === mode}
              onClick={() => handleSortChange(mode)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                sortMode === mode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-xl border border-border bg-card">
            <p className="text-sm text-muted-foreground">No insights match current filters</p>
          </div>
        ) : (
          paginatedInsights.map((insight) => <InsightCardFull key={insight.id} insight={insight} />)
        )}
      </div>

      {filtered.length > 0 && (
        <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Showing {(page - 1) * pageSize + 1}&ndash;{Math.min(page * pageSize, filtered.length)} of {filtered.length}
            </span>
            <select
              aria-label="Results per page"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
            >
              <option value={10}>10 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors bg-secondary/50 text-foreground hover:bg-secondary disabled:opacity-40 disabled:pointer-events-none"
            >
              Previous
            </button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors bg-secondary/50 text-foreground hover:bg-secondary disabled:opacity-40 disabled:pointer-events-none"
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
