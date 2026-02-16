"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { ANALYTICS_PRIMARY_SECTIONS } from "@/lib/analytics/section-registry";
import { AnalyticsTimeRangeControls } from "@/components/analytics/time-range-controls";
import { LifecycleFunnelPanel } from "@/components/analytics/lifecycle-funnel-panel";
import { AiInsightsPanel } from "@/components/analytics/ai-insights-panel";
import { ConnectionDot } from "@/components/analytics/connection-dot";
import { populateConnectionStatus } from "@/hooks/use-connection-status";

interface SummaryPayload {
  generatedAt: string;
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
    status: "connected" | "partial" | "missing";
    integrationCount: number;
    connectedCount: number;
  }>;
}

const SUMMARY_CACHE_PREFIX = "analytics:summary:v1:";

interface CachedSummaryPayload {
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

function readSummaryCache(rangeQuery: string): CachedSummaryPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(summaryCacheKey(rangeQuery));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedSummaryPayload>;
    if (!parsed.summary || !parsed.overview) return null;
    return {
      summary: parsed.summary,
      overview: parsed.overview,
    };
  } catch {
    return null;
  }
}

function writeSummaryCache(rangeQuery: string, payload: CachedSummaryPayload): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(summaryCacheKey(rangeQuery), JSON.stringify(payload));
  } catch {
    // Ignore storage write failures (private browsing/storage quotas).
  }
}

export function AnalyticsSummaryPage() {
  const searchParams = useSearchParams();
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [overview, setOverview] = useState<AnalyticsDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const rangeQuery = useMemo(() => buildRangeQuery(searchParams), [searchParams]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const cached = readSummaryCache(rangeQuery);

    if (cached) {
      queueMicrotask(() => {
        if (!active) return;
        setSummary(cached.summary);
        setOverview(cached.overview);
        populateConnectionStatus(cached.overview?.freshness, cached.overview);
        setLoading(false);
      });
    } else {
      queueMicrotask(() => {
        if (!active) return;
        setLoading(true);
      });
    }

    Promise.all([
      fetch(`/api/analytics/summary${rangeQuery ? `?${rangeQuery}` : ""}`, { signal: controller.signal }).then((response) =>
        response.json()
      ),
      fetch(`/api/analytics?section=overview${rangeQuery ? `&${rangeQuery}` : ""}`, { signal: controller.signal }).then((response) =>
        response.json()
      ),
    ])
      .then(([summaryPayload, overviewPayload]) => {
        if (!active) return;
        const next = {
          summary: summaryPayload as SummaryPayload,
          overview: overviewPayload as AnalyticsDashboardData,
        };
        setSummary(next.summary);
        setOverview(next.overview);
        populateConnectionStatus(next.overview?.freshness, next.overview);
        writeSummaryCache(rangeQuery, next);
      })
      .catch((error) => {
        if (!active || (error instanceof Error && error.name === "AbortError")) return;
        if (!cached) {
          setSummary(null);
          setOverview(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [rangeQuery]);

  if (loading) {
    return (
      <div className="flex h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading analytics summary...
      </div>
    );
  }

  if (!summary) {
    return <div className="p-6 text-sm text-muted-foreground">Could not load analytics summary.</div>;
  }

  return (
    <div className="h-full space-y-6 overflow-y-auto p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Analytics Overview</h1>
          <p className="text-xs text-muted-foreground">
            Distilled cross-platform insights across Ads, Finance, Sales, and Customer Success.
          </p>
        </div>
        <AnalyticsTimeRangeControls />
      </div>

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
          const section = summary.primarySections.find((item) => item.id === primary.id);
          return (
            <Link
              key={primary.id}
              href={`${primary.path}${rangeQuery ? `?${rangeQuery}` : ""}`}
              className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">{primary.label}</h3>
                <ConnectionDot
                  status={section?.status === "connected" ? "connected" : section?.status === "partial" ? "stale" : "disconnected"}
                  provider={primary.label}
                  size="md"
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{primary.description}</p>
              {section && section.integrationCount > 0 && (
                <div className="mt-2 flex items-center gap-1">
                  {Array.from({ length: section.integrationCount }, (_, i) => (
                    <ConnectionDot
                      key={i}
                      status={i < section.connectedCount ? "connected" : "disconnected"}
                      size="sm"
                    />
                  ))}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
