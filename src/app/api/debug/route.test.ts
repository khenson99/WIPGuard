import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      findFirst: vi.fn(),
    },
  },
}));

const originalNodeEnv = process.env.NODE_ENV;

describe("GET /api/debug", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.NODE_ENV = "test";
  });

  it("returns 404 in production", async () => {
    process.env.NODE_ENV = "production";

    const { GET } = await import("@/app/api/debug/route");
    const response = await GET();
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(body.error).toBe("Not found");
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue(null as never);

    const { GET } = await import("@/app/api/debug/route");
    const response = await GET();
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns only non-sensitive meta page fields for authenticated requests", async () => {
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(prisma.integrationConnection.findFirst).mockResolvedValue({
      id: "conn-1",
      provider: "META_PAGE",
      status: "CONNECTED",
      updatedAt: "2026-03-08T00:00:00.000Z",
    } as never);

    const { GET } = await import("@/app/api/debug/route");
    const response = await GET();
    const body = (await response.json()) as {
      metaPage: {
        id: string;
        provider: string;
        status: string;
        updatedAt: string;
      };
    };

    expect(response.status).toBe(200);
    expect(prisma.integrationConnection.findFirst).toHaveBeenCalledWith({
      where: { provider: "META_PAGE" },
      select: {
        id: true,
        provider: true,
        status: true,
        updatedAt: true,
      },
    });
    expect(body.metaPage).toEqual({
      id: "conn-1",
      provider: "META_PAGE",
      status: "CONNECTED",
      updatedAt: "2026-03-08T00:00:00.000Z",
    });
  });
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});
