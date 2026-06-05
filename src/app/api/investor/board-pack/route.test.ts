import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/session-user", () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/permissions")>();
  return {
    ...actual,
    enforcePermission: vi.fn(async () => ({ role: "investor" })),
  };
});

vi.mock("@/lib/investor/board-pack", () => ({
  loadInvestorBoardPack: vi.fn(),
}));

describe("/api/investor/board-pack", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("requires authentication", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAuthenticatedUser } = await import("@/lib/session-user");
    const { loadInvestorBoardPack } = await import("@/lib/investor/board-pack");
    const { GET } = await import("@/app/api/investor/board-pack/route");

    vi.mocked(auth).mockResolvedValue(null as never);
    vi.mocked(getAuthenticatedUser).mockReturnValue(null);

    const response = await GET(new Request("http://localhost/api/investor/board-pack"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(loadInvestorBoardPack).not.toHaveBeenCalled();
  });

  it("returns a safe empty state when no board-final investor pack exists", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAuthenticatedUser } = await import("@/lib/session-user");
    const { enforcePermission } = await import("@/lib/permissions");
    const { loadInvestorBoardPack } = await import("@/lib/investor/board-pack");
    const { GET } = await import("@/app/api/investor/board-pack/route");

    vi.mocked(auth).mockResolvedValue({ user: { id: "investor-1", role: "investor" } } as never);
    vi.mocked(getAuthenticatedUser).mockReturnValue({
      id: "investor-1",
      role: "investor",
      organizationId: "org-1",
    });
    vi.mocked(loadInvestorBoardPack).mockResolvedValue({
      status: "empty",
      emptyState: {
        title: "No approved investor pack is available yet.",
        description: "An Arda admin must approve a board-final monthly pack before investors can view it.",
      },
      pack: null,
    });

    const response = await GET(new Request("http://localhost/api/investor/board-pack"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(enforcePermission).toHaveBeenCalledWith({
      userId: "investor-1",
      action: "investor.read",
      request: expect.any(Request),
      targetType: "investor_board_pack",
      targetId: "latest",
    });
    expect(loadInvestorBoardPack).toHaveBeenCalledWith({
      userId: "investor-1",
      organizationId: "org-1",
    });
    expect(payload).toEqual({
      status: "empty",
      emptyState: {
        title: "No approved investor pack is available yet.",
        description: "An Arda admin must approve a board-final monthly pack before investors can view it.",
      },
      pack: null,
    });
  });

  it("returns the permission denial before loading investor data", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAuthenticatedUser } = await import("@/lib/session-user");
    const { enforcePermission } = await import("@/lib/permissions");
    const { loadInvestorBoardPack } = await import("@/lib/investor/board-pack");
    const { GET } = await import("@/app/api/investor/board-pack/route");

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

    const response = await GET(new Request("http://localhost/api/investor/board-pack"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden: insufficient permissions" });
    expect(loadInvestorBoardPack).not.toHaveBeenCalled();
  });
});
