import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const enforcePermissionMock = vi.hoisted(() => vi.fn());
const dealFindManyMock = vi.hoisted(() => vi.fn());
const dealCreateMock = vi.hoisted(() => vi.fn());
const dealStageHistoryCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/permissions", () => ({
  enforcePermission: enforcePermissionMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: {
      findMany: dealFindManyMock,
      create: dealCreateMock,
    },
    dealStageHistory: {
      create: dealStageHistoryCreateMock,
    },
  },
}));

describe("deals route", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    authMock.mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.com",
        role: "member",
        organizationId: "org-1",
      },
    });

    enforcePermissionMock.mockResolvedValue({ role: "member" });
    dealFindManyMock.mockResolvedValue([]);
    dealCreateMock.mockResolvedValue({
      id: "deal-1",
      name: "Acme Expansion",
    });
    dealStageHistoryCreateMock.mockResolvedValue({
      id: "history-1",
    });
  });

  it("assigns the authenticated user's organization when creating a deal", async () => {
    const { POST } = await import("@/app/api/deals/route");

    const response = await POST(
      new NextRequest("http://localhost/api/deals", {
        method: "POST",
        body: JSON.stringify({
          name: "Acme Expansion",
          stage: "LEAD",
          source: "OTHER",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(dealCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Acme Expansion",
          ownerId: "user-1",
          organizationId: "org-1",
        }),
      }),
    );
    expect(dealStageHistoryCreateMock).toHaveBeenCalledWith({
      data: {
        dealId: "deal-1",
        fromStage: null,
        toStage: "LEAD",
        changedBy: "user-1",
      },
    });
  });

  it("returns setup-required when the deals schema is missing", async () => {
    dealFindManyMock.mockRejectedValueOnce(
      new Error("The table `public.Deal` does not exist"),
    );

    const { GET } = await import("@/app/api/deals/route");
    const response = await GET(new NextRequest("http://localhost/api/deals"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      code: "DEALS_SCHEMA_MISSING",
      error: "Deals requires local database setup.",
    });
  });

  it("scopes deal queries to the authenticated organization", async () => {
    const { GET } = await import("@/app/api/deals/route");

    const response = await GET(new NextRequest("http://localhost/api/deals"));

    expect(response.status).toBe(200);
    expect(dealFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
        }),
      }),
    );
  });

  it("searches deals by company name as well as deal name", async () => {
    const { GET } = await import("@/app/api/deals/route");

    const response = await GET(
      new NextRequest("http://localhost/api/deals?search=Acme")
    );

    expect(response.status).toBe(200);
    expect(dealFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          OR: [
            { name: { contains: "Acme", mode: "insensitive" } },
            {
              company: {
                is: {
                  name: { contains: "Acme", mode: "insensitive" },
                },
              },
            },
          ],
        }),
      }),
    );
  });
});
