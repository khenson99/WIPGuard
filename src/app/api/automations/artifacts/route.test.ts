import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/session-user", () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    automationArtifact: {
      findMany: vi.fn(),
    },
  },
}));

describe("GET /api/automations/artifacts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it("returns unauthorized when there is no authenticated user", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAuthenticatedUser } = await import("@/lib/session-user");

    vi.mocked(auth).mockResolvedValue(null as never);
    vi.mocked(getAuthenticatedUser).mockReturnValue(null);

    const { GET } = await import("@/app/api/automations/artifacts/route");
    const response = await GET(
      new NextRequest("http://localhost/api/automations/artifacts")
    );

    expect(response.status).toBe(401);
  });

  it("blocks investor users from operator artifacts", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAuthenticatedUser } = await import("@/lib/session-user");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({ user: { id: "investor_1", role: "investor" } } as never);
    vi.mocked(getAuthenticatedUser).mockReturnValue({
      id: "investor_1",
      role: "investor",
    } as never);

    const { GET } = await import("@/app/api/automations/artifacts/route");
    const response = await GET(
      new NextRequest("http://localhost/api/automations/artifacts")
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden: investors must use investor-scoped APIs",
    });
    expect(prisma.automationArtifact.findMany).not.toHaveBeenCalled();
  });

  it("filters artifacts to the viewer's workflows plus shared workflows", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAuthenticatedUser } = await import("@/lib/session-user");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({ user: { id: "owner_1" } } as never);
    vi.mocked(getAuthenticatedUser).mockReturnValue({ id: "owner_1" } as never);
    vi.mocked(prisma.automationArtifact.findMany).mockResolvedValue([] as never);

    const { GET } = await import("@/app/api/automations/artifacts/route");
    const response = await GET(
      new NextRequest(
        "http://localhost/api/automations/artifacts?workflowId=wf_1&runId=run_1&operatorKey=ads_optimizer"
      )
    );

    expect(response.status).toBe(200);

    const query = vi.mocked(prisma.automationArtifact.findMany).mock.calls[0]?.[0] as {
      where: Record<string, unknown> & {
        workflow: { OR: Array<Record<string, unknown>> };
      };
      take: number;
    };

    expect(query.where).toMatchObject({
      workflowId: "wf_1",
      runId: "run_1",
      operatorKey: "ADS_OPTIMIZER",
    });
    expect(query.where.workflow.OR).toEqual([
      { ownerId: "owner_1" },
      { scope: "SHARED" },
    ]);
    expect(query.take).toBe(200);
  });
});
