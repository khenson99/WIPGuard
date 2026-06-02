import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  enforcePermission: vi.fn(async () => ({ role: "member" })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: { findMany: vi.fn() },
    companyPriority: { findMany: vi.fn() },
  },
}));

describe("collection read permissions", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();

    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1" },
    } as never);

    const { enforcePermission } = await import("@/lib/permissions");
    vi.mocked(enforcePermission).mockResolvedValue({
      role: "member",
    } as never);
  });

  it("blocks GET /api/deals when read permission is denied", async () => {
    const { enforcePermission } = await import("@/lib/permissions");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(enforcePermission).mockResolvedValue({
      role: "observer",
      deniedResponse: NextResponse.json(
        { error: "Forbidden: insufficient permissions" },
        { status: 403 }
      ),
    } as never);

    const { GET } = await import("@/app/api/deals/route");
    const response = await GET(new NextRequest("http://localhost/api/deals"));

    expect(response.status).toBe(403);
    expect(enforcePermission).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "deals.read",
        userId: "user-1",
      })
    );
    expect(prisma.deal.findMany).not.toHaveBeenCalled();
  });

});
