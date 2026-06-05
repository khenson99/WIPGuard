import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InvestorPage from "./page";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/investor/board-pack", () => ({
  loadInvestorBoardPack: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("/investor", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders a safe empty state before a board-final pack is approved", async () => {
    const { auth } = await import("@/lib/auth");
    const { loadInvestorBoardPack } = await import("@/lib/investor/board-pack");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "investor-1", role: "investor", organizationId: "org-1" },
    } as never);
    vi.mocked(loadInvestorBoardPack).mockResolvedValue({
      status: "empty",
      emptyState: {
        title: "No approved investor pack is available yet.",
        description: "An Arda admin must approve a board-final monthly pack before investors can view it.",
      },
      pack: null,
    });

    const page = await InvestorPage();
    render(page);

    expect(screen.getByRole("heading", { name: "Investor" })).toBeTruthy();
    expect(screen.getByText("No approved investor pack is available yet.")).toBeTruthy();
    expect(screen.getByText(/An Arda admin must approve/)).toBeTruthy();
  });

  it("renders approved investor pack exports without raw internal payloads", async () => {
    const { auth } = await import("@/lib/auth");
    const { loadInvestorBoardPack } = await import("@/lib/investor/board-pack");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "investor-1", role: "investor", organizationId: "org-1" },
    } as never);
    vi.mocked(loadInvestorBoardPack).mockResolvedValue({
      status: "ready",
      emptyState: null,
      pack: {
        id: "run-1",
        packSlug: "investor-update",
        packName: "Investor Update",
        generatedAt: "2026-06-01T12:00:00.000Z",
        deterministicNotes: ["MRR increased from approved canonical metrics."],
        healthyArrGrowth: {
          label: "Healthy ARR Growth",
          status: "strong",
          currentArr: 120000,
          currentMrr: 10000,
          netNewArr: 12000,
          summary:
            "Approved ARR/MRR growth interpreted through runway, burn, pipeline, activation, retention risk, and trust labels.",
          drivers: [
            {
              id: "pipeline",
              label: "Pipeline",
              value: 300000,
              unit: "currency",
              status: "strong",
              trust: "fresh",
              warnings: ["Pipeline evidence is stale."],
              sourceLineageKeys: ["hubspot", "google_workspace"],
              sourceLineageCount: 4,
              latestSourceCapturedAt: "2026-06-01T07:30:00.000Z",
            },
          ],
        },
        metrics: [
          {
            key: "revenue.mrr",
            label: "MRR",
            value: 10000,
            priorValue: 9000,
            delta: 1000,
            unit: "currency",
            trust: "fresh",
            asOf: "2026-05-31T00:00:00.000Z",
            warnings: [],
            sourceLineageKeys: ["stripe", "hubspot"],
            sourceLineageCount: 3,
            latestSourceCapturedAt: "2026-06-01T08:30:00.000Z",
          },
        ],
        markdown: "# Investor Update\n\nApproved facts only.",
        csv: "Metric,Value",
        slideJson: { title: "Investor Update" },
        boardFinal: {
          approvedAt: "2026-06-01T13:00:00.000Z",
          overrideReason: null,
        },
      },
    });

    const page = await InvestorPage();
    const { container } = render(page);

    expect(screen.getByRole("heading", { name: "Investor" })).toBeTruthy();
    expect(screen.getByText("Investor Update")).toBeTruthy();
    expect(screen.getByText("Healthy ARR Growth")).toBeTruthy();
    expect(screen.getByText("Net new ARR $12.0k")).toBeTruthy();
    expect(screen.getByText("Sources hubspot · google_workspace")).toBeTruthy();
    expect(screen.getByText("Evidence 4 source records · latest 2026-06-01")).toBeTruthy();
    expect(screen.getByText("Pipeline evidence is stale.")).toBeTruthy();
    expect(screen.getByText("Board-Final Metrics")).toBeTruthy();
    expect(screen.getByText("Sources stripe · hubspot")).toBeTruthy();
    expect(screen.getByText("Evidence 3 source records · latest 2026-06-01")).toBeTruthy();
    expect(screen.getByText("MRR increased from approved canonical metrics.")).toBeTruthy();
    expect(screen.getByText("Markdown")).toBeTruthy();
    expect(screen.getByText("CSV")).toBeTruthy();
    expect(screen.getByText("Slide JSON")).toBeTruthy();
    expect(container.textContent).not.toContain("raw");
    expect(container.textContent).not.toContain("admin-1");
  });
});
