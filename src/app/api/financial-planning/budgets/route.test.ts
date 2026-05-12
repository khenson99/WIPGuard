import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const budgetFindManyMock = vi.hoisted(() => vi.fn());
const budgetCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    budget: {
      findMany: budgetFindManyMock,
      create: budgetCreateMock,
    },
  },
}));

describe("financial planning budgets route", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    authMock.mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.com",
      },
    });

    budgetFindManyMock.mockResolvedValue([]);
    budgetCreateMock.mockResolvedValue({
      id: "budget-1",
      name: "February Budget",
      period: "MONTHLY",
      startDate: new Date("2026-02-01T00:00:00.000Z"),
      endDate: new Date("2026-02-28T00:00:00.000Z"),
      lineItems: [],
    });
  });

  it("defaults endDate to the inclusive period end when omitted", async () => {
    const { POST } = await import("@/app/api/financial-planning/budgets/route");

    const response = await POST(
      new NextRequest("http://localhost/api/financial-planning/budgets", {
        method: "POST",
        body: JSON.stringify({
          name: "February Budget",
          period: "MONTHLY",
          startDate: "2026-02-01",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(budgetCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          startDate: new Date("2026-02-01T00:00:00.000Z"),
          endDate: new Date("2026-02-28T00:00:00.000Z"),
        }),
      }),
    );
  });

  it("normalizes legacy exclusive end dates in GET responses", async () => {
    budgetFindManyMock.mockResolvedValueOnce([
      {
        id: "budget-legacy",
        userId: "user-1",
        name: "Legacy February Budget",
        period: "MONTHLY",
        startDate: new Date("2026-02-01T00:00:00.000Z"),
        endDate: new Date("2026-03-01T00:00:00.000Z"),
        lineItems: [],
      },
    ]);

    const { GET } = await import("@/app/api/financial-planning/budgets/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body[0].endDate).toBe("2026-02-28T00:00:00.000Z");
  });
});
