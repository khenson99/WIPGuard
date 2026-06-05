import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  getAppRole: vi.fn(),
  normalizeRole: (role: string | null | undefined) => (role === "investor" ? "investor" : role ?? "member"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflowApproval: {
      findMany: vi.fn(),
    },
  },
}));

describe("GET /api/automations/approvals", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it("blocks investor users from operator approvals", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAppRole } = await import("@/lib/permissions");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "investor_1", role: "investor" },
    } as never);

    const { GET } = await import("@/app/api/automations/approvals/route");
    const response = await GET(
      new NextRequest("http://localhost/api/automations/approvals"),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden: investors must use investor-scoped APIs",
    });
    expect(getAppRole).not.toHaveBeenCalled();
    expect(prisma.workflowApproval.findMany).not.toHaveBeenCalled();
  });
});
