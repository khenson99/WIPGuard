"use client";

import { useState, useMemo } from "react";
import { Calendar, Search, CheckCircle, XCircle, Clock, RotateCw } from "lucide-react";
import type { AnalyticsDashboardData, DemoOutcome } from "@/lib/analytics/types";

const OUTCOME_CONFIG: Record<DemoOutcome, { label: string; color: string; icon: typeof CheckCircle }> = {
  completed: { label: "Completed", color: "#22c55e", icon: CheckCircle },
  "no-show": { label: "No-Show", color: "#ef4444", icon: XCircle },
  rescheduled: { label: "Rescheduled", color: "#fbbf24", icon: RotateCw },
  pending: { label: "Pending", color: "#6b7280", icon: Clock },
};

export function DemoSchedulingView({ data }: { data: AnalyticsDashboardData | null }) {
  const demo = data?.demoAnalytics;
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    if (!demo) return [];
    return demo.demos.filter((d) => {
      if (search) {
        const q = search.toLowerCase();
        if (!d.dealName.toLowerCase().includes(q) && !d.contactEmail?.toLowerCase().includes(q)) return false;
      }
      if (outcomeFilter !== "all" && d.outcome !== outcomeFilter) return false;
      return true;
    });
  }, [demo, search, outcomeFilter]);

  if (!demo || demo.totalScheduled === 0) return <EmptyState />;

  // Weekly density
  const weeklyDensity = useMemo(() => {
    if (!demo.weeklyTrend.length) return [];
    const maxScheduled = Math.max(...demo.weeklyTrend.map((w) => w.scheduled), 1);
    return demo.weeklyTrend.slice(-12).map((w) => ({
      ...w,
      density: w.scheduled / maxScheduled,
    }));
  }, [demo.weeklyTrend]);

  return (
    <div className="space-y-6">
      {/* Weekly Density */}
      {weeklyDensity.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-foreground">Demo Scheduling Density</h3>
          <p className="mb-4 text-xs text-muted-foreground">Weekly demo volume (darker = more demos)</p>
          <div className="flex gap-1">
            {weeklyDensity.map((w) => (
              <div key={w.week} className="flex-1">
                <div
                  className="mx-auto h-10 rounded-md transition-colors"
                  style={{
                    backgroundColor: `rgba(67, 121, 240, ${0.1 + w.density * 0.9})`,
                  }}
                  title={`${w.week}: ${w.scheduled} scheduled, ${w.completed} completed, ${w.noShows} no-shows`}
                />
                <p className="mt-1 text-center text-[9px] tabular-nums text-muted-foreground">
                  {w.week.slice(5)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outcome Summary Pills */}
      <div className="flex flex-wrap gap-2">
        {(["completed", "no-show", "rescheduled", "pending"] as DemoOutcome[]).map((outcome) => {
          const config = OUTCOME_CONFIG[outcome];
          const count = demo.demos.filter((d) => d.outcome === outcome).length;
          const Icon = config.icon;
          return (
            <button
              key={outcome}
              type="button"
              onClick={() => setOutcomeFilter(outcomeFilter === outcome ? "all" : outcome)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                outcomeFilter === outcome
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3 w-3" style={{ color: config.color }} />
              {config.label}: {count}
            </button>
          );
        })}
      </div>

      {/* Search + Records */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search deal or contact…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-card py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {filtered.length} of {demo.totalScheduled} demos
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 text-left font-medium">Deal</th>
                <th className="pb-2 text-left font-medium">Source</th>
                <th className="pb-2 text-left font-medium">Scheduled</th>
                <th className="pb-2 text-left font-medium">Outcome</th>
                <th className="pb-2 text-right font-medium">Follow-Up</th>
                <th className="pb-2 text-right font-medium">Days to Next</th>
                <th className="pb-2 text-right font-medium">Resulting Stage</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 50).map((d) => {
                const config = OUTCOME_CONFIG[d.outcome];
                return (
                  <tr key={d.dealId} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5">
                      <p className="font-medium text-foreground">{d.dealName}</p>
                      {d.contactEmail && (
                        <p className="text-[10px] text-muted-foreground">{d.contactEmail}</p>
                      )}
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground">{d.source}</td>
                    <td className="py-2.5 text-xs tabular-nums text-muted-foreground">
                      {new Date(d.scheduledAt).toLocaleDateString()}
                    </td>
                    <td className="py-2.5">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                        style={{ backgroundColor: config.color }}
                      >
                        {config.label}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-xs">
                      {d.followUpSent ? (
                        <CheckCircle className="ml-auto h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right text-xs tabular-nums text-muted-foreground">
                      {d.daysToNextStage != null ? `${d.daysToNextStage}d` : "—"}
                    </td>
                    <td className="py-2.5 text-right text-xs text-muted-foreground">
                      {d.resultingStage ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 50 && (
          <p className="text-center text-xs text-muted-foreground">
            Showing 50 of {filtered.length} demos. Use filters to narrow.
          </p>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <Calendar className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No demo scheduling data available</p>
        <p className="text-xs text-muted-foreground">Connect HubSpot to track demo activity</p>
      </div>
    </div>
  );
}
