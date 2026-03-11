import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationProvider } from "@/generated/prisma/client";

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
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/analytics/credentials", () => ({
  getCredentials: vi.fn(),
  hasIntegrationCredential: vi.fn(),
  defaultFreshnessSnapshot: vi.fn((provider: IntegrationProvider) => ({
    provider,
    source: "none",
    status: null,
    connectedAt: null,
    lastSyncedAt: null,
    lastError: null,
  })),
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

describe("GET /api/integrations/[provider]/health", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("treats env-managed credentials as connected when no row exists", async () => {
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");
    const { getCredentials, hasIntegrationCredential } = await import(
      "@/lib/analytics/credentials"
    );

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(prisma.integrationConnection.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.integrationRule.findMany).mockResolvedValue([] as never);
    vi.mocked(hasIntegrationCredential).mockReturnValue(true);
    vi.mocked(getCredentials).mockResolvedValue({
      freshness: {
        [IntegrationProvider.SEMRUSH]: {
          provider: IntegrationProvider.SEMRUSH,
          source: "env",
          status: null,
          connectedAt: null,
          lastSyncedAt: "2026-03-10T00:00:00.000Z",
          lastError: null,
        },
      },
    } as never);

    const { GET } = await import("@/app/api/integrations/[provider]/health/route");
    const response = await GET(
      new Request("http://localhost/api/integrations/semrush/health") as never,
      { params: Promise.resolve({ provider: "semrush" }) } as never
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("CONNECTED");
    expect(body.lastSuccessfulSyncAt).toBe("2026-03-10T00:00:00.000Z");
  });
});
