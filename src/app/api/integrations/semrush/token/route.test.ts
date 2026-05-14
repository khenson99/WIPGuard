import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";

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
}));

vi.mock("@/lib/integrations/token-crypto", () => ({
  protectIntegrationSecret: (value: string) => `enc:${value}`,
  unprotectIntegrationSecret: (value: string | null) =>
    value?.startsWith("plainv1.") ? value.slice("plainv1.".length) : value,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe("POST /api/integrations/semrush/token", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.SEMRUSH_API_TOKEN;
    delete process.env.SEMRUSH_DOMAIN;
  });

  afterEach(() => {
    delete process.env.SEMRUSH_API_TOKEN;
    delete process.env.SEMRUSH_DOMAIN;
  });

  it("persists a new SEMrush token and target domain", async () => {
    const { auth } = await import("@/lib/auth");
    const { ensureIntegrationOwnerOrganizationId } = await import("@/lib/integrations/ownership");
    const { enforcePermission } = await import("@/lib/permissions");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", organizationId: "org-1" },
    } as never);
    vi.mocked(ensureIntegrationOwnerOrganizationId).mockResolvedValue("org-1");
    vi.mocked(enforcePermission).mockResolvedValue({ deniedResponse: null } as never);
    vi.mocked(prisma.integrationConnection.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.integrationConnection.upsert).mockResolvedValue({} as never);

    const { POST } = await import("@/app/api/integrations/semrush/token/route");
    const request = new Request("http://localhost/api/integrations/semrush/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: "semrush-token",
        domain: "example.com",
      }),
    }) as unknown as NextRequest;

    const response = await POST(request);
    const body = (await response.json()) as { ok: boolean; domain: string };

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, domain: "example.com" });
    expect(prisma.integrationConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_provider: {
            userId: "user-1",
            provider: IntegrationProvider.SEMRUSH,
          },
        },
        create: expect.objectContaining({
          organizationId: "org-1",
          accessToken: "enc:semrush-token",
          accountLabel: "example.com",
          metadata: expect.objectContaining({
            authType: "api_token",
            connectedByUserId: "user-1",
            domain: "example.com",
          }),
        }),
        update: expect.objectContaining({
          organizationId: "org-1",
          accessToken: "enc:semrush-token",
          accountLabel: "example.com",
          metadata: expect.objectContaining({
            domain: "example.com",
          }),
        }),
      })
    );
  });

  it("allows domain-only updates when a saved token already exists", async () => {
    const { auth } = await import("@/lib/auth");
    const { ensureIntegrationOwnerOrganizationId } = await import("@/lib/integrations/ownership");
    const { enforcePermission } = await import("@/lib/permissions");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-2", organizationId: "org-2" },
    } as never);
    vi.mocked(ensureIntegrationOwnerOrganizationId).mockResolvedValue("org-2");
    vi.mocked(enforcePermission).mockResolvedValue({ deniedResponse: null } as never);
    vi.mocked(prisma.integrationConnection.findUnique).mockResolvedValue({
      accessToken: "plainv1.saved-semrush-token",
      metadata: {
        authType: "api_token",
        domain: "old.example.com",
        custom: "preserved",
      },
    } as never);
    vi.mocked(prisma.integrationConnection.upsert).mockResolvedValue({} as never);

    const { POST } = await import("@/app/api/integrations/semrush/token/route");
    const request = new Request("http://localhost/api/integrations/semrush/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        domain: "example.com",
      }),
    }) as unknown as NextRequest;

    const response = await POST(request);
    const body = (await response.json()) as { ok: boolean; domain: string };

    expect(response.status).toBe(200);
    expect(body.domain).toBe("example.com");
    expect(prisma.integrationConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          accessToken: "enc:saved-semrush-token",
          metadata: expect.objectContaining({
            custom: "preserved",
            domain: "example.com",
          }),
        }),
      })
    );
  });

  it("still requires token and domain when neither is saved nor provided", async () => {
    const { auth } = await import("@/lib/auth");
    const { ensureIntegrationOwnerOrganizationId } = await import("@/lib/integrations/ownership");
    const { enforcePermission } = await import("@/lib/permissions");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-3", organizationId: "org-3" },
    } as never);
    vi.mocked(ensureIntegrationOwnerOrganizationId).mockResolvedValue("org-3");
    vi.mocked(enforcePermission).mockResolvedValue({ deniedResponse: null } as never);
    vi.mocked(prisma.integrationConnection.findUnique).mockResolvedValue(null as never);

    const { POST } = await import("@/app/api/integrations/semrush/token/route");
    const missingToken = new Request("http://localhost/api/integrations/semrush/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        domain: "example.com",
      }),
    }) as unknown as NextRequest;

    const tokenResponse = await POST(missingToken);
    const tokenBody = (await tokenResponse.json()) as { error?: string };

    expect(tokenResponse.status).toBe(400);
    expect(tokenBody.error).toContain("SEMrush API Token is required");
    expect(prisma.integrationConnection.upsert).not.toHaveBeenCalled();

    process.env.SEMRUSH_API_TOKEN = "env-token";
    const missingDomain = new Request("http://localhost/api/integrations/semrush/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }) as unknown as NextRequest;

    const domainResponse = await POST(missingDomain);
    const domainBody = (await domainResponse.json()) as { error?: string };

    expect(domainResponse.status).toBe(400);
    expect(domainBody.error).toContain("SEMrush Target Domain is required");
    expect(prisma.integrationConnection.upsert).not.toHaveBeenCalled();
  });
});
