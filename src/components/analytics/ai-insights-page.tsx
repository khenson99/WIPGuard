"use client";

import { useState, useEffect, useMemo } from "react";
import { InsightCardFull } from "./insight-card-full";
import { StatCard } from "./stat-card";
import type { AnalyticsDashboardData, AnalyticsSectionId } from "@/lib/analytics/types";
import { AlertTriangle, AlertCircle, Info, BarChart3 } from "lucide-react";

type SeverityFilter = "all" | "critical" | "warning" | "info";
type SectionFilter = "all" | AnalyticsSectionId;
type SortMode = "severity" | "confidence";

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

function readOverviewCache(): AnalyticsDashboardData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("analytics:overview");
    return raw ? (JSON.parse(raw) as AnalyticsDashboardData) : null;
  } catch {
    return null;
  }
}

export function AiInsightsPage() {
  const [data, setData] = useState<AnalyticsDashboardData | null>(readOverviewCache);
  const [loading, setLoading] = useState(() => readOverviewCache() === null);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("severity");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    fetch("/api/analytics?section=overview", { signal: controller.signal })
      .then((r) => r.json())
      .then((json: AnalyticsDashboardData) => {
        if (!active) return;
        setData(json);
        sessionStorage.setItem("analytics:overview", JSON.stringify(json));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const allInsights = data?.aiInsights?.global ?? [];

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
              onClick={() => setSeverityFilter(sev)}
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
              onClick={() => setSectionFilter(sec)}
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
              onClick={() => setSortMode(mode)}
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
          filtered.map((insight) => <InsightCardFull key={insight.id} insight={insight} />)
        )}
      </div>
    </div>
  );
}
