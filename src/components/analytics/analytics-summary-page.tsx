"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Layers, Users, FolderKanban, AlertTriangle, CheckCircle2,
  ArrowRight, Globe, DollarSign, Target, HeartPulse,
} from "lucide-react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { ANALYTICS_PRIMARY_SECTIONS } from "@/lib/analytics/section-registry";
import { AnalyticsTimeRangeControls } from "@/components/analytics/time-range-controls";
import { LifecycleFunnelPanel } from "@/components/analytics/lifecycle-funnel-panel";
import { AiInsightsPanel } from "@/components/analytics/ai-insights-panel";
import { StatCard } from "@/components/analytics/stat-card";
import { StatCardGridSkeleton, SectionSkeleton } from "@/components/analytics/skeleton";

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
    status: "connected" | "partial" | "degraded" | "missing";
    integrationCount: number;
    connectedCount: number;
  }>;
}

const STATUS_CONFIG: Record<string, { color: string; dot: string; label: string }> = {
  connected: { color: "text-emerald-500", dot: "bg-emerald-500", label: "Connected" },
  degraded: { color: "text-amber-500", dot: "bg-amber-500", label: "Degraded" },
  partial: { color: "text-amber-500", dot: "bg-amber-500", label: "Partial" },
  missing: { color: "text-muted-foreground", dot: "bg-muted-foreground/40", label: "Not Connected" },
};

const SECTION_ICONS: Record<string, React.ElementType> = {
  "ads-traffic": Globe,
  "finance": DollarSign,
  "sales-pipeline": Target,
  "customer-success": HeartPulse,
};

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
    return { summary: parsed.summary, overview: parsed.overview };
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
        setLoading(false);
      });
    } else {
      queueMicrotask(() => {
        if (!active) return;
        setLoading(true);
      });
    }

    Promise.all([
      fetch(`/api/analytics/summary${rangeQuery ? `?${rangeQuery}` : ""}`, { signal: controller.signal }).then((r) => r.json()),
      fetch(`/api/analytics?section=overview${rangeQuery ? `&${rangeQuery}` : ""}`, { signal: controller.signal }).then((r) => r.json()),
    ])
      .then(([summaryPayload, overviewPayload]) => {
        if (!active) return;
        const next = {
          summary: summaryPayload as SummaryPayload,
          overview: overviewPayload as AnalyticsDashboardData,
        };
        setSummary(next.summary);
        setOverview(next.overview);
        writeSummaryCache(rangeQuery, next);
      })
      .catch((err) => {
        if (!active || (err instanceof Error && err.name === "AbortError")) return;
        if (!cached) {
          setSummary(null);
          setOverview(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [rangeQuery]);

  return (
    <div className="h-full space-y-6 overflow-y-auto p-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Analytics Overview</h1>
          <p className="text-xs text-muted-foreground">
            Cross-platform insights across Ads, Finance, Sales, and Customer Success.
          </p>
        </div>
        <AnalyticsTimeRangeControls />
      </div>

      {/* Loading State */}
      {loading && !summary && (
        <div className="space-y-6">
          <StatCardGridSkeleton count={5} />
          <SectionSkeleton />
        </div>
      )}

      {/* Error State */}
      {!loading && !summary && (
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-border bg-card">
          <div className="text-center">
            <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Could not load analytics summary.</p>
            <p className="text-xs text-muted-foreground">Check your integration connections.</p>
          </div>
        </div>
      )}

      {/* Content */}
      {summary && (
        <>
          {/* KPI Highlights */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="animate-analytics-in animate-delay-0">
              <StatCard
                label="Discipline Coverage"
                value={`${summary.highlights.disciplineCoverage}%`}
                changeType={summary.highlights.disciplineCoverage >= 80 ? "positive" : summary.highlights.disciplineCoverage >= 50 ? "neutral" : "negative"}
                change={summary.highlights.disciplineCoverage >= 80 ? "Good coverage" : "Needs improvement"}
                icon={Layers}
              />
            </div>
            <div className="animate-analytics-in animate-delay-1">
              <StatCard
                label="Active Projects"
                value={summary.highlights.activeProjects.toLocaleString()}
                icon={FolderKanban}
              />
            </div>
            <div className="animate-analytics-in animate-delay-2">
              <StatCard
                label="Contributors"
                value={summary.highlights.activeContributors.toLocaleString()}
                icon={Users}
              />
            </div>
            <div className="animate-analytics-in animate-delay-3">
              <StatCard
                label="Total Tasks"
                value={summary.highlights.totalTasks.toLocaleString()}
                icon={CheckCircle2}
              />
            </div>
            <div className="animate-analytics-in animate-delay-4">
              <StatCard
                label="Overdue Tasks"
                value={summary.highlights.overdueTasks.toLocaleString()}
                changeType={summary.highlights.overdueTasks > 0 ? "negative" : "positive"}
                change={summary.highlights.overdueTasks > 0 ? `${summary.highlights.overdueTasks} overdue` : "All on track"}
                icon={AlertTriangle}
                iconColor="text-red-500 bg-red-500/10"
              />
            </div>
          </div>

          {/* Lifecycle & AI Panels */}
          <LifecycleFunnelPanel lifecycle={overview?.lifecycleFunnel ?? null} insights={overview?.aiInsights?.global ?? []} sectionFocus="all" />
          <AiInsightsPanel bundle={overview?.aiInsights ?? null} defaultFilter="all" />

          {/* Section Navigation Cards */}
          <div className="animate-analytics-slide-up grid grid-cols-1 gap-3 lg:grid-cols-4">
            {ANALYTICS_PRIMARY_SECTIONS.map((primary) => {
              const section = summary.primarySections.find((item) => item.id === primary.id);
              const status = STATUS_CONFIG[section?.status ?? "missing"];
              const SectionIcon = SECTION_ICONS[primary.id] || Layers;
              return (
                <Link
                  key={primary.id}
                  href={`${primary.path}${rangeQuery ? `?${rangeQuery}` : ""}`}
                  className="group rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:border-primary/40 hover:bg-secondary/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
                        <SectionIcon className="h-4 w-4" />
                      </div>
                      <h3 className="text-sm font-semibold text-foreground">{primary.label}</h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                      <span className={`text-[10px] uppercase tracking-wider ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{primary.description}</p>
                  {section && (
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: section.integrationCount }).map((_, i) => (
                          <div
                            key={i}
                            className={`h-1.5 w-4 rounded-full ${
                              i < section.connectedCount ? "bg-primary" : "bg-muted"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {section.connectedCount}/{section.integrationCount}
                      </span>
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-1 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    View details <ArrowRight className="h-3 w-3" />
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
