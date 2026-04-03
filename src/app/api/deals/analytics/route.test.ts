import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const enforcePermissionMock = vi.hoisted(() => vi.fn());
const dealFindManyMock = vi.hoisted(() => vi.fn());
const dealMeetingFindManyMock = vi.hoisted(() => vi.fn());
const dealStageHistoryFindManyMock = vi.hoisted(() => vi.fn());

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
    },
    dealMeeting: {
      findMany: dealMeetingFindManyMock,
    },
    dealStageHistory: {
      findMany: dealStageHistoryFindManyMock,
    },
  },
}));

describe("deals analytics route", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    authMock.mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.com",
        organizationId: "org-1",
      },
    });

    enforcePermissionMock.mockResolvedValue({ role: "member" });
    dealFindManyMock.mockResolvedValue([]);
    dealMeetingFindManyMock.mockResolvedValue([]);
    dealStageHistoryFindManyMock.mockResolvedValue([]);
  });

  it("returns setup-required when the deals schema is missing", async () => {
    dealFindManyMock.mockRejectedValueOnce(
      new Error("The table `public.Deal` does not exist"),
    );

    const { GET } = await import("@/app/api/deals/analytics/route");
    const response = await GET(new NextRequest("http://localhost/api/deals/analytics"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      code: "DEALS_SCHEMA_MISSING",
      error: "Deals requires local database setup.",
    });
  });

  it("scopes analytics queries to the authenticated organization", async () => {
    const { GET } = await import("@/app/api/deals/analytics/route");

    const response = await GET(new NextRequest("http://localhost/api/deals/analytics"));

    expect(response.status).toBe(200);
    expect(dealFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1" },
      }),
    );
    expect(dealMeetingFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deal: { organizationId: "org-1" } },
      }),
    );
    expect(dealStageHistoryFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deal: { organizationId: "org-1" } },
      }),
    );
  });

  it("blocks analytics when read permission is denied", async () => {
    enforcePermissionMock.mockResolvedValueOnce({
      role: "observer",
      deniedResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const { GET } = await import("@/app/api/deals/analytics/route");
    const response = await GET(new NextRequest("http://localhost/api/deals/analytics"));

    expect(response.status).toBe(403);
    expect(dealFindManyMock).not.toHaveBeenCalled();
    expect(dealMeetingFindManyMock).not.toHaveBeenCalled();
    expect(dealStageHistoryFindManyMock).not.toHaveBeenCalled();
  });
});
