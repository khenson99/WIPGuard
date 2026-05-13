import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const enforcePermissionMock = vi.hoisted(() => vi.fn());
const dealCompanyFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/permissions", () => ({
  enforcePermission: enforcePermissionMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dealCompany: {
      findMany: dealCompanyFindManyMock,
    },
  },
}));

describe("deal companies route", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    authMock.mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.com",
      },
    });

    enforcePermissionMock.mockResolvedValue({ role: "member" });
    dealCompanyFindManyMock.mockResolvedValue([]);
  });

  it("returns setup-required when the deals schema is missing", async () => {
    dealCompanyFindManyMock.mockRejectedValueOnce(
      new Error("The table `public.DealCompany` does not exist"),
    );

    const { GET } = await import("@/app/api/deals/companies/route");
    const response = await GET(new NextRequest("http://localhost/api/deals/companies"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      code: "DEALS_SCHEMA_MISSING",
      error: "Deals requires local database setup.",
    });
  });

  it("blocks company lookup when read permission is denied", async () => {
    enforcePermissionMock.mockResolvedValueOnce({
      role: "observer",
      deniedResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const { GET } = await import("@/app/api/deals/companies/route");
    const response = await GET(new NextRequest("http://localhost/api/deals/companies"));

    expect(response.status).toBe(403);
    expect(dealCompanyFindManyMock).not.toHaveBeenCalled();
  });
});
