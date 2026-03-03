import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    insightPreference: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

function makeGetRequest(url: string) {
  return new Request(url, { method: "GET" }) as never;
}

function makePostRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}

describe("GET /api/insights/preferences", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue(null as never);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest("http://localhost/api/insights/preferences"));

    expect(res.status).toBe(401);
    const json = await res.json() as { error: string };
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 401 when session exists but has no user id", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue({ user: {} } as never);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest("http://localhost/api/insights/preferences"));

    expect(res.status).toBe(401);
  });

  it("returns all preferences for the authenticated user", async () => {
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(prisma.insightPreference.findMany).mockResolvedValue([
      { id: "p1", userId: "user-1", insightId: "ins-a", status: "pinned", createdAt: new Date(), updatedAt: new Date() },
    ] as never);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest("http://localhost/api/insights/preferences"));
    const json = await res.json() as { preferences: unknown[] };

    expect(res.status).toBe(200);
    expect(json.preferences).toHaveLength(1);
    expect(vi.mocked(prisma.insightPreference.findMany)).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  it("filters by insightId when query param is present", async () => {
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(prisma.insightPreference.findMany).mockResolvedValue([] as never);

    const { GET } = await import("../route");
    await GET(makeGetRequest("http://localhost/api/insights/preferences?insightId=ins-a"));

    expect(vi.mocked(prisma.insightPreference.findMany)).toHaveBeenCalledWith({
      where: { userId: "user-1", insightId: "ins-a" },
    });
  });

  it("never leaks other users' preferences (WHERE always includes userId)", async () => {
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-2" } } as never);
    vi.mocked(prisma.insightPreference.findMany).mockResolvedValue([] as never);

    const { GET } = await import("../route");
    await GET(makeGetRequest("http://localhost/api/insights/preferences"));

    const call = vi.mocked(prisma.insightPreference.findMany).mock.calls[0]![0]!;
    expect((call.where as { userId: string }).userId).toBe("user-2");
  });
});

describe("POST /api/insights/preferences", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue(null as never);

    const { POST } = await import("../route");
    const res = await POST(makePostRequest("http://localhost/api/insights/preferences", { insightId: "abc", status: "pinned" }));

    expect(res.status).toBe(401);
  });

  it("creates a pinned preference via upsert", async () => {
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    const fakePreference = { id: "pref-1", userId: "user-1", insightId: "ins-a", status: "pinned" };
    vi.mocked(prisma.insightPreference.upsert).mockResolvedValue(fakePreference as never);

    const { POST } = await import("../route");
    const res = await POST(makePostRequest("http://localhost/api/insights/preferences", { insightId: "ins-a", status: "pinned" }));
    const json = await res.json() as { preference: typeof fakePreference };

    expect(res.status).toBe(200);
    expect(json.preference.status).toBe("pinned");
    expect(vi.mocked(prisma.insightPreference.upsert)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_insightId: { userId: "user-1", insightId: "ins-a" } },
      })
    );
  });

  it("updates a dismissed preference via upsert", async () => {
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(prisma.insightPreference.upsert).mockResolvedValue({ id: "pref-1", status: "dismissed" } as never);

    const { POST } = await import("../route");
    const res = await POST(makePostRequest("http://localhost/api/insights/preferences", { insightId: "ins-b", status: "dismissed" }));

    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.insightPreference.upsert)).toHaveBeenCalled();
  });

  it("deletes the row when status is 'default'", async () => {
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(prisma.insightPreference.deleteMany).mockResolvedValue({ count: 1 } as never);

    const { POST } = await import("../route");
    const res = await POST(makePostRequest("http://localhost/api/insights/preferences", { insightId: "ins-a", status: "default" }));
    const json = await res.json() as { preference: null };

    expect(res.status).toBe(200);
    expect(json.preference).toBeNull();
    expect(vi.mocked(prisma.insightPreference.deleteMany)).toHaveBeenCalledWith({
      where: { userId: "user-1", insightId: "ins-a" },
    });
    expect(vi.mocked(prisma.insightPreference.upsert)).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid status", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);

    const { POST } = await import("../route");
    const res = await POST(makePostRequest("http://localhost/api/insights/preferences", { insightId: "abc", status: "archived" }));

    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toContain("status");
  });

  it("returns 400 when insightId is missing", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);

    const { POST } = await import("../route");
    const res = await POST(makePostRequest("http://localhost/api/insights/preferences", { status: "pinned" }));

    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toContain("insightId");
  });

  it("returns 400 when insightId exceeds 256 chars", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);

    const { POST } = await import("../route");
    const res = await POST(makePostRequest("http://localhost/api/insights/preferences", { insightId: "x".repeat(257), status: "pinned" }));

    expect(res.status).toBe(400);
  });
});
