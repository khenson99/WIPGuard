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

vi.mock("@/lib/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/permissions")>();
  return {
    ...actual,
    enforcePermission: vi.fn(async () => ({ role: "member" })),
  };
});

describe("/api/ceo/reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists default CEO report packs", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAuthenticatedUser } = await import("@/lib/session-user");
    const { listCeoReportPacks } = await import("@/lib/ceo/service");
    const { enforcePermission } = await import("@/lib/permissions");
    const { GET } = await import("@/app/api/ceo/reports/route");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(getAuthenticatedUser).mockReturnValue({
      id: "user-1",
      role: "member",
      organizationId: "org-1",
    } as never);
    vi.mocked(listCeoReportPacks).mockResolvedValue([
      { slug: "weekly-exec", name: "Weekly Exec", audience: "TEAM", metricKeys: [], sections: [] },
    ] as never);

    const response = await GET(new Request("http://localhost/api/ceo/reports"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(enforcePermission).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", action: "report.read" }),
    );
    expect(payload.reportPacks[0].slug).toBe("weekly-exec");
  });

  it("limits investors to investor-audience report packs", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAuthenticatedUser } = await import("@/lib/session-user");
    const { listCeoReportPacks } = await import("@/lib/ceo/service");
    const { GET } = await import("@/app/api/ceo/reports/route");

    vi.mocked(auth).mockResolvedValue({ user: { id: "investor-1" } } as never);
    vi.mocked(getAuthenticatedUser).mockReturnValue({
      id: "investor-1",
      role: "investor",
      organizationId: "org-1",
    } as never);
    vi.mocked(listCeoReportPacks).mockResolvedValue([
      { slug: "weekly-exec", name: "Weekly Exec", audience: "TEAM", metricKeys: [], sections: [] },
      { slug: "investor-update", name: "Investor Update", audience: "INVESTOR", metricKeys: [], sections: [] },
    ] as never);

    const response = await GET(new Request("http://localhost/api/ceo/reports"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.reportPacks.map((pack: { slug: string }) => pack.slug)).toEqual(["investor-update"]);
  });

  it("creates an immutable report run for the selected pack", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAuthenticatedUser } = await import("@/lib/session-user");
    const { createCeoReportRun } = await import("@/lib/ceo/service");
    const { enforcePermission } = await import("@/lib/permissions");
    const { POST } = await import("@/app/api/ceo/reports/route");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(getAuthenticatedUser).mockReturnValue({
      id: "user-1",
      role: "member",
      organizationId: "org-1",
    } as never);
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
    expect(enforcePermission).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", action: "report.write" }),
    );
    expect(createCeoReportRun).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: "org-1",
      packSlug: "weekly-exec",
    });
    expect(payload.markdown).toContain("Weekly Exec");
    expect(payload.slideJson.readiness.status).toBe("not_board_final");
  });

  it("blocks investors from creating report runs", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAuthenticatedUser } = await import("@/lib/session-user");
    const { createCeoReportRun } = await import("@/lib/ceo/service");
    const { enforcePermission } = await import("@/lib/permissions");
    const { POST } = await import("@/app/api/ceo/reports/route");

    vi.mocked(auth).mockResolvedValue({ user: { id: "investor-1" } } as never);
    vi.mocked(getAuthenticatedUser).mockReturnValue({
      id: "investor-1",
      role: "investor",
      organizationId: "org-1",
    } as never);
    vi.mocked(enforcePermission).mockResolvedValueOnce({
      role: "investor",
      deniedResponse: Response.json({ error: "Forbidden" }, { status: 403 }),
    } as never);

    const response = await POST(
      new NextRequest("http://localhost/api/ceo/reports", {
        method: "POST",
        body: JSON.stringify({ packSlug: "investor-update" }),
      })
    );

    expect(response.status).toBe(403);
    expect(createCeoReportRun).not.toHaveBeenCalled();
  });
});
