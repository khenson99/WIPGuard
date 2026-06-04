import { describe, expect, it } from "vitest";
import type { GATopPage } from "@/lib/analytics/types";
import {
  computeKanbanBounceComparison,
  findKanbanPages,
  isKanbanLandingPage,
} from "@/lib/analytics/kanban-bounce-comparison";

function page(
  path: string,
  bounceRate: number,
  sessions: number,
  pageviews = sessions
): GATopPage {
  return { path, bounceRate, sessions, pageviews, avgDuration: 0 };
}

describe("isKanbanLandingPage", () => {
  it("matches the canonical Kanban landing-page slugs", () => {
    expect(isKanbanLandingPage("/kanban-template")).toBe(true);
    expect(isKanbanLandingPage("/free-kanban-generator")).toBe(true);
    expect(isKanbanLandingPage("/free-kanban")).toBe(true);
    expect(isKanbanLandingPage("/kanban")).toBe(true);
  });

  it("matches sub-paths up to depth 2", () => {
    expect(isKanbanLandingPage("/kanban-template/print")).toBe(true);
    expect(isKanbanLandingPage("/kanban-template/")).toBe(true);
  });

  it("strips query strings and trailing slashes before matching", () => {
    expect(isKanbanLandingPage("/kanban-template?utm_source=reddit")).toBe(true);
    expect(isKanbanLandingPage("/kanban-template/#hero")).toBe(true);
  });

  it("rejects internal app routes that share the /kanban prefix", () => {
    expect(isKanbanLandingPage("/kanban-board")).toBe(false);
    expect(isKanbanLandingPage("/kanban-card/abc-123")).toBe(false);
    expect(isKanbanLandingPage("/kanban-loop")).toBe(false);
  });

  it("rejects deep nested paths beyond depth 2", () => {
    expect(isKanbanLandingPage("/kanban-template/preview/abc/edit")).toBe(false);
  });

  it("rejects unrelated paths", () => {
    expect(isKanbanLandingPage("/product")).toBe(false);
    expect(isKanbanLandingPage("/pricing")).toBe(false);
    expect(isKanbanLandingPage("/")).toBe(false);
    expect(isKanbanLandingPage("")).toBe(false);
  });

  it("is case-insensitive on the path prefix", () => {
    expect(isKanbanLandingPage("/Kanban-Template")).toBe(true);
    expect(isKanbanLandingPage("/FREE-KANBAN-GENERATOR")).toBe(true);
  });
});

describe("findKanbanPages", () => {
  it("returns only matched landing pages, preserving order", () => {
    const pages: GATopPage[] = [
      page("/product", 0.4, 1000),
      page("/kanban-template", 0.42, 800),
      page("/pricing", 0.5, 600),
      page("/free-kanban-generator", 0.38, 400),
      page("/kanban-board", 0.7, 100),
    ];
    expect(findKanbanPages(pages).map((p) => p.path)).toEqual([
      "/kanban-template",
      "/free-kanban-generator",
    ]);
  });
});

describe("computeKanbanBounceComparison", () => {
  it("returns null when no Kanban pages are matched", () => {
    const result = computeKanbanBounceComparison({
      siteBounceRate: 0.5,
      topPages: [page("/product", 0.4, 1000), page("/pricing", 0.55, 500)],
    });
    expect(result).toBeNull();
  });

  it("returns null when matched Kanban pages have zero sessions", () => {
    const result = computeKanbanBounceComparison({
      siteBounceRate: 0.5,
      topPages: [page("/kanban-template", 0.42, 0)],
    });
    expect(result).toBeNull();
  });

  it("normalizes GA4 percentage-format bounce rates (0–100) to fractions (0–1)", () => {
    const result = computeKanbanBounceComparison({
      siteBounceRate: 50, // percentage form
      topPages: [page("/kanban-template", 42, 1000)], // percentage form
    });
    expect(result).not.toBeNull();
    expect(result!.kanbanBounceRate).toBeCloseTo(0.42, 5);
    expect(result!.siteBounceRate).toBeCloseTo(0.5, 5);
    expect(result!.deltaVsSitePts).toBeCloseTo(-8, 5);
  });

  it("weights bounce rate by sessions when multiple Kanban variants match", () => {
    // /kanban-template: 50% bounce on 100 sessions = 50 bounces
    // /free-kanban:     20% bounce on 900 sessions = 180 bounces
    // Total: 230 bounces / 1000 sessions = 23%
    const result = computeKanbanBounceComparison({
      siteBounceRate: 0.4,
      topPages: [
        page("/kanban-template", 0.5, 100),
        page("/free-kanban", 0.2, 900),
      ],
    });
    expect(result).not.toBeNull();
    expect(result!.kanbanBounceRate).toBeCloseTo(0.23, 5);
    expect(result!.kanbanSessions).toBe(1000);
    expect(result!.matchedPaths).toEqual(["/kanban-template", "/free-kanban"]);
  });

  it("computes deltaVsSitePts with correct sign (positive = Kanban worse)", () => {
    const worse = computeKanbanBounceComparison({
      siteBounceRate: 0.4,
      topPages: [page("/kanban-template", 0.5, 500)],
    });
    expect(worse!.deltaVsSitePts).toBeCloseTo(10, 5);
    expect(worse!.verdict).toBe("worse");

    const better = computeKanbanBounceComparison({
      siteBounceRate: 0.5,
      topPages: [page("/kanban-template", 0.35, 500)],
    });
    expect(better!.deltaVsSitePts).toBeCloseTo(-15, 5);
    expect(better!.verdict).toBe("better");
  });

  it("labels small deltas (< 2 pts) as comparable", () => {
    const result = computeKanbanBounceComparison({
      siteBounceRate: 0.5,
      topPages: [page("/kanban-template", 0.51, 500)],
    });
    expect(result!.verdict).toBe("comparable");
    expect(Math.abs(result!.deltaVsSitePts)).toBeLessThan(2);
  });

  it("returns null periodDeltaPts when no prior-period data is provided", () => {
    const result = computeKanbanBounceComparison({
      siteBounceRate: 0.5,
      topPages: [page("/kanban-template", 0.42, 500)],
    });
    expect(result!.periodDeltaPts).toBeNull();
  });

  it("returns null periodDeltaPts when prior-period top pages contained no Kanban match", () => {
    const result = computeKanbanBounceComparison({
      siteBounceRate: 0.5,
      topPages: [page("/kanban-template", 0.42, 500)],
      topPagesPrev: [page("/product", 0.4, 1000)],
    });
    expect(result!.periodDeltaPts).toBeNull();
  });

  it("computes period-over-period bounce delta when prior-period Kanban data exists", () => {
    // Current: 30% bounce; Prior: 50% bounce. Delta = -20pts (improving).
    const result = computeKanbanBounceComparison({
      siteBounceRate: 0.5,
      topPages: [page("/kanban-template", 0.3, 500)],
      topPagesPrev: [page("/kanban-template", 0.5, 400)],
    });
    expect(result!.periodDeltaPts).toBeCloseTo(-20, 5);
  });

  it("ranks the Kanban page against peer pages by bounce ascending", () => {
    const result = computeKanbanBounceComparison({
      siteBounceRate: 0.5,
      topPages: [
        page("/product", 0.3, 1000), // best
        page("/pricing", 0.55, 500),
        page("/kanban-template", 0.42, 800), // should rank #2
        page("/blog/post", 0.6, 300),
      ],
    });
    expect(result!.rankAmongPeers).toBe(2); // one peer (/product) is better
    expect(result!.peerCount).toBe(3);
    expect(result!.peerPages.map((p) => p.path)).toEqual([
      "/product",
      "/pricing",
      "/blog/post",
    ]);
  });

  it("excludes the Kanban page itself from the peer list", () => {
    const result = computeKanbanBounceComparison({
      siteBounceRate: 0.5,
      topPages: [
        page("/kanban-template", 0.42, 500),
        page("/product", 0.4, 1000),
      ],
    });
    expect(result!.peerPages.map((p) => p.path)).not.toContain(
      "/kanban-template"
    );
  });

  it("excludes peer pages with zero sessions from the ranking", () => {
    const result = computeKanbanBounceComparison({
      siteBounceRate: 0.5,
      topPages: [
        page("/kanban-template", 0.42, 500),
        page("/product", 0.4, 0), // no sessions — exclude
        page("/pricing", 0.55, 100),
      ],
    });
    expect(result!.peerCount).toBe(1);
    expect(result!.peerPages.map((p) => p.path)).toEqual(["/pricing"]);
  });

  it("limits the peer list to peerLimit entries (default 10)", () => {
    const manyPeers = Array.from({ length: 20 }, (_, i) =>
      page(`/page-${i}`, 0.3 + i * 0.01, 100 + i)
    );
    const result = computeKanbanBounceComparison({
      siteBounceRate: 0.5,
      topPages: [page("/kanban-template", 0.42, 500), ...manyPeers],
    });
    expect(result!.peerPages.length).toBe(10);
    // peerCount still reflects ALL eligible peers
    expect(result!.peerCount).toBe(20);
  });
});
