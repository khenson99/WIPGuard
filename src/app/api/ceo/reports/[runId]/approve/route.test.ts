import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/session-user", () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  enforcePermission: vi.fn(async () => ({ role: "admin" })),
}));

vi.mock("@/lib/ceo/api-context", () => ({
  CeoOrganizationContextError: class CeoOrganizationContextError extends Error {},
  withCeoOrganizationContext: vi.fn(async (_session, _user, fn) => fn("org-1")),
}));

vi.mock("@/lib/ceo/service", () => ({
  approveCeoReportRun: vi.fn(),
}));

describe("/api/ceo/reports/[runId]/approve", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("requires authentication", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAuthenticatedUser } = await import("@/lib/session-user");
    const { approveCeoReportRun } = await import("@/lib/ceo/service");
    const { POST } = await import("@/app/api/ceo/reports/[runId]/approve/route");

    vi.mocked(auth).mockResolvedValue(null as never);
    vi.mocked(getAuthenticatedUser).mockReturnValue(null);

    const response = await POST(
      new NextRequest("http://localhost/api/ceo/reports/run-1/approve", { method: "POST" }),
      { params: Promise.resolve({ runId: "run-1" }) },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(approveCeoReportRun).not.toHaveBeenCalled();
  });

  it("requires board-final approval permission before approving", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAuthenticatedUser } = await import("@/lib/session-user");
    const { enforcePermission } = await import("@/lib/permissions");
    const { approveCeoReportRun } = await import("@/lib/ceo/service");
    const { POST } = await import("@/app/api/ceo/reports/[runId]/approve/route");

    vi.mocked(auth).mockResolvedValue({ user: { id: "member-1", role: "member" } } as never);
    vi.mocked(getAuthenticatedUser).mockReturnValue({
      id: "member-1",
      role: "member",
      organizationId: "org-1",
    });
    vi.mocked(enforcePermission).mockResolvedValueOnce({
      role: "member",
      deniedResponse: Response.json(
        { error: "Forbidden: insufficient permissions" },
        { status: 403 },
      ),
    } as never);

    const response = await POST(
      new NextRequest("http://localhost/api/ceo/reports/run-1/approve", { method: "POST" }),
      { params: Promise.resolve({ runId: "run-1" }) },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden: insufficient permissions" });
    expect(enforcePermission).toHaveBeenCalledWith({
      userId: "member-1",
      action: "board_final.approve",
      request: expect.any(NextRequest),
      targetType: "ceo_report_run",
      targetId: "run-1",
    });
    expect(approveCeoReportRun).not.toHaveBeenCalled();
  });

  it("approves a report run as board-final for admins", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAuthenticatedUser } = await import("@/lib/session-user");
    const { approveCeoReportRun } = await import("@/lib/ceo/service");
    const { POST } = await import("@/app/api/ceo/reports/[runId]/approve/route");

    vi.mocked(auth).mockResolvedValue({ user: { id: "admin-1", role: "admin" } } as never);
    vi.mocked(getAuthenticatedUser).mockReturnValue({
      id: "admin-1",
      role: "admin",
      organizationId: "org-1",
    });
    vi.mocked(approveCeoReportRun).mockResolvedValue({
      id: "run-1",
      packSlug: "investor-update",
      packName: "Investor Update",
      generatedAt: "2026-06-01T12:00:00.000Z",
      metrics: [],
      deterministicNotes: [],
      markdown: "# Investor Update",
      csv: "Metric,Value",
      slideJson: {
        title: "Investor Update",
        generatedAt: "2026-06-01T12:00:00.000Z",
        readiness: { status: "board_ready", ready: true, summary: "Board-ready", failingGates: [] },
        sections: [],
        notes: [],
      },
      boardFinal: {
        approvedAt: "2026-06-01T13:00:00.000Z",
        approvedById: "admin-1",
        overrideReason: null,
      },
    } as never);

    const response = await POST(
      new NextRequest("http://localhost/api/ceo/reports/run-1/approve", {
        method: "POST",
        body: JSON.stringify({ overrideReason: "Approved after finance review" }),
      }),
      { params: Promise.resolve({ runId: "run-1" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(approveCeoReportRun).toHaveBeenCalledWith({
      userId: "admin-1",
      organizationId: "org-1",
      runId: "run-1",
      overrideReason: "Approved after finance review",
    });
    expect(payload.boardFinal.approvedById).toBe("admin-1");
  });

  it("returns a validation error when a non-board-ready report lacks an override", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAuthenticatedUser } = await import("@/lib/session-user");
    const { approveCeoReportRun } = await import("@/lib/ceo/service");
    const { POST } = await import("@/app/api/ceo/reports/[runId]/approve/route");

    vi.mocked(auth).mockResolvedValue({ user: { id: "admin-1", role: "admin" } } as never);
    vi.mocked(getAuthenticatedUser).mockReturnValue({
      id: "admin-1",
      role: "admin",
      organizationId: "org-1",
    });
    vi.mocked(approveCeoReportRun).mockRejectedValue(
      new Error("Board-final approval requires board-ready report or override reason"),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/ceo/reports/run-1/approve", { method: "POST" }),
      { params: Promise.resolve({ runId: "run-1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Board-final approval requires board-ready report or override reason",
    });
  });
});
