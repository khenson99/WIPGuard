import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const txMocks = vi.hoisted(() => ({
  dealUpdate: vi.fn(),
  dealUpdateMany: vi.fn(),
  dealStageHistoryCreate: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/permissions", () => ({
  enforcePermission: vi.fn(async () => ({ role: "member" })),
}));

vi.mock("@/lib/deals/stage-transitions", () => ({
  validateStageTransition: vi.fn(() => ({ valid: true })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(async (input: unknown) => {
      if (typeof input !== "function") {
        throw new Error("Expected interactive transaction");
      }

      return input({
        deal: {
          update: txMocks.dealUpdate,
          updateMany: txMocks.dealUpdateMany,
        },
        dealStageHistory: {
          create: txMocks.dealStageHistoryCreate,
        },
      });
    }),
  },
}));

describe("deal detail route", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();

    txMocks.dealUpdate.mockResolvedValue({});
    txMocks.dealUpdateMany.mockResolvedValue({ count: 1 });
    txMocks.dealStageHistoryCreate.mockResolvedValue({});

    const { getServerSession } = await import("next-auth");
    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.com",
        role: "member",
      },
    } as never);

    const { enforcePermission } = await import("@/lib/permissions");
    vi.mocked(enforcePermission).mockResolvedValue({
      role: "member",
    } as never);
  });

  it("blocks GET /api/deals/[id] when read permission is denied", async () => {
    const { enforcePermission } = await import("@/lib/permissions");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(enforcePermission).mockResolvedValue({
      role: "observer",
      deniedResponse: NextResponse.json(
        { error: "Forbidden: insufficient permissions" },
        { status: 403 }
      ),
    } as never);

    const { GET } = await import("@/app/api/deals/[id]/route");
    const response = await GET(new NextRequest("http://localhost/api/deals/deal-1"), {
      params: Promise.resolve({ id: "deal-1" }),
    });

    expect(response.status).toBe(403);
    expect(prisma.deal.findFirst).not.toHaveBeenCalled();
  });

  it("records stage history inside the deal update transaction", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.deal.findFirst)
      .mockResolvedValueOnce({
        id: "deal-1",
        stage: "LEAD",
      } as never)
      .mockResolvedValueOnce({
        id: "deal-1",
        stage: "QUALIFIED",
        company: null,
        contacts: [],
        meetings: [],
        stageHistory: [],
        owner: { id: "user-1", name: "Owner", email: "owner@example.com" },
      } as never);

    const { PATCH } = await import("@/app/api/deals/[id]/route");
    const response = await PATCH(
      new NextRequest("http://localhost/api/deals/deal-1", {
        method: "PATCH",
        body: JSON.stringify({ stage: "QUALIFIED" }),
      }),
      {
        params: Promise.resolve({ id: "deal-1" }),
      }
    );

    expect(response.status).toBe(200);
    expect(txMocks.dealUpdate).toHaveBeenCalledWith({
      where: { id: "deal-1" },
      data: { stage: "QUALIFIED" },
    });
    expect(txMocks.dealStageHistoryCreate).toHaveBeenCalledWith({
      data: {
        dealId: "deal-1",
        fromStage: "LEAD",
        toStage: "QUALIFIED",
        changedBy: "user-1",
      },
    });
  });
});
