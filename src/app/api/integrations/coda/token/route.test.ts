import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  enforcePermission: vi.fn(),
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
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("accepts docUrl and persists normalized docId", async () => {
    const { auth } = await import("@/lib/auth");
    const { enforcePermission } = await import("@/lib/permissions");
    const { verifyCodaApiToken } = await import("@/lib/integrations/oauth");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
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
        where: {
          userId_provider: {
            userId: "user-1",
            provider: IntegrationProvider.CODA,
          },
        },
        update: expect.objectContaining({
          metadata: expect.objectContaining({
            docId: "dAbCdEF1234",
          }),
        }),
      })
    );
  });

  it("keeps prior docId when no doc input is provided", async () => {
    const { auth } = await import("@/lib/auth");
    const { enforcePermission } = await import("@/lib/permissions");
    const { verifyCodaApiToken } = await import("@/lib/integrations/oauth");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-2" } } as never);
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
    const { enforcePermission } = await import("@/lib/permissions");
    const { verifyCodaApiToken } = await import("@/lib/integrations/oauth");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-3" } } as never);
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

  it("still requires token when no connection exists", async () => {
    const { auth } = await import("@/lib/auth");
    const { enforcePermission } = await import("@/lib/permissions");
    const { verifyCodaApiToken } = await import("@/lib/integrations/oauth");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-4" } } as never);
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
