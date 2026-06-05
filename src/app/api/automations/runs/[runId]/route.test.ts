import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/automations/service", () => ({
  assertCanViewWorkflow: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflowRun: {
      findUnique: vi.fn(),
    },
  },
}));

describe("GET /api/automations/runs/[runId]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it("blocks investor users from automation run internals", async () => {
    const { auth } = await import("@/lib/auth");
    const { assertCanViewWorkflow } = await import("@/lib/automations/service");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "investor_1", role: "investor" },
    } as never);

    const { GET } = await import("@/app/api/automations/runs/[runId]/route");
    const response = await GET(
      new Request("http://localhost/api/automations/runs/run_1") as unknown as NextRequest,
      {
        params: Promise.resolve({ runId: "run_1" }),
      }
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden: investors must use investor-scoped APIs",
    });
    expect(prisma.workflowRun.findUnique).not.toHaveBeenCalled();
    expect(assertCanViewWorkflow).not.toHaveBeenCalled();
  });

  it("requests only non-sensitive ai job fields", async () => {
    const { auth } = await import("@/lib/auth");
    const { assertCanViewWorkflow } = await import("@/lib/automations/service");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({ user: { id: "viewer_1" } } as never);
    vi.mocked(assertCanViewWorkflow).mockResolvedValue({ id: "wf_1" } as never);
    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue({
      id: "run_1",
      workflowId: "wf_1",
      workflow: {
        id: "wf_1",
        ownerId: "viewer_1",
        scope: "PRIVATE",
      },
      steps: [],
      sourceDocuments: [],
      artifacts: [],
      recommendations: [],
      aiJobs: [],
      approvals: [],
    } as never);

    const { GET } = await import("@/app/api/automations/runs/[runId]/route");
    const response = await GET(
      new Request("http://localhost/api/automations/runs/run_1") as unknown as NextRequest,
      {
        params: Promise.resolve({ runId: "run_1" }),
      }
    );

    expect(response.status).toBe(200);

    const query = vi.mocked(prisma.workflowRun.findUnique).mock.calls[0]?.[0] as unknown as {
      include: {
        aiJobs: {
          select: Record<string, boolean>;
        };
      };
    };
    const aiJobSelect = query.include.aiJobs.select;

    expect(aiJobSelect).toMatchObject({
      id: true,
      stepId: true,
      operatorKey: true,
      nodeKey: true,
      jobType: true,
      status: true,
      provider: true,
      model: true,
      promptVersion: true,
      responseId: true,
      responseStatus: true,
      lastError: true,
      attemptCount: true,
      nextAttemptAt: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
    });
    expect(aiJobSelect.requestPayload).toBeUndefined();
    expect(aiJobSelect.responsePayload).toBeUndefined();
    expect(aiJobSelect.outputText).toBeUndefined();
    expect(aiJobSelect.parsedOutput).toBeUndefined();
    expect(aiJobSelect.metadata).toBeUndefined();
  });
});
