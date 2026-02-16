"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { ANALYTICS_PRIMARY_SECTIONS } from "@/lib/analytics/section-registry";
import { AnalyticsTimeRangeControls } from "@/components/analytics/time-range-controls";

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

const STATUS_CLASS: Record<string, string> = {
  connected: "text-emerald-600",
  partial: "text-amber-600",
  missing: "text-muted-foreground",
};

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

export function AnalyticsSummaryPage() {
  const searchParams = useSearchParams();
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [overview, setOverview] = useState<AnalyticsDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const rangeQuery = useMemo(() => buildRangeQuery(searchParams), [searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      Promise.all([
        fetch(`/api/analytics/summary${rangeQuery ? `?${rangeQuery}` : ""}`, { cache: "no-store" }).then((response) =>
          response.json()
        ),
        fetch(`/api/analytics?section=overview${rangeQuery ? `&${rangeQuery}` : ""}`, { cache: "no-store" }).then((response) =>
          response.json()
        ),
      ])
        .then(([summaryPayload, overviewPayload]) => {
          setSummary(summaryPayload as SummaryPayload);
          setOverview(overviewPayload as AnalyticsDashboardData);
        })
        .catch(() => {
          setSummary(null);
          setOverview(null);
        })
        .finally(() => setLoading(false));
    }, 0);

    return () => window.clearTimeout(timer);
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
    <div className="space-y-6 p-4">
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

      {overview?.funnelJourney && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Marketing to Sales to Customer Success Funnel</h2>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            {overview.funnelJourney.stages.map((stage) => (
              <div key={stage.id} className="rounded-lg border border-border/60 bg-background px-3 py-2">
                <p className="text-xs text-muted-foreground">{stage.label}</p>
                <p className="mt-1 text-xl font-semibold text-foreground">{stage.count.toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground">
                  {stage.conversionFromPrev === null ? "Entry stage" : `${stage.conversionFromPrev.toFixed(1)}% from previous`}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1">
            {overview.funnelJourney.narrative.map((line, index) => (
              <p key={index} className="text-xs text-muted-foreground">
                {line}
              </p>
            ))}
          </div>
        </section>
      )}

      {overview?.recommendations && overview.recommendations.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Proactive Recommendations</h2>
          <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
            {overview.recommendations.map((item) => (
              <div key={item.id} className="rounded-lg border border-border/60 bg-background px-3 py-2">
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.insight}</p>
                <p className="mt-1 text-xs text-foreground">{item.suggestedAction}</p>
              </div>
            ))}
          </div>
        </section>
      )}

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
                <span className={`text-xs uppercase ${STATUS_CLASS[section?.status ?? "missing"]}`}>
                  {section?.status ?? "missing"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{primary.description}</p>
              {section && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {section.connectedCount}/{section.integrationCount} integrations connected
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
