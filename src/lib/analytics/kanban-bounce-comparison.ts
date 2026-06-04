/**
 * Bounce-rate benchmark for the Free Kanban Generator whitepaper landing page.
 *
 * Compares the matched Kanban landing-page(s) against:
 *  1. Site-wide bounce rate
 *  2. Peer top-N pages (sessions-weighted ranking)
 *  3. Period-over-period delta (current 30d vs prior 30d)
 *
 * GA4 returns `bounceRate` either as a fraction (0–1) or a percentage (0–100);
 * inputs are normalized to a 0–1 fraction before any math, so all outputs are
 * in 0–1 fraction form too. Percentage-point deltas in the output are in
 * "percentage points" (e.g. 42% – 50% = -8 pts).
 */

import type { GATopPage, KanbanBounceComparison } from "./types";

/** Path prefixes that identify the Free Kanban Generator landing pages. */
const KANBAN_PATH_PREFIXES = [
  "/kanban-template",
  "/free-kanban-generator",
  "/free-kanban",
  "/kanban",
] as const;

/**
 * Internal app routes that share the `/kanban` prefix but are NOT public
 * landing pages. We exclude these from matches.
 */
const KANBAN_PATH_EXCLUDES = [
  "/kanban-board",
  "/kanban-card",
  "/kanban-loop",
] as const;

/** Max path depth (segment count) for a public landing page. Filters out
 * deep internal routes like `/kanban-template/preview/abc/edit`. */
const MAX_LANDING_PAGE_DEPTH = 2;

/**
 * True if `path` looks like a public Kanban Generator landing page.
 * Strips query strings + trailing slashes before matching.
 */
export function isKanbanLandingPage(path: string): boolean {
  if (!path) return false;
  const cleaned = path.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const lower = cleaned.toLowerCase();

  for (const exclude of KANBAN_PATH_EXCLUDES) {
    if (lower === exclude || lower.startsWith(`${exclude}/`)) return false;
  }
  // Depth = number of non-empty segments
  const segments = lower.split("/").filter(Boolean);
  if (segments.length > MAX_LANDING_PAGE_DEPTH) return false;

  return KANBAN_PATH_PREFIXES.some(
    (prefix) => lower === prefix || lower.startsWith(`${prefix}/`)
  );
}

/**
 * Return only the Kanban landing pages in `topPages`.
 */
export function findKanbanPages(topPages: GATopPage[]): GATopPage[] {
  return topPages.filter((p) => isKanbanLandingPage(p.path));
}

/**
 * Normalize a GA4 bounce-rate value to a 0–1 fraction.
 * GA4 sometimes returns 0–1 fractions, sometimes 0–100 percentages.
 */
function normalizeBounce(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return raw > 1 ? raw / 100 : raw;
}

/**
 * Sessions-weighted bounce rate across a list of pages.
 * GA4 aggregates bounce that way, so weighted-by-sessions is the right
 * fold when combining multiple variant URLs of the same content.
 */
function weightedBounce(pages: GATopPage[]): { bounce: number; sessions: number } {
  let totalSessions = 0;
  let weightedSum = 0;
  for (const page of pages) {
    const sessions = Math.max(0, page.sessions ?? 0);
    if (sessions === 0) continue;
    const bounce = normalizeBounce(page.bounceRate ?? 0);
    weightedSum += bounce * sessions;
    totalSessions += sessions;
  }
  if (totalSessions === 0) return { bounce: 0, sessions: 0 };
  return { bounce: weightedSum / totalSessions, sessions: totalSessions };
}

/**
 * Threshold (in percentage points) below which Kanban bounce is considered
 * "comparable" to the site average rather than "better" or "worse". Keeps
 * tiny statistical noise from triggering misleading verdicts.
 */
const COMPARABLE_THRESHOLD_PTS = 2;

interface ComputeArgs {
  /** Site-wide current 30d bounce rate (0–1 fraction or 0–100 percent — auto-normalized). */
  siteBounceRate: number;
  /** Site-wide previous 30d bounce rate. Pass 0 or undefined when unavailable. */
  siteBounceRatePrev?: number;
  /** Top pages for the current 30d window. */
  topPages: GATopPage[];
  /** Top pages for the prior 30d window. Optional — without it the period delta is null. */
  topPagesPrev?: GATopPage[];
  /** Maximum number of peer pages to surface in the ranking. Defaults to 10. */
  peerLimit?: number;
}

/**
 * Compute the Kanban whitepaper bounce-rate comparison.
 *
 * Returns `null` when no Kanban pages were matched in `topPages` (e.g. the
 * landing page didn't appear in the top-N list for the period). The dashboard
 * UI uses the null signal to render an empty state instead of a misleading
 * comparison built from zeros.
 */
export function computeKanbanBounceComparison(
  args: ComputeArgs
): KanbanBounceComparison | null {
  const peerLimit = args.peerLimit ?? 10;

  const matched = findKanbanPages(args.topPages);
  if (matched.length === 0) return null;

  const { bounce: kanbanBounce, sessions: kanbanSessions } = weightedBounce(matched);
  // If matched pages had zero sessions in the period, the bounce signal is
  // not meaningful — treat the same as no match.
  if (kanbanSessions === 0) return null;

  const siteBounce = normalizeBounce(args.siteBounceRate);
  const deltaVsSitePts = (kanbanBounce - siteBounce) * 100;

  // Period-over-period delta — weighted bounce across previously-matched
  // Kanban paths in the prior window. Falls back to null if we have no prior
  // data or zero prior Kanban sessions.
  let periodDeltaPts: number | null = null;
  if (args.topPagesPrev && args.topPagesPrev.length > 0) {
    const matchedPrev = findKanbanPages(args.topPagesPrev);
    if (matchedPrev.length > 0) {
      const { bounce: prevKanbanBounce, sessions: prevSessions } =
        weightedBounce(matchedPrev);
      if (prevSessions > 0) {
        periodDeltaPts = (kanbanBounce - prevKanbanBounce) * 100;
      }
    }
  }

  // Peer ranking: every non-Kanban top page that had real sessions, sorted
  // ascending by bounce (lower = better). Kanban gets ranked into the same
  // list to find its position.
  const peers = args.topPages
    .filter((p) => !isKanbanLandingPage(p.path))
    .filter((p) => (p.sessions ?? 0) > 0)
    .map((p) => ({
      path: p.path,
      bounceRate: normalizeBounce(p.bounceRate ?? 0),
      sessions: p.sessions ?? 0,
    }))
    .sort((a, b) => a.bounceRate - b.bounceRate);

  let rankAmongPeers: number | null = null;
  if (peers.length > 0) {
    // Find how many peers have a strictly LOWER (better) bounce than Kanban.
    // Rank = that count + 1 (1-indexed where 1 = best). Ties go to Kanban.
    const better = peers.filter((p) => p.bounceRate < kanbanBounce).length;
    rankAmongPeers = better + 1;
  }

  const verdict: KanbanBounceComparison["verdict"] =
    Math.abs(deltaVsSitePts) < COMPARABLE_THRESHOLD_PTS
      ? "comparable"
      : deltaVsSitePts < 0
        ? "better"
        : "worse";

  return {
    matchedPaths: matched.map((p) => p.path),
    kanbanBounceRate: kanbanBounce,
    kanbanSessions,
    siteBounceRate: siteBounce,
    deltaVsSitePts,
    periodDeltaPts,
    rankAmongPeers,
    peerCount: peers.length,
    peerPages: peers.slice(0, peerLimit),
    verdict,
  };
}
