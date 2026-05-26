"use client";

/**
 * Dev-only visual preview for the Kanban bounce-rate comparison UI.
 *
 * Renders both the overview "spotlight" tile (as seen on
 * /analytics/website-traffic) and the full benchmark card (as seen on
 * /analytics/ads-coda-kanban) using a hardcoded fixture, so the new
 * components can be visually QA'd without GA credentials or a database.
 *
 * Mounted outside the (dashboard) route group so it does not require auth.
 * Safe to delete after the feature ships.
 */

import { KanbanBounceBenchmark } from "@/components/analytics/kanban-bounce-benchmark";
import type {
  KanbanBounceComparison,
  AnalyticsDashboardData,
} from "@/lib/analytics/types";

// Fixture modeled on the May 6 doc-association data:
// /kanban-template: 1,760 sessions, 42% bounce (slightly worse than site).
// Site-wide bounce: 50%.
const FIXTURE_COMPARISON: KanbanBounceComparison = {
  matchedPaths: ["/kanban-template"],
  kanbanBounceRate: 0.42,
  kanbanSessions: 1760,
  siteBounceRate: 0.5,
  deltaVsSitePts: -8,
  periodDeltaPts: -3.2,
  rankAmongPeers: 2,
  peerCount: 5,
  peerPages: [
    { path: "/product", bounceRate: 0.35, sessions: 5120 },
    { path: "/blog/wp-limits", bounceRate: 0.48, sessions: 1390 },
    { path: "/pricing", bounceRate: 0.55, sessions: 1820 },
    { path: "/about", bounceRate: 0.62, sessions: 480 },
    { path: "/blog/kanban-101", bounceRate: 0.71, sessions: 320 },
  ],
  verdict: "better",
};

const FIXTURE_DATA = {
  googleAnalytics: { kanbanBounceComparison: FIXTURE_COMPARISON },
} as unknown as AnalyticsDashboardData;

export default function KanbanBouncePreviewPage() {
  const comparison = FIXTURE_DATA.googleAnalytics?.kanbanBounceComparison;
  if (!comparison) return null;

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-6xl space-y-10">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Dev preview
          </p>
          <h1 className="text-2xl font-bold text-foreground">
            Kanban Generator bounce-rate comparison
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hardcoded fixture (no GA call). Top: overview spotlight tile.
            Bottom: full benchmark card from the Coda Kanban tab.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Overview spotlight (/analytics/website-traffic)
          </h2>
          <PreviewSpotlight comparison={comparison} />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Full benchmark card (/analytics/ads-coda-kanban)
          </h2>
          <KanbanBounceBenchmark comparison={comparison} />
        </section>
      </div>
    </div>
  );
}

/* Inline duplicate of KanbanBounceSpotlight so the preview doesn't need the
   full MarketingTabNew shell. Kept narrowly in sync with marketing-tab-new.tsx. */
import Link from "next/link";
import { ArrowRight, TrendingDown, TrendingUp, Minus } from "lucide-react";

function PreviewSpotlight({ comparison }: { comparison: KanbanBounceComparison }) {
  const {
    kanbanBounceRate,
    siteBounceRate,
    deltaVsSitePts,
    periodDeltaPts,
    verdict,
    matchedPaths,
    kanbanSessions,
  } = comparison;

  const fmtPctFrac = (frac: number) => `${(frac * 100).toFixed(1)}%`;
  const fmtPts = (pts: number) =>
    `${pts >= 0 ? "+" : ""}${pts.toFixed(1)}pt${Math.abs(pts) === 1 ? "" : "s"}`;

  const Icon =
    verdict === "better" ? TrendingDown : verdict === "worse" ? TrendingUp : Minus;
  const accentClass =
    verdict === "better"
      ? "border-emerald-500/40 bg-emerald-500/5"
      : verdict === "worse"
        ? "border-red-500/40 bg-red-500/5"
        : "border-border bg-card";
  const iconClass =
    verdict === "better"
      ? "text-emerald-500"
      : verdict === "worse"
        ? "text-red-500"
        : "text-muted-foreground";
  const headline =
    verdict === "better"
      ? "Kanban whitepaper outperforming site"
      : verdict === "worse"
        ? "Kanban whitepaper bouncing harder than site"
        : "Kanban whitepaper on par with site";
  const matchedSummary =
    matchedPaths.length === 1 ? matchedPaths[0] : `${matchedPaths.length} Kanban paths`;

  return (
    <Link
      href="/analytics/ads-coda-kanban"
      className={`flex flex-wrap items-center gap-4 rounded-xl border p-4 transition-colors hover:bg-secondary/30 ${accentClass}`}
    >
      <div className={`rounded-lg bg-background/60 p-2 ${iconClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{headline}</p>
        <p className="text-xs text-muted-foreground">
          {matchedSummary} • {kanbanSessions.toLocaleString()} sessions
        </p>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Bounce
          </p>
          <p className="text-xl font-bold tabular-nums text-foreground">
            {fmtPctFrac(kanbanBounceRate)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            vs Site ({fmtPctFrac(siteBounceRate)})
          </p>
          <p
            className={`text-sm font-semibold tabular-nums ${
              deltaVsSitePts < 0
                ? "text-emerald-500"
                : deltaVsSitePts > 0
                  ? "text-red-500"
                  : "text-muted-foreground"
            }`}
          >
            {fmtPts(deltaVsSitePts)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            vs Prior 30d
          </p>
          <p
            className={`text-sm font-semibold tabular-nums ${
              typeof periodDeltaPts !== "number"
                ? "text-muted-foreground"
                : periodDeltaPts < 0
                  ? "text-emerald-500"
                  : periodDeltaPts > 0
                    ? "text-red-500"
                    : "text-muted-foreground"
            }`}
          >
            {typeof periodDeltaPts === "number" ? fmtPts(periodDeltaPts) : "—"}
          </p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
