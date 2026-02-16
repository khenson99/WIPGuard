"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SummarySection {
  id: string;
  label: string;
  kind: "aggregate" | "source" | "ops";
  status: "connected" | "partial" | "missing";
  lastUpdatedAt: string | null;
  href: string;
  note?: string;
}

interface AnalyticsSummaryPayload {
  generatedAt: string;
  highlights: {
    totalTasks: number;
    overdueTasks: number;
    flowLeadTimeP50: number | null;
    activeFlowAlerts: number;
    reliabilityScore: number;
  };
  sections: SummarySection[];
}

const STATUS_CLASS: Record<SummarySection["status"], string> = {
  connected: "text-emerald-600",
  partial: "text-amber-600",
  missing: "text-muted-foreground",
};

export function AnalyticsSummaryPage() {
  const [data, setData] = useState<AnalyticsSummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics/summary", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => setData(payload as AnalyticsSummaryPayload))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading analytics summary...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Could not load analytics summary.</div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Analytics</h1>
        <p className="text-xs text-muted-foreground">
          Cross-section analytics dashboard with drill-down by section.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Total Tasks</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{data.highlights.totalTasks}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Overdue Tasks</p>
          <p className="mt-1 text-2xl font-semibold text-red-500">{data.highlights.overdueTasks}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Lead Time P50 (h)</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{data.highlights.flowLeadTimeP50 ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Flow Alerts</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">{data.highlights.activeFlowAlerts}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Reliability Score</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{data.highlights.reliabilityScore}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {data.sections.map((section) => (
          <Link
            key={section.id}
            href={section.href}
            className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">{section.label}</h3>
              <span className={`text-xs font-medium uppercase ${STATUS_CLASS[section.status]}`}>
                {section.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{section.kind}</p>
            {section.note && <p className="mt-2 text-xs text-muted-foreground">{section.note}</p>}
            {section.lastUpdatedAt && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Updated {new Date(section.lastUpdatedAt).toLocaleString()}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
