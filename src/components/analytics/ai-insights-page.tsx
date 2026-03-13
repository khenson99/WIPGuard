"use client";

import Link from "next/link";
import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock3,
  Layers3,
  ListTodo,
  Pin,
  RadioTower,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { InsightCardFull } from "./insight-card-full";
import { StatCard } from "./stat-card";
import { DismissUndoToast } from "./dismiss-undo-toast";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-error-banner";
import { DashboardStaleBanner } from "@/components/dashboard/dashboard-stale-banner";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";
import { populateConnectionStatus } from "@/hooks/use-connection-status";
import { useInsightPreferences } from "@/lib/hooks/use-insight-preferences";
import type { AiInsight, AnalyticsDashboardData, AnalyticsSectionId } from "@/lib/analytics/types";
import { getAnalyticsPrimarySectionById, getAnalyticsSubSectionById } from "@/lib/analytics/section-registry";

type SeverityFilter = "all" | "critical" | "warning" | "info";
type SectionFilter = "all" | AnalyticsSectionId;
type SortMode = "urgency" | "severity" | "confidence";

const SEVERITY_ORDER: Record<AiInsight["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const PAGE_SIZES = [10, 25, 50] as const;

const SECTION_LABELS: Partial<Record<AnalyticsSectionId, string>> = {
  "ads-traffic": "Ads & Traffic",
  finance: "Finance",
  "sales-pipeline": "Sales Pipeline",
  retention: "Retention",
  "customer-success": "Customer Success",
  "customer-journey": "Customer Journey",
  "demo-analytics": "Demo Analytics",
  "process-analytics": "Process Analytics",
};

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function formatSectionLabel(section: AnalyticsSectionId): string {
  return SECTION_LABELS[section] ?? section.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function severityClass(severity: AiInsight["severity"]): string {
  switch (severity) {
    case "critical":
      return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
    case "warning":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "info":
      return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  }
}

function getInsightDestination(insight: AiInsight): { href: string; label: string } | null {
  if (insight.subsectionId) {
    const subsection = getAnalyticsSubSectionById(insight.subsectionId);
    if (subsection) {
      return {
        href: subsection.path,
        label: subsection.label,
      };
    }
  }

  const primary = getAnalyticsPrimarySectionById(insight.section);
  if (!primary) return null;
  return {
    href: primary.path,
    label: primary.label,
  };
}

function getInsightPriorityScore(insight: AiInsight): number {
  const severityWeight =
    insight.severity === "critical"
      ? 100
      : insight.severity === "warning"
        ? 60
        : 25;
  const actionWeight = Math.min(insight.actions.length, 3) * 12;
  const evidenceWeight = Math.min(insight.evidence.length, 4) * 4;
  const crossDomainWeight = insight.crossDomain ? 14 : 0;
  const stalePenalty = insight.stale ? -10 : 0;
  const confidenceWeight = Math.round(insight.confidence * 30);

  return severityWeight + actionWeight + evidenceWeight + crossDomainWeight + confidenceWeight + stalePenalty;
}

function uniqueInsightsBySection(insights: AiInsight[]): AiInsight[] {
  const seen = new Set<AnalyticsSectionId>();
  const result: AiInsight[] = [];

  for (const insight of insights) {
    if (seen.has(insight.section)) continue;
    seen.add(insight.section);
    result.push(insight);
  }

  return result;
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
    getLastUpdatedAt: (payload) => payload.meta?.servedAt ?? payload.lastFullRefresh ?? null,
    mapError: (error) =>
      error instanceof Error && error.message ? error.message : "Could not load insights.",
  });

  const data = resource.data;
  const loading = resource.loading && !resource.data;
  const error = resource.error;
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("urgency");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(25);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionableOnly, setActionableOnly] = useState(false);
  const [crossDomainOnly, setCrossDomainOnly] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showDismissed, setShowDismissed] = useState(false);
  const [recentlyDismissed, setRecentlyDismissed] = useState<{ id: string; title: string } | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const {
    isPinned,
    isDismissed,
    togglePin,
    dismiss,
    undoDismiss,
    createTaskFromInsight,
    creatingTaskForId,
    sortAndFilter,
  } = useInsightPreferences();

  useEffect(() => {
    if (!data) return;
    populateConnectionStatus(data.freshness, data);
  }, [data]);

  useEffect(() => {
    if (!autoRefresh) return;

    const intervalId = window.setInterval(() => {
      void resource.refresh();
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [autoRefresh, resource.refresh]);

  const allInsights = useMemo(() => data?.aiInsights?.global ?? [], [data?.aiInsights?.global]);

  const sectionOptions = useMemo(
    () =>
      Array.from(new Set(allInsights.map((insight) => insight.section))).sort((left, right) =>
        formatSectionLabel(left).localeCompare(formatSectionLabel(right))
      ),
    [allInsights]
  );

  const dismissedCount = useMemo(
    () => allInsights.filter((insight) => isDismissed(insight.id)).length,
    [allInsights, isDismissed]
  );

  const filtered = useMemo(() => {
    let result = sortAndFilter(allInsights, showDismissed);
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();

    if (severityFilter !== "all") {
      result = result.filter((insight) => insight.severity === severityFilter);
    }
    if (sectionFilter !== "all") {
      result = result.filter((insight) => insight.section === sectionFilter);
    }
    if (actionableOnly) {
      result = result.filter((insight) => insight.actions.length > 0);
    }
    if (crossDomainOnly) {
      result = result.filter((insight) => Boolean(insight.crossDomain));
    }
    if (normalizedQuery.length > 0) {
      result = result.filter((insight) => {
        const haystacks = [
          insight.title,
          insight.why,
          formatSectionLabel(insight.section),
          ...insight.actions.map((action) => action.label),
          ...insight.evidence.map((evidence) => `${evidence.source} ${evidence.metric} ${evidence.value}`),
        ];
        return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery));
      });
    }

    const pinned = result.filter((insight) => isPinned(insight.id));
    const unpinned = result.filter((insight) => !isPinned(insight.id));

    const sortFn = (left: AiInsight, right: AiInsight) =>
      sortMode === "urgency"
        ? getInsightPriorityScore(right) - getInsightPriorityScore(left)
        : sortMode === "severity"
          ? SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
          : right.confidence - left.confidence;

    return [...pinned, ...unpinned.sort(sortFn)];
  }, [
    actionableOnly,
    allInsights,
    crossDomainOnly,
    deferredSearchQuery,
    isPinned,
    sectionFilter,
    severityFilter,
    showDismissed,
    sortAndFilter,
    sortMode,
  ]);

  useEffect(() => {
    startTransition(() => {
      setPage(1);
    });
  }, [actionableOnly, crossDomainOnly, deferredSearchQuery, pageSize, sectionFilter, severityFilter, showDismissed, sortMode]);

  const totalInsights = filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalInsights / pageSize));
  const currentPage = clamp(page, 1, pageCount);
  const pageStartIndex = (currentPage - 1) * pageSize;
  const pageEndIndexExclusive = Math.min(pageStartIndex + pageSize, totalInsights);
  const pagedInsights = useMemo(
    () => filtered.slice(pageStartIndex, pageEndIndexExclusive),
    [filtered, pageEndIndexExclusive, pageStartIndex]
  );
  const pagedInsightsWithDestinations = useMemo(
    () =>
      pagedInsights.map((insight) => ({
        insight,
        destination: getInsightDestination(insight),
      })),
    [pagedInsights]
  );

  const visiblePages = useMemo(() => {
    if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
    const pages = new Set<number>([1, pageCount]);
    for (let p = currentPage - 2; p <= currentPage + 2; p += 1) {
      if (p > 1 && p < pageCount) {
        pages.add(p);
      }
    }
    return Array.from(pages).sort((left, right) => left - right);
  }, [currentPage, pageCount]);

  const criticalCount = allInsights.filter((insight) => insight.severity === "critical").length;
  const warningCount = allInsights.filter((insight) => insight.severity === "warning").length;
  const actionableCount = allInsights.filter((insight) => insight.actions.length > 0).length;
  const crossDomainCount = allInsights.filter((insight) => insight.crossDomain).length;
  const staleInsightCount = allInsights.filter((insight) => insight.stale).length;
  const pinnedCount = allInsights.filter((insight) => isPinned(insight.id)).length;
  const avgConfidence =
    allInsights.length > 0
      ? allInsights.reduce((sum, insight) => sum + insight.confidence, 0) / allInsights.length
      : 0;

  const filteredCriticalCount = filtered.filter((insight) => insight.severity === "critical").length;
  const filteredWarningCount = filtered.filter((insight) => insight.severity === "warning").length;
  const filteredInfoCount = filtered.filter((insight) => insight.severity === "info").length;

  const sectionStats = useMemo(() => {
    const counts = new Map<AnalyticsSectionId, { total: number; critical: number; warning: number }>();

    for (const insight of allInsights) {
      const current = counts.get(insight.section) ?? { total: 0, critical: 0, warning: 0 };
      current.total += 1;
      if (insight.severity === "critical") current.critical += 1;
      if (insight.severity === "warning") current.warning += 1;
      counts.set(insight.section, current);
    }

    return Array.from(counts.entries())
      .map(([section, stats]) => ({
        section,
        label: formatSectionLabel(section),
        ...stats,
      }))
      .sort((left, right) => {
        if (right.critical !== left.critical) return right.critical - left.critical;
        if (right.warning !== left.warning) return right.warning - left.warning;
        return right.total - left.total;
      });
  }, [allInsights]);

  const topSection = sectionStats[0] ?? null;
  const visibleActionQueue = useMemo(
    () =>
      filtered
        .flatMap((insight) =>
          insight.actions.map((action, index) => ({
            id: `${insight.id}:${action.label}:${index}`,
            label: action.label,
            insight,
            insightTitle: insight.title,
            sectionLabel: formatSectionLabel(insight.section),
            severity: insight.severity,
            destination: getInsightDestination(insight),
            score: getInsightPriorityScore(insight),
          }))
        )
        .sort((left, right) => right.score - left.score)
        .slice(0, 6),
    [filtered]
  );
  const pinnedInsights = useMemo(
    () => filtered.filter((insight) => isPinned(insight.id)).slice(0, 4),
    [filtered, isPinned]
  );
  const nowInsights = useMemo(
    () =>
      uniqueInsightsBySection(
        filtered.filter((insight) => getInsightPriorityScore(insight) >= 115)
      ).slice(0, 3),
    [filtered]
  );
  const watchInsights = useMemo(
    () =>
      uniqueInsightsBySection(
        filtered.filter((insight) => (isPinned(insight.id) || insight.severity === "warning") && getInsightPriorityScore(insight) < 115)
      ).slice(0, 3),
    [filtered, isPinned]
  );
  const exploreInsights = useMemo(
    () =>
      uniqueInsightsBySection(
        filtered.filter((insight) => !nowInsights.some((item) => item.id === insight.id) && !watchInsights.some((item) => item.id === insight.id))
      ).slice(0, 3),
    [filtered, nowInsights, watchInsights]
  );
  const activeFilterCount =
    (severityFilter !== "all" ? 1 : 0) +
    (sectionFilter !== "all" ? 1 : 0) +
    (deferredSearchQuery.trim().length > 0 ? 1 : 0) +
    (actionableOnly ? 1 : 0) +
    (crossDomainOnly ? 1 : 0) +
    (showDismissed ? 1 : 0) +
    (sortMode !== "urgency" ? 1 : 0);
  const operatorNarrative = useMemo(() => {
    if (totalInsights === 0) {
      return "No visible signals in the current view. Reset filters or broaden the working set.";
    }

    const parts: string[] = [];
    if (filteredCriticalCount > 0) {
      parts.push(`${filteredCriticalCount} critical issue${filteredCriticalCount === 1 ? "" : "s"} need immediate review`);
    }
    if (topSection) {
      parts.push(`${topSection.label} is carrying the most pressure`);
    }
    if (visibleActionQueue.length > 0) {
      parts.push(`${visibleActionQueue.length} concrete move${visibleActionQueue.length === 1 ? "" : "s"} are queued`);
    }
    if (crossDomainOnly || filtered.some((insight) => insight.crossDomain)) {
      const crossDomainVisible = filtered.filter((insight) => insight.crossDomain).length;
      if (crossDomainVisible > 0) {
        parts.push(`${crossDomainVisible} cross-domain signal${crossDomainVisible === 1 ? "" : "s"} may have compounding impact`);
      }
    }

    return parts.join(". ") + ".";
  }, [crossDomainOnly, filtered, filteredCriticalCount, topSection, totalInsights, visibleActionQueue.length]);

  const feedStatusLabel = resource.refreshing
    ? "Refreshing"
    : resource.stale
      ? "Cached"
      : "Live";
  const liveModeLabel = autoRefresh ? "Auto-refresh every minute" : "Manual refresh";

  const handleDismiss = useCallback(
    (insight: AiInsight) => {
      void dismiss(insight.id);
      setRecentlyDismissed({ id: insight.id, title: insight.title });
    },
    [dismiss]
  );

  const handleUndoDismiss = useCallback(() => {
    if (!recentlyDismissed) return;
    void undoDismiss(recentlyDismissed.id);
    setRecentlyDismissed(null);
  }, [recentlyDismissed, undoDismiss]);

  const handleCreateTask = useCallback(
    async (insight: AiInsight) => {
      setTaskError(null);
      try {
        await createTaskFromInsight(insight);
      } catch {
        setTaskError(`Failed to create task for "${insight.title}". Please try again.`);
      }
    },
    [createTaskFromInsight]
  );

  const resetFilters = useCallback(() => {
    setSeverityFilter("all");
    setSectionFilter("all");
    setSortMode("urgency");
    setPageSize(25);
    setSearchQuery("");
    setActionableOnly(false);
    setCrossDomainOnly(false);
    setShowDismissed(false);
  }, []);

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">Loading insights…</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <DashboardEmptyState
            title="AI insights unavailable"
            message={error ?? "Could not load insights."}
            actionLabel="Rerun insights"
            onAction={resource.refresh}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-6 px-4 py-4 md:px-6 md:py-6 xl:px-8">
          <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1.25fr)_360px] lg:p-6">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-foreground">
                    <RadioTower className="h-3.5 w-3.5" />
                    {feedStatusLabel} insight feed
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" />
                    {liveModeLabel}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs text-muted-foreground">
                    {criticalCount + warningCount} active priorities
                  </span>
                  {resource.fromCache ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-700 dark:text-amber-300">
                      Warm cache
                    </span>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                    AI Insights
                  </h1>
                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                    A live operator workspace for cross-functional signals. Prioritize what needs action now,
                    see which teams are carrying the most pressure, and move from diagnosis to execution without
                    bouncing across tabs.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border bg-background/70 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Last refresh</p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {resource.lastUpdatedAt ? new Date(resource.lastUpdatedAt).toLocaleString() : "Unknown"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {resource.refreshing ? "Refreshing now." : "Ready for operator review."}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background/70 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Top pressure area</p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {topSection ? topSection.label : "No hotspots yet"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {topSection
                        ? `${topSection.critical} critical · ${topSection.warning} warnings`
                        : "No section currently has elevated pressure."}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background/70 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Operator queue</p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {actionableCount} actionable plays
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {pinnedCount} pinned · {dismissedCount} dismissed · {crossDomainCount} cross-domain
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-border bg-[linear-gradient(180deg,rgba(59,130,246,0.10),rgba(15,23,42,0.02))] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Mission control</p>
                    <h2 className="mt-2 text-lg font-semibold text-foreground">Current working set</h2>
                  </div>
                  <button
                    type="button"
                    onClick={resource.refresh}
                    disabled={resource.refreshing}
                    aria-label="Rerun AI insights"
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-70"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${resource.refreshing ? "animate-spin" : ""}`} />
                    {resource.refreshing ? "Rerunning..." : "Rerun AI insights"}
                  </button>
                </div>

                <label className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/70 p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Live mode</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Keep this page fresh with an automatic one-minute refresh cadence.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoRefresh}
                    aria-label="Toggle live mode"
                    onClick={() => setAutoRefresh((current) => !current)}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                      autoRefresh ? "bg-primary/80" : "bg-secondary"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        autoRefresh ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </label>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-card/70 p-4">
                    <p className="text-xs text-muted-foreground">Visible insights</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{totalInsights}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {totalInsights > 0 ? `${pageStartIndex + 1}-${pageEndIndexExclusive}` : "0-0"} on this page
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-card/70 p-4">
                    <p className="text-xs text-muted-foreground">Signal quality</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                      {(avgConfidence * 100).toFixed(0)}%
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Average confidence across current insights</p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Critical</span>
                    <span className="font-medium text-foreground">{filteredCriticalCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Warnings</span>
                    <span className="font-medium text-foreground">{filteredWarningCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Info</span>
                    <span className="font-medium text-foreground">{filteredInfoCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Dismissed hidden</span>
                    <span className="font-medium text-foreground">{dismissedCount}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {!error && resource.stale ? (
            <DashboardStaleBanner
              lastUpdatedAt={resource.lastUpdatedAt}
              onRefresh={resource.refresh}
              refreshing={resource.refreshing}
              label="Showing cached AI insights while the latest rerun completes or retries."
            />
          ) : null}

          {error ? <DashboardErrorBanner message={error} onRetry={resource.refresh} retryLabel="Rerun insights" /> : null}

          {taskError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/10">
              <p className="text-sm text-red-600 dark:text-red-400">{taskError}</p>
            </div>
          ) : null}

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="Live Feed"
              value={feedStatusLabel}
              subtitle={staleInsightCount > 0 ? `${staleInsightCount} insights rely on stale inputs` : "All visible signals are fresh"}
              icon={Activity}
              iconColor={resource.stale ? "text-amber-500" : "text-emerald-500"}
            />
            <StatCard
              label="Needs Action"
              value={criticalCount + warningCount}
              subtitle={`${criticalCount} critical · ${warningCount} warning`}
              icon={AlertTriangle}
              iconColor="text-red-500"
            />
            <StatCard
              label="Actionable Plays"
              value={actionableCount}
              subtitle="Insights that already include recommended next moves"
              icon={ListTodo}
              iconColor="text-primary"
            />
            <StatCard
              label="Sections Impacted"
              value={sectionStats.length}
              subtitle={topSection ? `${topSection.label} is carrying the most pressure` : "No section hotspots yet"}
              icon={Layers3}
              iconColor="text-violet-500"
            />
            <StatCard
              label="Pinned Watchlist"
              value={pinnedCount}
              subtitle="Insights you have pinned for repeated review"
              icon={Pin}
              iconColor="text-amber-500"
            />
          </section>

          <section className="rounded-3xl border border-border bg-card p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Operator brief</h2>
                <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">{operatorNarrative}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {filteredCriticalCount > 0 ? (
                  <span className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-700 dark:text-red-300">
                    {filteredCriticalCount} critical
                  </span>
                ) : null}
                {filteredWarningCount > 0 ? (
                  <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                    {filteredWarningCount} warning
                  </span>
                ) : null}
                {visibleActionQueue.length > 0 ? (
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-foreground">
                    {visibleActionQueue.length} queued moves
                  </span>
                ) : null}
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            {[
              {
                title: "Now",
                subtitle: "Immediate issues that need operator attention.",
                icon: AlertTriangle,
                iconClass: "text-red-500",
                insights: nowInsights,
              },
              {
                title: "Watch",
                subtitle: "Tracked risks and pinned signals worth repeated review.",
                icon: Pin,
                iconClass: "text-amber-500",
                insights: watchInsights,
              },
              {
                title: "Explore",
                subtitle: "Lower-severity or cross-domain signals with leverage.",
                icon: Sparkles,
                iconClass: "text-violet-500",
                insights: exploreInsights,
              },
            ].map((lane) => {
              const LaneIcon = lane.icon;
              return (
                <section key={lane.title} className="rounded-3xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">{lane.title}</h2>
                      <p className="text-sm text-muted-foreground">{lane.subtitle}</p>
                    </div>
                    <LaneIcon className={`h-4 w-4 ${lane.iconClass}`} />
                  </div>

                  <div className="mt-4 space-y-3">
                    {lane.insights.length > 0 ? (
                      lane.insights.map((insight) => {
                        const destination = getInsightDestination(insight);
                        return (
                          <div key={insight.id} className="rounded-2xl border border-border bg-background/60 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">{insight.title}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {formatSectionLabel(insight.section)} · {(insight.confidence * 100).toFixed(0)}% confidence · urgency {getInsightPriorityScore(insight)}
                                </p>
                              </div>
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${severityClass(insight.severity)}`}>
                                {insight.severity}
                              </span>
                            </div>
                            {destination ? (
                              <Link
                                href={destination.href}
                                className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-foreground underline decoration-border underline-offset-4 hover:text-primary"
                              >
                                Open {destination.label}
                              </Link>
                            ) : null}
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-2xl border border-dashed border-border bg-background/60 p-4 text-sm text-muted-foreground">
                        No matching insights in this lane for the current filters.
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <section className="rounded-3xl border border-border bg-card p-4 md:p-5">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Filter and sort</h2>
                      <p className="text-sm text-muted-foreground">
                        Tighten the working set by severity, team, and ranking logic.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right text-xs text-muted-foreground">
                        <p>{totalInsights} visible</p>
                        <p>{allInsights.length} total signals</p>
                      </div>
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        Reset{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="space-y-4">
                      <label className="block space-y-2">
                        <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          Search
                        </span>
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <input
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Search titles, evidence, actions"
                            className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                          />
                        </div>
                      </label>

                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Severity</p>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Severity filter">
                          {(["all", "critical", "warning", "info"] as SeverityFilter[]).map((severity) => (
                            <button
                              key={severity}
                              type="button"
                              onClick={() => setSeverityFilter(severity)}
                              aria-pressed={severityFilter === severity}
                              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                                severityFilter === severity
                                  ? "border-primary bg-primary/10 text-foreground"
                                  : "border-border bg-background text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {severity === "all" ? "All" : severity.charAt(0).toUpperCase() + severity.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Section</p>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Section filter">
                          <button
                            type="button"
                            onClick={() => setSectionFilter("all")}
                            aria-pressed={sectionFilter === "all"}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                              sectionFilter === "all"
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border bg-background text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            All sections
                          </button>
                          {sectionOptions.map((section) => (
                            <button
                              key={section}
                              type="button"
                              onClick={() => setSectionFilter(section)}
                              aria-pressed={sectionFilter === section}
                              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                                sectionFilter === section
                                  ? "border-primary bg-primary/10 text-foreground"
                                  : "border-border bg-background text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {formatSectionLabel(section)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Signal focus</p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            aria-pressed={actionableOnly}
                            onClick={() => setActionableOnly((current) => !current)}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                              actionableOnly
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border bg-background text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <ListTodo className="h-3.5 w-3.5" />
                            Actionable only
                          </button>
                          <button
                            type="button"
                            aria-pressed={crossDomainOnly}
                            onClick={() => setCrossDomainOnly((current) => !current)}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                              crossDomainOnly
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border bg-background text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            Cross-domain only
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                      <label className="space-y-2">
                        <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Sort</span>
                        <select
                          className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                          value={sortMode}
                          onChange={(event) => setSortMode(event.target.value as SortMode)}
                          aria-label="Sort mode"
                        >
                          <option value="urgency">Urgency score</option>
                          <option value="severity">Severity first</option>
                          <option value="confidence">Confidence first</option>
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Per page</span>
                        <select
                          id="ai-insights-page-size"
                          className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                          value={String(pageSize)}
                          onChange={(event) => setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number])}
                          aria-label="Per page"
                        >
                          {PAGE_SIZES.map((size) => (
                            <option key={size} value={String(size)}>
                              {size}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                {filtered.length === 0 ? (
                  <div className="flex min-h-48 items-center justify-center rounded-3xl border border-border bg-card p-8">
                    <div className="text-center">
                      <p className="text-base font-medium text-foreground">No insights match the current filters</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Broaden the severity or section filters to reopen the working set.
                      </p>
                      {activeFilterCount > 0 ? (
                        <button
                          type="button"
                          onClick={resetFilters}
                          className="mt-4 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                        >
                          Reset filters
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  pagedInsightsWithDestinations.map(({ insight, destination }) => (
                    <InsightCardFull
                      key={insight.id}
                      insight={insight}
                      urgencyScore={getInsightPriorityScore(insight)}
                      destinationHref={destination?.href ?? null}
                      destinationLabel={destination?.label ?? null}
                      isPinned={isPinned(insight.id)}
                      onTogglePin={() => void togglePin(insight.id)}
                      onDismiss={() => handleDismiss(insight)}
                      onCreateTask={() => void handleCreateTask(insight)}
                      isCreatingTask={creatingTaskForId === insight.id}
                    />
                  ))
                )}
              </section>

              {dismissedCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowDismissed((previous) => !previous)}
                  className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {showDismissed
                    ? "Hide dismissed insights"
                    : `Show ${dismissedCount} dismissed insight${dismissedCount !== 1 ? "s" : ""}`}
                </button>
              ) : null}

              {totalInsights > 0 ? (
                <div className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs text-muted-foreground" aria-live="polite">
                      Page {currentPage} of {pageCount}
                    </p>
                    <span className="text-xs text-muted-foreground">•</span>
                    <p className="text-xs text-muted-foreground">
                      Showing{" "}
                      <span className="font-medium text-foreground tabular-nums">{pageStartIndex + 1}</span>-
                      <span className="font-medium text-foreground tabular-nums">{pageEndIndexExclusive}</span> of{" "}
                      <span className="font-medium text-foreground tabular-nums">{totalInsights}</span>
                    </p>
                  </div>

                  {pageCount > 1 ? (
                    <nav aria-label="AI insights pagination" className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        className="h-9 rounded-xl border border-border bg-background px-3 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => setPage(currentPage - 1)}
                        disabled={currentPage <= 1}
                        aria-label="Previous page"
                      >
                        Prev
                      </button>

                      {visiblePages.map((pageNumber, index) => {
                        const previous = visiblePages[index - 1];
                        const showEllipsis = previous != null && pageNumber - previous > 1;
                        return (
                          <span key={pageNumber} className="flex items-center gap-1">
                            {showEllipsis ? (
                              <span className="px-1 text-xs text-muted-foreground" aria-hidden="true">
                                …
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className={`h-9 min-w-9 rounded-xl border px-3 text-xs font-medium tabular-nums ${
                                pageNumber === currentPage
                                  ? "border-primary bg-primary/10 text-foreground"
                                  : "border-border bg-background text-muted-foreground hover:text-foreground"
                              }`}
                              onClick={() => setPage(pageNumber)}
                              aria-label={`Go to page ${pageNumber}`}
                              aria-current={pageNumber === currentPage ? "page" : undefined}
                            >
                              {pageNumber}
                            </button>
                          </span>
                        );
                      })}

                      <button
                        type="button"
                        className="h-9 rounded-xl border border-border bg-background px-3 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => setPage(currentPage + 1)}
                        disabled={currentPage >= pageCount}
                        aria-label="Next page"
                      >
                        Next
                      </button>
                    </nav>
                  ) : null}
                </div>
              ) : null}
            </div>

            <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
              <section className="rounded-3xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Action queue</h2>
                    <p className="text-sm text-muted-foreground">Highest-leverage moves across the visible set.</p>
                  </div>
                  <ListTodo className="h-4 w-4 text-muted-foreground" />
                </div>

                <div className="mt-4 space-y-3">
                  {visibleActionQueue.length > 0 ? (
                    visibleActionQueue.map((action) => (
                      <div key={action.id} className="rounded-2xl border border-border bg-background/60 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{action.label}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{action.insightTitle}</p>
                          </div>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${severityClass(action.severity)}`}>
                            {action.severity}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <p className="text-xs text-muted-foreground">{action.sectionLabel}</p>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => void handleCreateTask(action.insight)}
                              disabled={creatingTaskForId === action.insight.id}
                              className="text-xs font-medium text-foreground underline decoration-border underline-offset-4 hover:text-primary disabled:opacity-50"
                            >
                              {creatingTaskForId === action.insight.id ? "Creating..." : "Create task"}
                            </button>
                            {action.destination ? (
                              <Link
                                href={action.destination.href}
                                className="text-xs font-medium text-foreground underline decoration-border underline-offset-4 hover:text-primary"
                              >
                                Open {action.destination.label}
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border bg-background/60 p-4 text-sm text-muted-foreground">
                      No explicit action recommendations in the current view.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Hotspots by section</h2>
                    <p className="text-sm text-muted-foreground">Where the current pressure is concentrated.</p>
                  </div>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </div>

                <div className="mt-4 space-y-3">
                  {sectionStats.length > 0 ? (
                    sectionStats.slice(0, 6).map((stat) => (
                      <div key={stat.section} className="rounded-2xl border border-border bg-background/60 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">{stat.label}</p>
                          <span className="text-sm font-semibold tabular-nums text-foreground">{stat.total}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {stat.critical > 0 ? (
                            <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-300">
                              {stat.critical} critical
                            </span>
                          ) : null}
                          {stat.warning > 0 ? (
                            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                              {stat.warning} warning
                            </span>
                          ) : null}
                          {stat.critical === 0 && stat.warning === 0 ? (
                            <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                              informational only
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">
                      No section hotspots yet.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Pinned watchlist</h2>
                    <p className="text-sm text-muted-foreground">The items you are actively tracking.</p>
                  </div>
                  <Pin className="h-4 w-4 text-muted-foreground" />
                </div>

                <div className="mt-4 space-y-3">
                  {pinnedInsights.length > 0 ? (
                    pinnedInsights.map((insight) => (
                      <div key={insight.id} className="rounded-2xl border border-border bg-background/60 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">{insight.title}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${severityClass(insight.severity)}`}>
                            {insight.severity}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{formatSectionLabel(insight.section)}</p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border bg-background/60 p-4 text-sm text-muted-foreground">
                      Pin important insights to keep a standing watchlist here.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-border bg-card p-4">
                <h2 className="text-base font-semibold text-foreground">View summary</h2>
                <p className="text-sm text-muted-foreground">A quick read on the current filtered set.</p>

                <div className="mt-4 grid gap-3">
                  <div className="rounded-2xl border border-border bg-background/60 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Critical</span>
                      <span className="font-semibold tabular-nums text-foreground">{filteredCriticalCount}</span>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border bg-background/60 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Warnings</span>
                      <span className="font-semibold tabular-nums text-foreground">{filteredWarningCount}</span>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border bg-background/60 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Info</span>
                      <span className="font-semibold tabular-nums text-foreground">{filteredInfoCount}</span>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border bg-background/60 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Cross-domain</span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {filtered.filter((insight) => insight.crossDomain).length}
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            </aside>
          </div>

          {recentlyDismissed ? (
            <DismissUndoToast
              insightTitle={recentlyDismissed.title}
              onUndo={handleUndoDismiss}
              onClose={() => setRecentlyDismissed(null)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
