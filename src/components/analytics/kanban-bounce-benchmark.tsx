"use client";

import { TrendingDown, TrendingUp, Minus, Target } from "lucide-react";
import type { KanbanBounceComparison } from "@/lib/analytics/types";
import { StatCard } from "@/components/analytics/stat-card";
import { SectionCard } from "./dashboard-primitives";

interface KanbanBounceBenchmarkProps {
  comparison: KanbanBounceComparison | null | undefined;
}

/**
 * Renders the Free Kanban Generator bounce-rate benchmark:
 *   - 4 stat tiles: Kanban page bounce / Site avg / Δ vs site / Period delta
 *   - Peer-page ranking with the Kanban path highlighted
 *
 * Returns null when no comparison data is available — the parent decides
 * whether to render an empty state.
 */
export function KanbanBounceBenchmark({ comparison }: KanbanBounceBenchmarkProps) {
  if (!comparison) return null;

  const {
    matchedPaths,
    kanbanBounceRate,
    kanbanSessions,
    siteBounceRate,
    deltaVsSitePts,
    periodDeltaPts,
    rankAmongPeers,
    peerCount,
    peerPages,
    verdict,
  } = comparison;

  // ── Format helpers ──
  const fmtPct = (frac: number) => `${(frac * 100).toFixed(1)}%`;
  const fmtPts = (pts: number, opts: { sign?: boolean } = {}) => {
    const sign = opts.sign && pts >= 0 ? "+" : "";
    return `${sign}${pts.toFixed(1)}pt${Math.abs(pts) === 1 ? "" : "s"}`;
  };

  // For bounce rate, LOWER is better — so a NEGATIVE delta is a POSITIVE outcome.
  const deltaIsImprovement = deltaVsSitePts < 0;
  const deltaChangeType = deltaIsImprovement ? "positive" : deltaVsSitePts > 0 ? "negative" : "neutral";

  const periodIsImprovement = typeof periodDeltaPts === "number" && periodDeltaPts < 0;
  const periodChangeType =
    typeof periodDeltaPts !== "number"
      ? "neutral"
      : periodIsImprovement
        ? "positive"
        : periodDeltaPts > 0
          ? "negative"
          : "neutral";

  const verdictLabel =
    verdict === "better" ? "Beating site avg" : verdict === "worse" ? "Below site avg" : "On par with site avg";
  const verdictIcon = verdict === "better" ? TrendingDown : verdict === "worse" ? TrendingUp : Minus;
  const verdictColor =
    verdict === "better" ? "text-emerald-500" : verdict === "worse" ? "text-red-500" : "text-muted-foreground";

  // Peer ranking copy.
  const rankCopy =
    rankAmongPeers === null
      ? "—"
      : `#${rankAmongPeers} of ${peerCount + 1}`;
  const rankSubtitle =
    rankAmongPeers === null
      ? "No peer pages with sessions"
      : rankAmongPeers === 1
        ? "Best engagement on site"
        : rankAmongPeers <= 3
          ? "Top-3 engagement"
          : rankAmongPeers > peerCount / 2
            ? "Below median engagement"
            : "Above median engagement";

  // Bar chart bounds — pad min/max so bars don't bunch at the edges.
  const allBounces = [kanbanBounceRate, ...peerPages.map((p) => p.bounceRate)];
  const minBounce = Math.min(...allBounces);
  const maxBounce = Math.max(...allBounces);
  const range = Math.max(maxBounce - minBounce, 0.05);

  // Combined ranked list (Kanban + peers) sorted by bounce ascending
  // for the visualization.
  const ranked = [
    {
      path: matchedPaths[0] ?? "/kanban-template",
      bounceRate: kanbanBounceRate,
      sessions: kanbanSessions,
      isKanban: true,
    },
    ...peerPages.map((p) => ({ ...p, isKanban: false })),
  ].sort((a, b) => a.bounceRate - b.bounceRate);

  const subtitleParts: string[] = [];
  if (matchedPaths.length === 1) {
    subtitleParts.push(`Matched ${matchedPaths[0]}`);
  } else if (matchedPaths.length > 1) {
    subtitleParts.push(`Matched ${matchedPaths.length} Kanban variants`);
  }
  subtitleParts.push(`${kanbanSessions.toLocaleString()} sessions in window`);

  return (
    <SectionCard
      title="Bounce Rate vs. Site & Peer Pages"
      subtitle={subtitleParts.join(" • ")}
    >
      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Kanban Page Bounce"
          value={fmtPct(kanbanBounceRate)}
          subtitle={verdictLabel}
          icon={verdictIcon}
          iconColor={verdictColor}
        />
        <StatCard
          label="Site Avg Bounce"
          value={fmtPct(siteBounceRate)}
          subtitle="All pages, all channels"
          icon={Target}
        />
        <StatCard
          label="Δ vs Site"
          value={fmtPts(deltaVsSitePts, { sign: true })}
          change={deltaIsImprovement ? "Better than site" : deltaVsSitePts > 0 ? "Worse than site" : "Even with site"}
          changeType={deltaChangeType}
        />
        <StatCard
          label="vs Prior 30d"
          value={typeof periodDeltaPts === "number" ? fmtPts(periodDeltaPts, { sign: true }) : "—"}
          change={
            typeof periodDeltaPts === "number"
              ? periodIsImprovement
                ? "Improving"
                : periodDeltaPts > 0
                  ? "Worsening"
                  : "Flat"
              : "No prior data"
          }
          changeType={periodChangeType}
        />
      </div>

      {/* Peer rank + ranked bar list */}
      <div className="mt-5 space-y-4">
        <div className="flex items-baseline justify-between border-b border-border pb-2">
          <span className="text-sm font-medium text-foreground">
            Peer ranking by bounce rate
          </span>
          <span className="text-xs text-muted-foreground">
            {rankCopy} <span className="text-[11px]">({rankSubtitle})</span>
          </span>
        </div>

        <div className="space-y-1.5" data-testid="kanban-bounce-peer-list">
          {ranked.map((row, i) => {
            const widthPct =
              range === 0
                ? 50
                : Math.max(8, ((row.bounceRate - minBounce) / range) * 100);
            const barColor = row.isKanban
              ? "#fc5a29"
              : row.bounceRate <= siteBounceRate
                ? "#22c55e"
                : "#94a3b8";
            return (
              <div
                key={`${row.path}-${i}`}
                className={`flex items-center gap-3 rounded-md px-2 py-1 ${
                  row.isKanban ? "bg-primary/10 ring-1 ring-primary/30" : ""
                }`}
                data-kanban-row={row.isKanban ? "true" : "false"}
              >
                <span
                  className={`w-44 truncate text-xs ${
                    row.isKanban
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground"
                  }`}
                  title={row.path}
                >
                  {row.path}
                  {row.isKanban ? " ★" : ""}
                </span>
                <div className="flex-1">
                  <div className="relative h-5 overflow-hidden rounded-md bg-secondary/40">
                    <div
                      className="h-full rounded-md transition-all"
                      style={{
                        width: `${widthPct}%`,
                        backgroundColor: barColor,
                        minWidth: "32px",
                      }}
                    />
                  </div>
                </div>
                <span className="w-16 text-right text-xs tabular-nums text-foreground">
                  {fmtPct(row.bounceRate)}
                </span>
                <span className="w-20 text-right text-[11px] tabular-nums text-muted-foreground">
                  {row.sessions.toLocaleString()} sess
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}
