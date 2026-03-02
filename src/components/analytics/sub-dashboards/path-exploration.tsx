"use client";

import { useMemo, useState } from "react";
import type { CustomerJourneyRecord, JourneyPath } from "@/lib/analytics/types";
import { DashboardSectionCard } from "../dashboard-section-card";
import { 
  Megaphone, 
  Search, 
  Users, 
  CreditCard, 
  LayoutDashboard, 
  MessageCircle, 
  Headset, 
  ArrowRight,
  MousePointerClick
} from "lucide-react";
import { matchJourneysToPath } from "@/lib/analytics/path-matching";
import { PathDetailDrawer } from "@/components/analytics/path-detail-drawer";
import { PathSankeyDiagram } from "@/components/analytics/path-sankey-diagram";
import type { PathData } from "@/lib/analytics/sankey-layout";

interface PathExplorationProps {
  paths: JourneyPath[];
  journeys?: CustomerJourneyRecord[];
}

// Helper to get styling and icons for different traffic sources/steps
function getStepFormat(stepName: string) {
  // Normalize string for safety
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
  
  // Default
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

export function PathExploration({ paths, journeys }: PathExplorationProps) {
  const [selectedPath, setSelectedPath] = useState<{ rawSequence: string[]; displaySequence: string[] } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const chartData = useMemo(() => {
    return paths.slice(0, 10).map((path, idx) => {
      const sequenceNames = path.sequence.map(formatChannelName);
      return {
        id: `path-${idx}`,
        sequenceStr: sequenceNames.join(" → "),
        sequenceArray: sequenceNames,
        rawSequence: path.sequence as string[],
        count: path.count,
        kanbanCards: path.kanbanCards,
        freeTrials: path.freeTrials,
        demos: path.demos,
        avgDays: path.avgDaysToClose,
        value: path.avgValue,
      };
    });
  }, [paths]);

  const sankeyPaths = useMemo<PathData[]>(() => {
    return chartData.map((row) => ({
      stages: row.sequenceArray,
      count: row.count,
    }));
  }, [chartData]);

  const matchedJourneys = useMemo(() => {
    if (!selectedPath || !journeys?.length) return [];
    return matchJourneysToPath(journeys, selectedPath.rawSequence as never);
  }, [selectedPath, journeys]);

  function openDrawerForPath(rawSequence: string[], displaySequence: string[]) {
    setSelectedPath({ rawSequence, displaySequence });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelectedPath(null);
  }

  if (!chartData || chartData.length === 0) {
    return (
      <DashboardSectionCard title="Path Exploration">
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          No journey path data available.
        </div>
      </DashboardSectionCard>
    );
  }

  return (
    <>
      <DashboardSectionCard title="Path Exploration">
        {/* Sankey visualization */}
        <div className="mb-6">
          <p className="mb-2 text-xs text-muted-foreground">
            Top path flow — click a connection to see matching deals
          </p>
          <PathSankeyDiagram
            paths={sankeyPaths}
            topN={10}
            onPathClick={(stages) => {
              // Map display names back to raw channel keys for matching
              const rawSequence = stages.map((s) => {
                const entry = chartData.find((row) => row.sequenceArray.includes(s));
                if (!entry) return s;
                const idx = entry.sequenceArray.indexOf(s);
                return entry.rawSequence[idx] ?? s;
              });
              openDrawerForPath(rawSequence, stages);
            }}
            className="rounded-lg border border-border/40 bg-muted/20 px-4 py-3"
          />
        </div>

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
              {chartData.map((row) => (
                <tr 
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`View deals for path: ${row.sequenceStr}`}
                  className="group border-b border-border/40 transition-all hover:bg-gradient-to-r hover:from-muted/40 hover:to-transparent cursor-pointer focus-visible:outline-none focus-visible:bg-muted/40"
                  onClick={() => openDrawerForPath(row.rawSequence, row.sequenceArray)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openDrawerForPath(row.rawSequence, row.sequenceArray);
                    }
                  }}
                >
                  <td className="py-4 pl-4">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 font-medium">
                      {row.sequenceStr.split(" → ").map((step, idx, arr) => {
                        const { icon: Icon, colorClass } = getStepFormat(step);
                        return (
                          <span key={`${row.id}-${idx}`} className="flex items-center gap-1.5 shrink-0">
                            <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs shadow-sm transition-transform group-hover:scale-[1.02] ${colorClass}`}>
                              <Icon className="h-3 w-3" />
                              {step}
                            </span>
                            {idx < arr.length - 1 && (
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
      </DashboardSectionCard>

      <PathDetailDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        pathStages={selectedPath?.displaySequence ?? []}
        journeys={matchedJourneys}
      />
    </>
  );
}
