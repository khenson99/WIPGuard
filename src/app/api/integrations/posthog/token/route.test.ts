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
  verifyPostHogApiToken: vi.fn(),
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

describe("POST /api/integrations/posthog/token", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.POSTHOG_PROJECT_ID;
    delete process.env.POSTHOG_HOST;
    delete process.env.POSTHOG_API_HOST;
  });

  it("persists a verified PostHog personal API key and project settings", async () => {
    const { auth } = await import("@/lib/auth");
    const { getIntegrationEnvValue } = await import("@/lib/integrations/env");
    const { ensureIntegrationOwnerOrganizationId } = await import("@/lib/integrations/ownership");
    const { verifyPostHogApiToken } = await import("@/lib/integrations/oauth");
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
    vi.mocked(verifyPostHogApiToken).mockResolvedValue({
      providerAccountId: "12345",
      accountLabel: "Arda Product",
      metadata: {
        projectId: "12345",
        host: "https://us.posthog.com",
        projectName: "Arda Product",
      },
    });

    const { POST } = await import("@/app/api/integrations/posthog/token/route");
    const request = new Request("http://localhost/api/integrations/posthog/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: "phx_token",
        projectId: "12345",
        host: "https://us.posthog.com",
      }),
    }) as unknown as NextRequest;

    const response = await POST(request);
    const body = (await response.json()) as { ok: boolean; projectId: string; host: string };

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, projectId: "12345", host: "https://us.posthog.com" });
    expect(verifyPostHogApiToken).toHaveBeenCalledWith({
      token: "phx_token",
      projectId: "12345",
      host: "https://us.posthog.com",
    });
    expect(prisma.integrationConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_provider: {
            userId: "user-1",
            provider: IntegrationProvider.POSTHOG,
          },
        },
        create: expect.objectContaining({
          organizationId: "org-1",
          accessToken: "enc:phx_token",
          providerAccountId: "12345",
          accountLabel: "Arda Product",
          metadata: expect.objectContaining({
            authType: "api_token",
            connectedByUserId: "user-1",
            projectId: "12345",
            host: "https://us.posthog.com",
          }),
        }),
        update: expect.objectContaining({
          organizationId: "org-1",
          accessToken: "enc:phx_token",
          providerAccountId: "12345",
          accountLabel: "Arda Product",
        }),
      }),
    );
  });

  it("allows settings-only updates when a token is already saved", async () => {
    const { auth } = await import("@/lib/auth");
    const { getIntegrationEnvValue } = await import("@/lib/integrations/env");
    const { ensureIntegrationOwnerOrganizationId } = await import("@/lib/integrations/ownership");
    const { verifyPostHogApiToken } = await import("@/lib/integrations/oauth");
    const { enforcePermission } = await import("@/lib/permissions");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-2", organizationId: "org-2" },
    } as never);
    vi.mocked(getIntegrationEnvValue).mockReturnValue(undefined);
    vi.mocked(ensureIntegrationOwnerOrganizationId).mockResolvedValue("org-2");
    vi.mocked(enforcePermission).mockResolvedValue({ deniedResponse: null } as never);
    vi.mocked(prisma.integrationConnection.findUnique).mockResolvedValue({
      accessToken: "plainv1.saved-posthog-token",
      metadata: {
        projectId: "old-project",
        host: "https://app.posthog.com",
        custom: "preserved",
      },
    } as never);
    vi.mocked(prisma.integrationConnection.upsert).mockResolvedValue({} as never);
    vi.mocked(verifyPostHogApiToken).mockResolvedValue({
      providerAccountId: "12345",
      accountLabel: "Arda Product",
      metadata: {
        projectId: "12345",
        host: "https://us.posthog.com",
      },
    });

    const { POST } = await import("@/app/api/integrations/posthog/token/route");
    const request = new Request("http://localhost/api/integrations/posthog/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "12345",
        host: "https://us.posthog.com",
      }),
    }) as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(verifyPostHogApiToken).toHaveBeenCalledWith({
      token: "saved-posthog-token",
      projectId: "12345",
      host: "https://us.posthog.com",
    });
    expect(prisma.integrationConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          accessToken: "enc:saved-posthog-token",
          metadata: expect.objectContaining({
            custom: "preserved",
            projectId: "12345",
            host: "https://us.posthog.com",
          }),
        }),
      }),
    );
  });

  it("requires token and project ID when neither is saved nor configured", async () => {
    const { auth } = await import("@/lib/auth");
    const { getIntegrationEnvValue } = await import("@/lib/integrations/env");
    const { ensureIntegrationOwnerOrganizationId } = await import("@/lib/integrations/ownership");
    const { verifyPostHogApiToken } = await import("@/lib/integrations/oauth");
    const { enforcePermission } = await import("@/lib/permissions");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-3", organizationId: "org-3" },
    } as never);
    vi.mocked(getIntegrationEnvValue).mockReturnValue(undefined);
    vi.mocked(ensureIntegrationOwnerOrganizationId).mockResolvedValue("org-3");
    vi.mocked(enforcePermission).mockResolvedValue({ deniedResponse: null } as never);
    vi.mocked(prisma.integrationConnection.findUnique).mockResolvedValue(null as never);

    const { POST } = await import("@/app/api/integrations/posthog/token/route");
    const missingToken = new Request("http://localhost/api/integrations/posthog/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "12345" }),
    }) as unknown as NextRequest;

    const tokenResponse = await POST(missingToken);
    const tokenBody = (await tokenResponse.json()) as { error?: string };

    expect(tokenResponse.status).toBe(400);
    expect(tokenBody.error).toContain("PostHog API token is required");

    vi.mocked(getIntegrationEnvValue).mockReturnValue("phx_env");
    const missingProjectId = new Request("http://localhost/api/integrations/posthog/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }) as unknown as NextRequest;

    const projectResponse = await POST(missingProjectId);
    const projectBody = (await projectResponse.json()) as { error?: string };

    expect(projectResponse.status).toBe(400);
    expect(projectBody.error).toContain("PostHog project ID is required");
    expect(verifyPostHogApiToken).not.toHaveBeenCalled();
    expect(prisma.integrationConnection.upsert).not.toHaveBeenCalled();
  });
});
