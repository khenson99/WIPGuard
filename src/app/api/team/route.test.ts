import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/security-audit", () => ({
  recordSecurityAuditEvent: vi.fn(),
}));

vi.mock("@/lib/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/permissions")>();
  return {
    ...actual,
    enforcePermission: vi.fn(async () => ({ role: "admin" })),
  };
});

describe("/api/team", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks investor users from reading team member data", async () => {
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("@/app/api/team/route");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "investor-1", role: "investor" },
    } as never);

    const response = await GET();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden: investors cannot access team data",
    });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("returns team members for non-investor users", async () => {
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("@/app/api/team/route");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "member-1", role: "member" },
    } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: "member-1",
        name: "Member",
        email: "member@example.com",
        image: null,
        role: "member",
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    ] as never);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload[0].email).toBe("member@example.com");
  });
});
