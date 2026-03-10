import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  enforcePermission: vi.fn(async () => ({ role: "admin" })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      findUnique: vi.fn(),
    },
    integrationRule: {
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/analytics/credentials", () => ({
  getCredentials: vi.fn(),
  hasIntegrationCredential: vi.fn(),
}));

vi.mock("@/lib/integrations/circuit-breaker", () => ({
  getCircuitSnapshot: vi.fn(async () => ({
    state: "CLOSED",
    consecutiveFailures: 0,
    currentCooldownMs: 0,
    openCount: 0,
    nextRetryAt: null,
  })),
}));

vi.mock("@/lib/integrations/orchestrator", () => ({
  runRules: vi.fn(async () => ({
    executedRules: 2,
    startedAt: "2026-03-10T00:00:00.000Z",
    finishedAt: "2026-03-10T00:00:05.000Z",
  })),
}));

describe("POST /api/integrations/[provider]/retry", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("allows retries for env-managed credentials without a stored connection row", async () => {
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");
    const { getCredentials, hasIntegrationCredential } = await import(
      "@/lib/analytics/credentials"
    );
    const { runRules } = await import("@/lib/integrations/orchestrator");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(prisma.integrationConnection.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.integrationRule.count).mockResolvedValue(2 as never);
    vi.mocked(getCredentials).mockResolvedValue({ freshness: {} } as never);
    vi.mocked(hasIntegrationCredential).mockReturnValue(true);

    const { POST } = await import("@/app/api/integrations/[provider]/retry/route");
    const response = await POST(
      new Request("http://localhost/api/integrations/semrush/retry", {
        method: "POST",
      }) as never,
      { params: Promise.resolve({ provider: "semrush" }) } as never
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(runRules).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: ["SEMRUSH"],
        userIds: ["user-1"],
      })
    );
  });
});
