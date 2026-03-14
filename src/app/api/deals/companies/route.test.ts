import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const dealCompanyFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: authMock,
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

    dealCompanyFindManyMock.mockResolvedValue([]);
  });

  it("returns setup-required when the deals schema is missing", async () => {
    dealCompanyFindManyMock.mockRejectedValueOnce(
      new Error("The table `public.DealCompany` does not exist"),
    );

    const { GET } = await import("@/app/api/deals/companies/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      code: "DEALS_SCHEMA_MISSING",
      error: "Deals requires local database setup.",
    });
  });
});
