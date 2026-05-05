import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/session-user", () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/ceo/api-context", () => ({
  CeoOrganizationContextError: class CeoOrganizationContextError extends Error {},
  withCeoOrganizationContext: vi.fn(async (_session, _user, fn) => fn("org-1")),
}));

vi.mock("@/lib/ceo/service", () => ({
  createCeoReportRun: vi.fn(),
  listCeoReportPacks: vi.fn(),
}));

describe("/api/ceo/reports", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists default CEO report packs", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAuthenticatedUser } = await import("@/lib/session-user");
    const { listCeoReportPacks } = await import("@/lib/ceo/service");
    const { GET } = await import("@/app/api/ceo/reports/route");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(getAuthenticatedUser).mockReturnValue({ id: "user-1", organizationId: "org-1" } as never);
    vi.mocked(listCeoReportPacks).mockResolvedValue([
      { slug: "weekly-exec", name: "Weekly Exec", metricKeys: [], sections: [] },
    ] as never);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.reportPacks[0].slug).toBe("weekly-exec");
  });

  it("creates an immutable report run for the selected pack", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAuthenticatedUser } = await import("@/lib/session-user");
    const { createCeoReportRun } = await import("@/lib/ceo/service");
    const { POST } = await import("@/app/api/ceo/reports/route");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(getAuthenticatedUser).mockReturnValue({ id: "user-1", organizationId: "org-1" } as never);
    vi.mocked(createCeoReportRun).mockResolvedValue({
      id: "run-1",
      packSlug: "weekly-exec",
      packName: "Weekly Exec",
      generatedAt: "2026-05-01T12:00:00.000Z",
      metrics: [],
      deterministicNotes: [],
      markdown: "# Weekly Exec",
      csv: "Metric,Value",
      slideJson: {
        title: "Weekly Exec",
        generatedAt: "2026-05-01T12:00:00.000Z",
        readiness: {
          status: "not_board_final",
          ready: false,
          summary: "Not board-final: 1 readiness gate is failing.",
          failingGates: [],
        },
        sections: [],
        notes: [],
      },
    } as never);

    const response = await POST(
      new NextRequest("http://localhost/api/ceo/reports", {
        method: "POST",
        body: JSON.stringify({ packSlug: "weekly-exec" }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(createCeoReportRun).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: "org-1",
      packSlug: "weekly-exec",
    });
    expect(payload.markdown).toContain("Weekly Exec");
    expect(payload.slideJson.readiness.status).toBe("not_board_final");
  });
});
