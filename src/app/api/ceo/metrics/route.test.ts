import { beforeEach, describe, expect, it, vi } from "vitest";

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
  loadCeoMetricSnapshot: vi.fn(),
}));

describe("GET /api/ceo/metrics", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAuthenticatedUser } = await import("@/lib/session-user");
    const { GET } = await import("@/app/api/ceo/metrics/route");

    vi.mocked(auth).mockResolvedValue(null as never);
    vi.mocked(getAuthenticatedUser).mockReturnValue(null as never);

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("loads trusted CEO metrics for the authenticated organization", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAuthenticatedUser } = await import("@/lib/session-user");
    const { loadCeoMetricSnapshot } = await import("@/lib/ceo/service");
    const { GET } = await import("@/app/api/ceo/metrics/route");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(getAuthenticatedUser).mockReturnValue({
      id: "user-1",
      organizationId: "org-1",
    } as never);
    vi.mocked(loadCeoMetricSnapshot).mockResolvedValue({
      generatedAt: "2026-05-01T12:00:00.000Z",
      periodStart: "2026-04-01T00:00:00.000Z",
      periodEnd: "2026-05-01T12:00:00.000Z",
      metrics: [],
      definitions: [],
      reportPacks: [],
      trustSummary: { fresh: 0, stale: 0, partial: 0, missing: 0, error: 0, conflicted: 0 },
      readiness: {
        status: "not_board_final",
        ready: false,
        summary: "Not board-final: no metrics are available.",
        failingGates: [],
      },
    } as never);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(loadCeoMetricSnapshot).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: "org-1",
      persist: false,
    });
    expect(payload.generatedAt).toBe("2026-05-01T12:00:00.000Z");
    expect(payload.readiness.status).toBe("not_board_final");
  });
});
