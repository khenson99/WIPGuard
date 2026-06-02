import type { GATopPage, KanbanBounceComparison } from "./types";

const KANBAN_PATH_PREFIXES = [
  "/kanban-template",
  "/free-kanban-generator",
  "/free-kanban",
  "/kanban",
] as const;

const KANBAN_PATH_EXCLUDES = [
  "/kanban-board",
  "/kanban-card",
  "/kanban-loop",
] as const;

const MAX_LANDING_PAGE_DEPTH = 2;
const COMPARABLE_THRESHOLD_PTS = 2;

export function isKanbanLandingPage(path: string): boolean {
  if (!path) return false;
  const cleaned = path.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const lower = cleaned.toLowerCase();

  for (const exclude of KANBAN_PATH_EXCLUDES) {
    if (lower === exclude || lower.startsWith(`${exclude}/`)) return false;
  }

  const segments = lower.split("/").filter(Boolean);
  if (segments.length > MAX_LANDING_PAGE_DEPTH) return false;

  return KANBAN_PATH_PREFIXES.some(
    (prefix) => lower === prefix || lower.startsWith(`${prefix}/`)
  );
}

export function findKanbanPages(topPages: GATopPage[]): GATopPage[] {
  return topPages.filter((page) => isKanbanLandingPage(page.path));
}

function normalizeBounce(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return raw > 1 ? raw / 100 : raw;
}

function weightedBounce(pages: GATopPage[]): { bounce: number; sessions: number } {
  let totalSessions = 0;
  let weightedSum = 0;

  for (const page of pages) {
    const sessions = Math.max(0, page.sessions ?? 0);
    if (sessions === 0) continue;

    weightedSum += normalizeBounce(page.bounceRate ?? 0) * sessions;
    totalSessions += sessions;
  }

  if (totalSessions === 0) return { bounce: 0, sessions: 0 };
  return { bounce: weightedSum / totalSessions, sessions: totalSessions };
}

interface ComputeArgs {
  siteBounceRate: number;
  topPages: GATopPage[];
  topPagesPrev?: GATopPage[];
  peerLimit?: number;
}

export function computeKanbanBounceComparison(
  args: ComputeArgs
): KanbanBounceComparison | null {
  const matched = findKanbanPages(args.topPages);
  if (matched.length === 0) return null;

  const { bounce: kanbanBounce, sessions: kanbanSessions } = weightedBounce(matched);
  if (kanbanSessions === 0) return null;

  const siteBounce = normalizeBounce(args.siteBounceRate);
  const deltaVsSitePts = (kanbanBounce - siteBounce) * 100;

  let periodDeltaPts: number | null = null;
  if (args.topPagesPrev?.length) {
    const previous = weightedBounce(findKanbanPages(args.topPagesPrev));
    if (previous.sessions > 0) {
      periodDeltaPts = (kanbanBounce - previous.bounce) * 100;
    }
  }

  const peers = args.topPages
    .filter((page) => !isKanbanLandingPage(page.path))
    .filter((page) => (page.sessions ?? 0) > 0)
    .map((page) => ({
      path: page.path,
      bounceRate: normalizeBounce(page.bounceRate ?? 0),
      sessions: page.sessions ?? 0,
    }))
    .sort((a, b) => a.bounceRate - b.bounceRate);

  const rankAmongPeers =
    peers.length > 0
      ? peers.filter((page) => page.bounceRate < kanbanBounce).length + 1
      : null;

  const verdict: KanbanBounceComparison["verdict"] =
    Math.abs(deltaVsSitePts) < COMPARABLE_THRESHOLD_PTS
      ? "comparable"
      : deltaVsSitePts < 0
        ? "better"
        : "worse";

  return {
    matchedPaths: matched.map((page) => page.path),
    kanbanBounceRate: kanbanBounce,
    kanbanSessions,
    siteBounceRate: siteBounce,
    deltaVsSitePts,
    periodDeltaPts,
    rankAmongPeers,
    peerCount: peers.length,
    peerPages: peers.slice(0, args.peerLimit ?? 10),
    verdict,
  };
}
