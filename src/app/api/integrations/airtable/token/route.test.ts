import { beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("@/lib/integrations/airtable", () => ({
  verifyAirtableConnection: vi.fn(),
}));

vi.mock("@/lib/integrations/oauth", () => ({
  compactErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Integration request failed",
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

describe("POST /api/integrations/airtable/token", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("stores an Airtable token with base metadata", async () => {
    const { auth } = await import("@/lib/auth");
    const { ensureIntegrationOwnerOrganizationId } = await import("@/lib/integrations/ownership");
    const { enforcePermission } = await import("@/lib/permissions");
    const { verifyAirtableConnection } = await import("@/lib/integrations/airtable");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", organizationId: "org-1" },
    } as never);
    vi.mocked(ensureIntegrationOwnerOrganizationId).mockResolvedValue("org-1");
    vi.mocked(enforcePermission).mockResolvedValue({ deniedResponse: null } as never);
    vi.mocked(verifyAirtableConnection).mockResolvedValue({
      providerAccountId: "appBase123",
      accountLabel: "appBase123 / Tasks",
      metadata: { baseId: "appBase123", tableName: "Tasks" },
    });
    vi.mocked(prisma.integrationConnection.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.integrationConnection.upsert).mockResolvedValue({} as never);

    const { POST } = await import("@/app/api/integrations/airtable/token/route");
    const request = new Request("http://localhost/api/integrations/airtable/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: "pat123",
        baseId: "appBase123",
        tableName: "Tasks",
      }),
    }) as unknown as NextRequest;

    const response = await POST(request);
    const body = (await response.json()) as { ok: boolean; baseId: string; tableName: string };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      baseId: "appBase123",
      tableName: "Tasks",
    });
    expect(prisma.integrationConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_provider: {
            userId: "user-1",
            provider: IntegrationProvider.AIRTABLE,
          },
        },
        create: expect.objectContaining({
          organizationId: "org-1",
          accountLabel: "appBase123 / Tasks",
        }),
        update: expect.objectContaining({
          organizationId: "org-1",
          metadata: expect.objectContaining({
            baseId: "appBase123",
            tableName: "Tasks",
          }),
        }),
      })
    );
  });

  it("allows metadata-only updates when a connection already exists", async () => {
    const { auth } = await import("@/lib/auth");
    const { ensureIntegrationOwnerOrganizationId } = await import("@/lib/integrations/ownership");
    const { enforcePermission } = await import("@/lib/permissions");
    const { verifyAirtableConnection } = await import("@/lib/integrations/airtable");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-2", organizationId: "org-2" },
    } as never);
    vi.mocked(ensureIntegrationOwnerOrganizationId).mockResolvedValue("org-2");
    vi.mocked(enforcePermission).mockResolvedValue({ deniedResponse: null } as never);
    vi.mocked(prisma.integrationConnection.findUnique).mockResolvedValue({
      metadata: { baseId: "appOld", tableName: "Old Tasks" },
    } as never);
    vi.mocked(prisma.integrationConnection.update).mockResolvedValue({} as never);

    const { POST } = await import("@/app/api/integrations/airtable/token/route");
    const request = new Request("http://localhost/api/integrations/airtable/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        baseId: "appNew",
        tableName: "Tasks",
      }),
    }) as unknown as NextRequest;

    const response = await POST(request);
    const body = (await response.json()) as { ok: boolean; baseId: string; tableName: string };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      baseId: "appNew",
      tableName: "Tasks",
    });
    expect(verifyAirtableConnection).not.toHaveBeenCalled();
    expect(prisma.integrationConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_provider: {
            userId: "user-2",
            provider: IntegrationProvider.AIRTABLE,
          },
        },
        data: {
          metadata: expect.objectContaining({
            baseId: "appNew",
            tableName: "Tasks",
          }),
        },
      })
    );
  });
});
