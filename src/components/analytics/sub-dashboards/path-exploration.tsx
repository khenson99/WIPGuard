"use client";

import { useMemo } from "react";
import type { JourneyPath } from "@/lib/analytics/types";
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

interface PathExplorationProps {
  paths: JourneyPath[];
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

export function PathExploration({ paths }: PathExplorationProps) {
  const chartData = useMemo(() => {
    return paths.slice(0, 10).map((path, idx) => {
      const sequenceNames = path.sequence.map((ch) => {
        // format names nicely
        if (ch === "google-ads") return "Google Ads";
        if (ch === "meta-ads") return "Meta Ads";
        if (ch === "reddit-ads") return "Reddit Ads";
        if (ch === "google-analytics") return "Organic Traffic";
        if (ch === "hubspot") return "Sales Pipeline";
        if (ch === "stripe") return "Billing/Trial";
        if (ch === "coda") return "Kanban App";
        if (ch === "pylon") return "Support (Pylon)";
        return ch;
      });
      return {
        id: `path-${idx}`,
        sequenceStr: sequenceNames.join(" → "),
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
    <DashboardSectionCard title="Path Exploration">
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
                className="group border-b border-border/40 transition-all hover:bg-gradient-to-r hover:from-muted/40 hover:to-transparent"
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
  );
}
