"use client";

import { useMemo } from "react";
import type { JourneyPath } from "@/lib/analytics/types";
import { DashboardSectionCard } from "../dashboard-section-card";

interface PathExplorationProps {
  paths: JourneyPath[];
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
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
              <th className="pb-2 pl-4">Top Conversion Paths</th>
              <th className="pb-2 text-right">Accounts</th>
              <th className="pb-2 text-right">Kanban Actions</th>
              <th className="pb-2 text-right">Free Trials</th>
              <th className="pb-2 text-right">Demos</th>
              <th className="pb-2 text-right">Average Value</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((row) => (
              <tr key={row.id} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                <td className="py-3 pl-4">
                  <div className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">
                    {row.sequenceStr.split(" → ").map((step, idx, arr) => (
                      <span key={`${row.id}-${idx}`} className="flex items-center gap-1.5">
                        <span className="max-w-[140px] truncate rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                          {step}
                        </span>
                        {idx < arr.length - 1 && (
                          <span className="text-muted-foreground">→</span>
                        )}
                      </span>
                    ))}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Avg. {row.avgDays} days to close
                  </div>
                </td>
                <td className="py-3 text-right tabular-nums text-foreground">
                  {row.count}
                </td>
                <td className="py-3 text-right tabular-nums text-muted-foreground">
                  {row.kanbanCards > 0 ? row.kanbanCards : "-"}
                </td>
                <td className="py-3 text-right tabular-nums text-muted-foreground">
                  {row.freeTrials > 0 ? row.freeTrials : "-"}
                </td>
                <td className="py-3 text-right tabular-nums text-muted-foreground">
                  {row.demos > 0 ? row.demos : "-"}
                </td>
                <td className="py-3 text-right font-medium tabular-nums text-foreground">
                  ${row.value.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardSectionCard>
  );
}
