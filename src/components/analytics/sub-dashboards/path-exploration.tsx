"use client";

import { useMemo, useState } from "react";
import type { JourneyPath, CustomerJourneyRecord } from "@/lib/analytics/types";
import { DrilldownPanel, DrilldownDrawer } from "../drilldown-panel";
import {
  Megaphone,
  Search,
  Users,
  CreditCard,
  LayoutDashboard,
  MessageCircle,
  Headset,
  ArrowRight,
  MousePointerClick,
  Route,
  Calendar,
  DollarSign,
} from "lucide-react";

interface PathExplorationProps {
  paths: JourneyPath[];
  /** Optional: journey records for drill-down matching. */
  journeys?: CustomerJourneyRecord[];
}

// Helper to get styling and icons for different traffic sources/steps
function getStepFormat(stepName: string) {
  const normalized = stepName.toLowerCase();

  if (normalized.includes("google ads")) {
    return { icon: Megaphone, colorClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20" };
  }
  if (normalized.includes("meta ads")) {
    return { icon: MousePointerClick, colorClass: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/20" };
  }
  if (normalized.includes("reddit ads")) {
    return { icon: MessageCircle, colorClass: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20" };
  }
  if (normalized.includes("organic")) {
    return { icon: Search, colorClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" };
  }
  if (normalized.includes("sales pipeline")) {
    return { icon: Users, colorClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" };
  }
  if (normalized.includes("billing") || normalized.includes("trial")) {
    return { icon: CreditCard, colorClass: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20" };
  }
  if (normalized.includes("kanban")) {
    return { icon: LayoutDashboard, colorClass: "bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/20" };
  }
  if (normalized.includes("support")) {
    return { icon: Headset, colorClass: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/20" };
  }

  return { icon: ArrowRight, colorClass: "bg-secondary text-secondary-foreground border-border/40" };
}

function formatChannelName(ch: string): string {
  if (ch === "google-ads") return "Google Ads";
  if (ch === "meta-ads") return "Meta Ads";
  if (ch === "reddit-ads") return "Reddit Ads";
  if (ch === "google-analytics") return "Organic Traffic";
  if (ch === "hubspot") return "Sales Pipeline";
  if (ch === "stripe") return "Billing/Trial";
  if (ch === "coda") return "Kanban App";
  if (ch === "pylon") return "Support (Pylon)";
  return ch;
}

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function PathExploration({ paths, journeys }: PathExplorationProps) {
  const [selectedPathIdx, setSelectedPathIdx] = useState<number | null>(null);

  const chartData = useMemo(() => {
    return paths.slice(0, 10).map((path, idx) => {
      // path.sequence is the runtime field (array of channel IDs)
      const rawSequence: string[] = (path as unknown as { sequence: string[] }).sequence ?? [];
      const sequenceNames = rawSequence.map(formatChannelName);
      return {
        id: `path-${idx}`,
        rawSequence,
        sequenceStr: sequenceNames.join(" \u2192 "),
        sequenceArray: sequenceNames,
        count: path.count,
        kanbanCards: path.kanbanCards,
        freeTrials: path.freeTrials,
        demos: path.demos,
        avgDays: path.avgDaysToClose,
        value: path.avgValue,
      };
    });
  }, [paths]);

  // Match journeys to the selected path
  const matchingJourneys = useMemo(() => {
    if (selectedPathIdx == null || !journeys) return [];
    const row = chartData[selectedPathIdx];
    if (!row) return [];
    const pathKey = row.rawSequence.join(" \u2192 ");
    return journeys.filter((j) => {
      const channels = [...new Set(j.touchpoints.map((tp) => tp.channel))];
      return channels.join(" \u2192 ") === pathKey;
    });
  }, [selectedPathIdx, journeys, chartData]);

  const selectedRow = selectedPathIdx != null ? chartData[selectedPathIdx] : null;

  if (!chartData || chartData.length === 0) {
    return (
      <DrilldownPanel
        title="Path Exploration"
        subtitle="Top conversion paths by customer journey"
        isEmpty
        emptyMessage="No journey path data available."
      >
        <span />
      </DrilldownPanel>
    );
  }

  return (
    <>
      <DrilldownPanel
        title="Path Exploration"
        subtitle="Top conversion paths by customer journey"
        csvExport={{
          filename: `path-exploration-${new Date().toISOString().slice(0, 10)}.csv`,
          headers: ["Path", "Accounts", "Kanban Actions", "Free Trials", "Demos", "Avg Days to Close", "Average Value"],
          rows: () =>
            chartData.map((row) => [
              row.sequenceStr,
              String(row.count),
              String(row.kanbanCards),
              String(row.freeTrials),
              String(row.demos),
              String(row.avgDays),
              String(row.value),
            ]),
        }}
      >
        <div className="overflow-x-auto pb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                <th className="pb-3 pl-4">Top Conversion Paths</th>
                <th className="pb-3 text-right">Accounts</th>
                <th className="pb-3 text-right">Kanban Actions</th>
                <th className="pb-3 text-right">Free Trials</th>
                <th className="pb-3 text-right">Demos</th>
                <th className="pb-3 pr-4 text-right">Average Value</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((row, idx) => (
                <tr
                  key={row.id}
                  role={journeys ? "button" : undefined}
                  tabIndex={journeys ? 0 : undefined}
                  onClick={journeys ? () => setSelectedPathIdx(idx) : undefined}
                  onKeyDown={
                    journeys
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedPathIdx(idx);
                          }
                        }
                      : undefined
                  }
                  className={`group border-b border-border/40 transition-all hover:bg-gradient-to-r hover:from-muted/40 hover:to-transparent${
                    journeys ? " cursor-pointer" : ""
                  }`}
                >
                  <td className="py-4 pl-4">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 font-medium">
                      {row.sequenceArray.map((step, stepIdx, arr) => {
                        const { icon: Icon, colorClass } = getStepFormat(step);
                        return (
                          <span key={`${row.id}-${stepIdx}`} className="flex items-center gap-1.5 shrink-0">
                            <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs shadow-sm transition-transform group-hover:scale-[1.02] ${colorClass}`}>
                              <Icon className="h-3 w-3" />
                              {step}
                            </span>
                            {stepIdx < arr.length - 1 && (
                              <ArrowRight className="h-3 w-3 text-muted-foreground/50 mx-0.5" />
                            )}
                          </span>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground font-medium flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
                      Avg. {row.avgDays} days to close
                    </div>
                  </td>
                  <td className="py-4 text-right tabular-nums text-foreground font-medium">
                    {row.count}
                  </td>
                  <td className="py-4 text-right tabular-nums text-muted-foreground">
                    {row.kanbanCards > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-[2rem] rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
                        {row.kanbanCards}
                      </span>
                    ) : "-"}
                  </td>
                  <td className="py-4 text-right tabular-nums text-muted-foreground">
                    {row.freeTrials > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-[2rem] rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
                        {row.freeTrials}
                      </span>
                    ) : "-"}
                  </td>
                  <td className="py-4 text-right tabular-nums text-muted-foreground">
                    {row.demos > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-[2rem] rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
                        {row.demos}
                      </span>
                    ) : "-"}
                  </td>
                  <td className="py-4 pr-4 pl-4 text-right tabular-nums text-foreground">
                    <span className="inline-flex items-center justify-center rounded-md bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-600 dark:text-emerald-400">
                      ${row.value.toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DrilldownPanel>

      {/* Path detail drawer */}
      <DrilldownDrawer
        open={selectedPathIdx != null}
        onClose={() => setSelectedPathIdx(null)}
        title="Path Detail"
        subtitle={selectedRow ? `${selectedRow.sequenceStr} \u2014 ${selectedRow.count} accounts` : ""}
      >
        {selectedRow && (
          <div className="space-y-4">
            {/* Path summary stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border/60 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Accounts</p>
                <p className="text-lg font-semibold text-foreground">{selectedRow.count}</p>
              </div>
              <div className="rounded-lg border border-border/60 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Avg Value</p>
                <p className="text-lg font-semibold text-foreground">${selectedRow.value.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border/60 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Avg Days to Close</p>
                <p className="text-lg font-semibold text-foreground">{selectedRow.avgDays}d</p>
              </div>
              <div className="rounded-lg border border-border/60 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Demos</p>
                <p className="text-lg font-semibold text-foreground">{selectedRow.demos}</p>
              </div>
            </div>

            {/* Matching journeys list */}
            <div>
              <h4 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Matching Journeys ({matchingJourneys.length})
              </h4>
              {matchingJourneys.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  {journeys ? "No matching journeys found for this path." : "Journey data not available for drill-down."}
                </p>
              ) : (
                <div className="space-y-2">
                  {matchingJourneys.slice(0, 30).map((j) => (
                    <div key={j.dealId} className="rounded-lg border border-border/60 px-3 py-2.5">
                      <p className="text-sm font-medium text-foreground">{j.dealName}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Route className="h-3 w-3" />
                          {j.touchpoints.length} touches
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {j.daysInPipeline}d in pipeline
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {fmt$(j.value)}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {j.currentStage} · {j.contactEmail ?? "No contact"}
                      </p>
                    </div>
                  ))}
                  {matchingJourneys.length > 30 && (
                    <p className="text-center text-xs text-muted-foreground">
                      Showing 30 of {matchingJourneys.length} journeys.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </DrilldownDrawer>
    </>
  );
}
