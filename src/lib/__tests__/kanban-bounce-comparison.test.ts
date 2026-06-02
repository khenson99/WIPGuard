import { describe, expect, it } from "vitest";
import type { GATopPage } from "@/lib/analytics/types";
import {
  computeKanbanBounceComparison,
  findKanbanPages,
  isKanbanLandingPage,
} from "@/lib/analytics/kanban-bounce-comparison";

function page(path: string, bounceRate: number, sessions: number): GATopPage {
  return { path, bounceRate, sessions, pageviews: sessions, avgDuration: 0 };
}

describe("isKanbanLandingPage", () => {
  it("matches public Kanban Generator landing-page slugs", () => {
    expect(isKanbanLandingPage("/kanban-template")).toBe(true);
    expect(isKanbanLandingPage("/free-kanban-generator")).toBe(true);
    expect(isKanbanLandingPage("/free-kanban")).toBe(true);
    expect(isKanbanLandingPage("/Kanban-Template?utm_source=reddit")).toBe(true);
  });

  it("rejects internal app routes and deep nested paths", () => {
    expect(isKanbanLandingPage("/kanban-board")).toBe(false);
    expect(isKanbanLandingPage("/kanban-card/abc-123")).toBe(false);
    expect(isKanbanLandingPage("/kanban-template/preview/abc/edit")).toBe(false);
    expect(isKanbanLandingPage("/pricing")).toBe(false);
  });
});

describe("findKanbanPages", () => {
  it("returns matched landing pages in source order", () => {
    const pages = [
      page("/product", 0.4, 1000),
      page("/kanban-template", 0.42, 800),
      page("/free-kanban-generator", 0.38, 400),
      page("/kanban-board", 0.7, 100),
    ];

    expect(findKanbanPages(pages).map((match) => match.path)).toEqual([
      "/kanban-template",
      "/free-kanban-generator",
    ]);
  });
});

describe("computeKanbanBounceComparison", () => {
  it("returns null when no Kanban pages are matched", () => {
    expect(
      computeKanbanBounceComparison({
        siteBounceRate: 0.5,
        topPages: [page("/product", 0.4, 1000)],
      })
    ).toBeNull();
  });

  it("weights bounce rate by sessions across multiple Kanban variants", () => {
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
    expect(result!.deltaVsSitePts).toBeCloseTo(-17, 5);
    expect(result!.verdict).toBe("better");
  });

  it("normalizes GA4 percentage-format bounce rates", () => {
    const result = computeKanbanBounceComparison({
      siteBounceRate: 50,
      topPages: [page("/kanban-template", 42, 1000)],
    });

    expect(result!.kanbanBounceRate).toBeCloseTo(0.42, 5);
    expect(result!.siteBounceRate).toBeCloseTo(0.5, 5);
    expect(result!.deltaVsSitePts).toBeCloseTo(-8, 5);
  });

  it("computes period-over-period delta from previous top pages", () => {
    const result = computeKanbanBounceComparison({
      siteBounceRate: 0.5,
      topPages: [page("/kanban-template", 0.3, 500)],
      topPagesPrev: [page("/kanban-template", 0.5, 400)],
    });

    expect(result!.periodDeltaPts).toBeCloseTo(-20, 5);
  });

  it("ranks Kanban against non-Kanban peer pages", () => {
    const result = computeKanbanBounceComparison({
      siteBounceRate: 0.5,
      topPages: [
        page("/product", 0.3, 1000),
        page("/pricing", 0.55, 500),
        page("/kanban-template", 0.42, 800),
        page("/blog/post", 0.6, 300),
      ],
    });

    expect(result!.rankAmongPeers).toBe(2);
    expect(result!.peerCount).toBe(3);
    expect(result!.peerPages.map((peer) => peer.path)).toEqual([
      "/product",
      "/pricing",
      "/blog/post",
    ]);
  });
});
