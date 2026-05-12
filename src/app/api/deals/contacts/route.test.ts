import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const enforcePermissionMock = vi.hoisted(() => vi.fn());
const dealContactFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/permissions", () => ({
  enforcePermission: enforcePermissionMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dealContact: {
      findMany: dealContactFindManyMock,
    },
  },
}));

describe("deal contacts route", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    authMock.mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.com",
      },
    });

    enforcePermissionMock.mockResolvedValue({ role: "member" });
    dealContactFindManyMock.mockResolvedValue([]);
  });

  it("returns setup-required when the deals schema is missing", async () => {
    dealContactFindManyMock.mockRejectedValueOnce(
      new Error("The table `public.DealContact` does not exist"),
    );

    const { GET } = await import("@/app/api/deals/contacts/route");
    const response = await GET(new NextRequest("http://localhost/api/deals/contacts"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      code: "DEALS_SCHEMA_MISSING",
      error: "Deals requires local database setup.",
    });
  });

  it("blocks contact lookup when read permission is denied", async () => {
    enforcePermissionMock.mockResolvedValueOnce({
      role: "observer",
      deniedResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const { GET } = await import("@/app/api/deals/contacts/route");
    const response = await GET(new NextRequest("http://localhost/api/deals/contacts"));

    expect(response.status).toBe(403);
    expect(dealContactFindManyMock).not.toHaveBeenCalled();
  });
});
