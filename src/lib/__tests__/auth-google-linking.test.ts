import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateUser, mockRecordSecurityAuditEvent } = vi.hoisted(() => ({
  mockCreateUser: vi.fn(async (data: unknown) => ({ id: "mock-user", ...(data as object) })),
  mockRecordSecurityAuditEvent: vi.fn(async () => undefined),
}));

vi.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: vi.fn(() => ({
    createUser: mockCreateUser,
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/permissions", () => ({
  normalizeRole: (role?: string | null) => role ?? "member",
}));

vi.mock("@/lib/security-audit", () => ({
  recordSecurityAuditEvent: mockRecordSecurityAuditEvent,
}));

async function loadAuthOptions() {
  vi.resetModules();
  process.env.GOOGLE_CLIENT_ID = "google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
  const { authOptions } = await import("@/lib/auth");
  return authOptions;
}

describe("auth Google account linking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("configures Google provider with trusted email account linking", async () => {
    const authOptions = await loadAuthOptions();
    const googleProvider = authOptions.providers?.find(
      (provider) => provider.id === "google"
    ) as { options?: { allowDangerousEmailAccountLinking?: boolean } } | undefined;

    expect(googleProvider).toBeTruthy();
    expect(googleProvider?.options?.allowDangerousEmailAccountLinking).toBe(true);
  });

  it("denies Google sign-in when profile email is explicitly unverified", async () => {
    const authOptions = await loadAuthOptions();
    const signIn = authOptions.callbacks?.signIn;
    expect(signIn).toBeTypeOf("function");

    const allowed = await signIn?.({
      user: { id: "user-1" } as never,
      account: { provider: "google" } as never,
      profile: { email_verified: false } as never,
      credentials: undefined,
      email: undefined,
    });

    expect(allowed).toBe(false);
    expect(mockRecordSecurityAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.signin",
        outcome: "DENIED",
        details: expect.objectContaining({
          reason: "GOOGLE_EMAIL_UNVERIFIED",
          provider: "google",
        }),
      })
    );
  });

  it("allows normal sign-ins for verified Google and non-Google providers", async () => {
    const authOptions = await loadAuthOptions();
    const signIn = authOptions.callbacks?.signIn;
    expect(signIn).toBeTypeOf("function");

    const verifiedGoogle = await signIn?.({
      user: { id: "user-2" } as never,
      account: { provider: "google" } as never,
      profile: { email_verified: true } as never,
      credentials: undefined,
      email: undefined,
    });
    const nonGoogle = await signIn?.({
      user: { id: "user-3" } as never,
      account: { provider: "github" } as never,
      profile: { email_verified: false } as never,
      credentials: undefined,
      email: undefined,
    });

    expect(verifiedGoogle).toBe(true);
    expect(nonGoogle).toBe(true);
    expect(mockRecordSecurityAuditEvent).not.toHaveBeenCalled();
  });
});
