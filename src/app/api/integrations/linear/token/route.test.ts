import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  enforcePermission: vi.fn(),
}));

vi.mock("@/lib/integrations/env", () => ({
  getIntegrationEnvValue: vi.fn(),
}));

vi.mock("@/lib/integrations/ownership", () => ({
  ensureIntegrationOwnerOrganizationId: vi.fn(),
  resolveIntegrationOwnerUserId: vi.fn((userId: string) => userId),
}));

vi.mock("@/lib/integrations/oauth", () => ({
  compactErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Integration request failed",
  verifyLinearApiToken: vi.fn(),
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

describe("POST /api/integrations/linear/token", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("persists a verified Linear API token", async () => {
    const { auth } = await import("@/lib/auth");
    const { getIntegrationEnvValue } = await import("@/lib/integrations/env");
    const { ensureIntegrationOwnerOrganizationId } = await import("@/lib/integrations/ownership");
    const { verifyLinearApiToken } = await import("@/lib/integrations/oauth");
    const { enforcePermission } = await import("@/lib/permissions");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", organizationId: "org-1" },
    } as never);
    vi.mocked(getIntegrationEnvValue).mockReturnValue(undefined);
    vi.mocked(ensureIntegrationOwnerOrganizationId).mockResolvedValue("org-1");
    vi.mocked(enforcePermission).mockResolvedValue({ deniedResponse: null } as never);
    vi.mocked(prisma.integrationConnection.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.integrationConnection.upsert).mockResolvedValue({} as never);
    vi.mocked(verifyLinearApiToken).mockResolvedValue({
      providerAccountId: "linear-user-1",
      accountLabel: "Ada Lovelace",
      metadata: { email: "ada@example.com" },
    });

    const { POST } = await import("@/app/api/integrations/linear/token/route");
    const request = new Request("http://localhost/api/integrations/linear/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "lin_api_token" }),
    }) as unknown as NextRequest;

    const response = await POST(request);
    const body = (await response.json()) as { ok: boolean };

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(verifyLinearApiToken).toHaveBeenCalledWith("lin_api_token");
    expect(prisma.integrationConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_provider: {
            userId: "user-1",
            provider: IntegrationProvider.LINEAR,
          },
        },
        create: expect.objectContaining({
          organizationId: "org-1",
          accessToken: "enc:lin_api_token",
          providerAccountId: "linear-user-1",
          accountLabel: "Ada Lovelace",
          metadata: expect.objectContaining({
            authType: "api_token",
            connectedByUserId: "user-1",
            email: "ada@example.com",
          }),
        }),
        update: expect.objectContaining({
          organizationId: "org-1",
          accessToken: "enc:lin_api_token",
          providerAccountId: "linear-user-1",
          accountLabel: "Ada Lovelace",
        }),
      }),
    );
  });

  it("requires a token when none is provided, saved, or configured", async () => {
    const { auth } = await import("@/lib/auth");
    const { getIntegrationEnvValue } = await import("@/lib/integrations/env");
    const { ensureIntegrationOwnerOrganizationId } = await import("@/lib/integrations/ownership");
    const { verifyLinearApiToken } = await import("@/lib/integrations/oauth");
    const { enforcePermission } = await import("@/lib/permissions");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-2", organizationId: "org-2" },
    } as never);
    vi.mocked(getIntegrationEnvValue).mockReturnValue(undefined);
    vi.mocked(ensureIntegrationOwnerOrganizationId).mockResolvedValue("org-2");
    vi.mocked(enforcePermission).mockResolvedValue({ deniedResponse: null } as never);
    vi.mocked(prisma.integrationConnection.findUnique).mockResolvedValue(null as never);

    const { POST } = await import("@/app/api/integrations/linear/token/route");
    const request = new Request("http://localhost/api/integrations/linear/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }) as unknown as NextRequest;

    const response = await POST(request);
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain("Linear API token is required");
    expect(verifyLinearApiToken).not.toHaveBeenCalled();
    expect(prisma.integrationConnection.upsert).not.toHaveBeenCalled();
  });
});
