import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();
const userCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    user: { count: (...args: unknown[]) => userCount(...args) },
  },
}));

const ENV_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
] as const;
const savedEnv: Record<string, string | undefined> = {};

function healthyDbMocks() {
  queryRaw
    .mockResolvedValueOnce([{ applied: 42, failed: 0 }])
    .mockResolvedValueOnce([{ can_insert_user: true, can_insert_account: true }]);
  userCount.mockResolvedValue(3);
}

describe("GET /api/health/auth", () => {
  beforeEach(() => {
    vi.resetModules();
    queryRaw.mockReset();
    userCount.mockReset();
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
    }
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.NEXTAUTH_SECRET = "secret";
    process.env.NEXTAUTH_URL = "https://app.example.com";
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it("reports ok when provider config, database, and migrations are healthy", async () => {
    healthyDbMocks();
    const { GET } = await import("@/app/api/health/auth/route");
    const response = await GET(
      new NextRequest("https://app.example.com/api/health/auth", {
        headers: { host: "app.example.com" },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(payload.checks.googleProviderConfigured).toBe(true);
    expect(payload.checks.nextauthUrl.matchesRequestHost).toBe(true);
    expect(payload.checks.database).toMatchObject({
      reachable: true,
      canInsertUser: true,
      canInsertAccount: true,
      userCount: 3,
    });
    expect(payload.checks.migrations).toEqual({ applied: 42, failed: 0 });
  });

  it("degrades and surfaces the Prisma error code when the database is unreachable", async () => {
    queryRaw.mockRejectedValue(Object.assign(new Error("connect failed"), { code: "P1001" }));
    const { GET } = await import("@/app/api/health/auth/route");
    const response = await GET(
      new NextRequest("https://app.example.com/api/health/auth"),
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.status).toBe("degraded");
    expect(payload.checks.database).toMatchObject({
      reachable: false,
      errorCode: "P1001",
    });
  });

  it("degrades when Google credentials are missing and flags host mismatch", async () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    healthyDbMocks();
    const { GET } = await import("@/app/api/health/auth/route");
    const response = await GET(
      new NextRequest("https://other-host.example.com/api/health/auth", {
        headers: { "x-forwarded-host": "other-host.example.com" },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.checks.googleProviderConfigured).toBe(false);
    expect(payload.checks.nextauthUrl.matchesRequestHost).toBe(false);
  });

  it("degrades when a migration is stuck unapplied", async () => {
    queryRaw
      .mockResolvedValueOnce([{ applied: 41, failed: 1 }])
      .mockResolvedValueOnce([{ can_insert_user: true, can_insert_account: true }]);
    userCount.mockResolvedValue(3);
    const { GET } = await import("@/app/api/health/auth/route");
    const response = await GET(
      new NextRequest("https://app.example.com/api/health/auth"),
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.checks.migrations).toEqual({ applied: 41, failed: 1 });
  });
});
