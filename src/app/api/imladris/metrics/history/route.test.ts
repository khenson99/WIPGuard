import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({
    user: {
      id: "user_1",
      email: "founder@example.com",
      organizationId: "org_1",
    },
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    imladrisCanonicalMetricValue: {
      findMany: vi.fn(async () => []),
    },
  },
}));

describe("GET /api/imladris/metrics/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serves the signed-in user's metric history payload", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new NextRequest("http://localhost/api/imladris/metrics/history?months=13"),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.product).toBe("Imladris");
    expect(typeof payload.generatedAt).toBe("string");
    expect(Date.parse(payload.generatedAt)).not.toBeNaN();
    expect(Array.isArray(payload.months)).toBe(true);
    expect(Array.isArray(payload.metrics)).toBe(true);
    expect(payload.months).toHaveLength(13);
  });

  it("honors a custom ?months value in the axis length", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new NextRequest("http://localhost/api/imladris/metrics/history?months=6"),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.months).toHaveLength(6);
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const { GET } = await import("./route");

    const response = await GET(
      new NextRequest("http://localhost/api/imladris/metrics/history?months=13"),
    );

    expect(response.status).not.toBe(200);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });
});
