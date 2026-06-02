import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { IntegrationConnectionStatus, IntegrationProvider } from "@/generated/prisma/client";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  enforcePermission: vi.fn(),
}));

vi.mock("@/lib/integrations/ownership", () => ({
  ensureIntegrationOwnerOrganizationId: vi.fn(),
  resolveIntegrationOwnerUserId: vi.fn((userId: string) => userId),
}));

vi.mock("@/lib/integrations/oauth", () => ({
  compactErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Integration request failed",
  verifyCodaApiToken: vi.fn(),
}));

vi.mock("@/lib/integrations/token-crypto", () => ({
  protectIntegrationSecret: (value: string) => `enc:${value}`,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe("POST /api/integrations/coda/token", () => {
  const originalCodaApiToken = process.env.CODA_API_TOKEN;

  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.CODA_API_TOKEN;
  });

  afterEach(() => {
    if (originalCodaApiToken === undefined) {
      delete process.env.CODA_API_TOKEN;
    } else {
      process.env.CODA_API_TOKEN = originalCodaApiToken;
    }
  });

  it("accepts docUrl and persists normalized docId", async () => {
    const { auth } = await import("@/lib/auth");
    const { ensureIntegrationOwnerOrganizationId } = await import("@/lib/integrations/ownership");
    const { enforcePermission } = await import("@/lib/permissions");
    const { verifyCodaApiToken } = await import("@/lib/integrations/oauth");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", organizationId: "org-1" },
    } as never);
    vi.mocked(ensureIntegrationOwnerOrganizationId).mockResolvedValue("org-1");
    vi.mocked(enforcePermission).mockResolvedValue({ deniedResponse: null } as never);
    vi.mocked(verifyCodaApiToken).mockResolvedValue({
      providerAccountId: "acct-1",
      accountLabel: "owner@company.com",
      metadata: { email: "owner@company.com" },
    });

    vi.mocked(prisma.integrationConnection.findUnique).mockResolvedValue({
      metadata: { docId: "dOld12345" },
    } as never);
    vi.mocked(prisma.integrationConnection.upsert).mockResolvedValue({} as never);

    const { POST } = await import("@/app/api/integrations/coda/token/route");

    const request = new Request("http://localhost/api/integrations/coda/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: "coda-token-123",
        docUrl: "https://coda.io/d/Revenue-Model_dAbCdEF1234",
      }),
    }) as unknown as NextRequest;

    const response = await POST(request);
    const body = (await response.json()) as { ok: boolean; docId: string | null };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.docId).toBe("dAbCdEF1234");

    expect(prisma.integrationConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          organizationId: "org-1",
        }),
        where: {
          userId_provider: {
            userId: "user-1",
            provider: IntegrationProvider.CODA,
          },
        },
        update: expect.objectContaining({
          organizationId: "org-1",
          metadata: expect.objectContaining({
            docId: "dAbCdEF1234",
          }),
        }),
      })
    );
    expect(ensureIntegrationOwnerOrganizationId).toHaveBeenCalledWith("user-1", "org-1");
  });

  it("keeps prior docId when no doc input is provided", async () => {
    const { auth } = await import("@/lib/auth");
    const { ensureIntegrationOwnerOrganizationId } = await import("@/lib/integrations/ownership");
    const { enforcePermission } = await import("@/lib/permissions");
    const { verifyCodaApiToken } = await import("@/lib/integrations/oauth");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-2", organizationId: "org-2" },
    } as never);
    vi.mocked(ensureIntegrationOwnerOrganizationId).mockResolvedValue("org-2");
    vi.mocked(enforcePermission).mockResolvedValue({ deniedResponse: null } as never);
    vi.mocked(verifyCodaApiToken).mockResolvedValue({
      providerAccountId: "acct-2",
      accountLabel: "owner@company.com",
      metadata: { email: "owner@company.com" },
    });

    vi.mocked(prisma.integrationConnection.findUnique).mockResolvedValue({
      metadata: { docId: "dPersisted123" },
    } as never);
    vi.mocked(prisma.integrationConnection.upsert).mockResolvedValue({} as never);

    const { POST } = await import("@/app/api/integrations/coda/token/route");

    const request = new Request("http://localhost/api/integrations/coda/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: "coda-token-xyz",
      }),
    }) as unknown as NextRequest;

    const response = await POST(request);
    const body = (await response.json()) as { ok: boolean; docId: string | null };

    expect(response.status).toBe(200);
    expect(body.docId).toBe("dPersisted123");
  });

  it("allows docId-only updates for existing connections without token", async () => {
    const { auth } = await import("@/lib/auth");
    const { ensureIntegrationOwnerOrganizationId } = await import("@/lib/integrations/ownership");
    const { enforcePermission } = await import("@/lib/permissions");
    const { verifyCodaApiToken } = await import("@/lib/integrations/oauth");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-3", organizationId: "org-3" },
    } as never);
    vi.mocked(ensureIntegrationOwnerOrganizationId).mockResolvedValue("org-3");
    vi.mocked(enforcePermission).mockResolvedValue({ deniedResponse: null } as never);
    vi.mocked(prisma.integrationConnection.findUnique).mockResolvedValue({
      metadata: { authType: "api_token", docId: "dOldDoc123" },
    } as never);
    vi.mocked(prisma.integrationConnection.update).mockResolvedValue({} as never);

    const { POST } = await import("@/app/api/integrations/coda/token/route");
    const request = new Request("http://localhost/api/integrations/coda/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        docId: "dNewDoc456",
      }),
    }) as unknown as NextRequest;

    const response = await POST(request);
    const body = (await response.json()) as { ok: boolean; docId: string | null };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.docId).toBe("dNewDoc456");
    expect(verifyCodaApiToken).not.toHaveBeenCalled();
    expect(prisma.integrationConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_provider: {
            userId: "user-3",
            provider: IntegrationProvider.CODA,
          },
        },
        data: {
          metadata: expect.objectContaining({
            authType: "api_token",
            docId: "dNewDoc456",
          }),
        },
      })
    );
  });

  it("persists docId-only updates when the existing Coda connection row disappears", async () => {
    const { auth } = await import("@/lib/auth");
    const { ensureIntegrationOwnerOrganizationId } = await import("@/lib/integrations/ownership");
    const { enforcePermission } = await import("@/lib/permissions");
    const { verifyCodaApiToken } = await import("@/lib/integrations/oauth");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-race", organizationId: "org-race" },
    } as never);
    vi.mocked(ensureIntegrationOwnerOrganizationId).mockResolvedValue("org-race");
    vi.mocked(enforcePermission).mockResolvedValue({ deniedResponse: null } as never);
    vi.mocked(prisma.integrationConnection.findUnique).mockResolvedValue({
      metadata: { authType: "api_token", docId: "dOldDoc123" },
    } as never);
    vi.mocked(prisma.integrationConnection.update).mockRejectedValue(
      Object.assign(new Error("Record to update not found."), { code: "P2025" })
    );
    vi.mocked(prisma.integrationConnection.upsert).mockResolvedValue({} as never);

    const { POST } = await import("@/app/api/integrations/coda/token/route");
    const request = new Request("http://localhost/api/integrations/coda/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        docId: "dRaceDoc456",
      }),
    }) as unknown as NextRequest;

    const response = await POST(request);
    const body = (await response.json()) as { ok: boolean; docId: string | null };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.docId).toBe("dRaceDoc456");
    expect(verifyCodaApiToken).not.toHaveBeenCalled();
    expect(prisma.integrationConnection.upsert).toHaveBeenCalledWith({
      where: {
        userId_provider: {
          userId: "user-race",
          provider: IntegrationProvider.CODA,
        },
      },
      create: {
        userId: "user-race",
        provider: IntegrationProvider.CODA,
        status: IntegrationConnectionStatus.ERROR,
        lastError: "Coda token is required to reconnect this doc sync.",
        metadata: {
          authType: "api_token",
          docId: "dRaceDoc456",
        },
        organizationId: "org-race",
      },
      update: {
        metadata: {
          authType: "api_token",
          docId: "dRaceDoc456",
        },
      },
    });
  });

  it("still requires token when no connection exists", async () => {
    const { auth } = await import("@/lib/auth");
    const { ensureIntegrationOwnerOrganizationId } = await import("@/lib/integrations/ownership");
    const { enforcePermission } = await import("@/lib/permissions");
    const { verifyCodaApiToken } = await import("@/lib/integrations/oauth");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-4", organizationId: "org-4" },
    } as never);
    vi.mocked(ensureIntegrationOwnerOrganizationId).mockResolvedValue("org-4");
    vi.mocked(enforcePermission).mockResolvedValue({ deniedResponse: null } as never);
    vi.mocked(prisma.integrationConnection.findUnique).mockResolvedValue(null as never);

    const { POST } = await import("@/app/api/integrations/coda/token/route");
    const request = new Request("http://localhost/api/integrations/coda/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        docId: "dFreshDoc789",
      }),
    }) as unknown as NextRequest;

    const response = await POST(request);
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain("Coda API token is required");
    expect(verifyCodaApiToken).not.toHaveBeenCalled();
  });
});
