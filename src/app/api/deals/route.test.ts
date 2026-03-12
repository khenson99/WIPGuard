import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  enforcePermission: vi.fn(async () => ({ deniedResponse: null })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: {
      create: vi.fn(),
    },
    dealStageHistory: {
      create: vi.fn(),
    },
  },
}));

describe("POST /api/deals", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();

    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.com",
        role: "member",
        organizationId: "org-1",
      },
    } as never);

    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.deal.create).mockResolvedValue({
      id: "deal-1",
    } as never);
    vi.mocked(prisma.dealStageHistory.create).mockResolvedValue({
      id: "history-1",
    } as never);
  });

  it("persists the session organization on newly created deals", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { POST } = await import("@/app/api/deals/route");

    const response = await POST(
      new NextRequest("http://localhost/api/deals", {
        method: "POST",
        body: JSON.stringify({
          name: "Acme",
        }),
      })
    );

    expect(response.status).toBe(201);
    expect(prisma.deal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Acme",
          organizationId: "org-1",
        }),
      })
    );
  });
});
