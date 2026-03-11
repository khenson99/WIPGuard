import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateUser,
  mockFindFirst,
  mockFindUnique,
  mockUpdate,
  mockOrganizationFindFirst,
  mockOrganizationCreate,
  mockRecordSecurityAuditEvent,
} = vi.hoisted(() => ({
  mockCreateUser: vi.fn(),
  mockFindFirst: vi.fn(),
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
  mockOrganizationFindFirst: vi.fn(),
  mockOrganizationCreate: vi.fn(),
  mockRecordSecurityAuditEvent: vi.fn(async () => undefined),
}));

vi.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: vi.fn(() => ({
    createUser: mockCreateUser,
    getUser: vi.fn(),
    getUserByEmail: vi.fn(),
    getUserByAccount: vi.fn(),
    updateUser: vi.fn(),
    linkAccount: vi.fn(),
    createSession: vi.fn(),
    getSessionAndUser: vi.fn(),
    updateSession: vi.fn(),
    deleteSession: vi.fn(),
    createVerificationToken: vi.fn(),
    useVerificationToken: vi.fn(),
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: mockFindFirst,
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
    organization: {
      findFirst: mockOrganizationFindFirst,
      create: mockOrganizationCreate,
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
  const mutableEnv = process.env as Record<string, string | undefined>;
  mutableEnv.NODE_ENV = "test";
  mutableEnv.E2E_MODE = "false";
  delete mutableEnv.GOOGLE_CLIENT_ID;
  delete mutableEnv.GOOGLE_CLIENT_SECRET;
  const { authOptions } = await import("@/lib/auth");
  return authOptions;
}

describe("auth options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateUser.mockReset();
    mockFindFirst.mockReset();
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
    mockOrganizationFindFirst.mockReset();
    mockOrganizationCreate.mockReset();
    mockRecordSecurityAuditEvent.mockReset();
    mockCreateUser.mockResolvedValue({ id: "created-user", email: "user@example.com" });
    mockFindFirst.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue({ role: "member", organizationId: "org_1" });
    mockUpdate.mockResolvedValue({ id: "user-1", organizationId: "org_1" });
    mockOrganizationFindFirst.mockResolvedValue({ id: "org_1" });
    mockOrganizationCreate.mockResolvedValue({ id: "org_1" });
    mockRecordSecurityAuditEvent.mockResolvedValue(undefined);
  });

  it("configures JWT sessions and the login page", async () => {
    const authOptions = await loadAuthOptions();

    expect(authOptions.session?.strategy).toBe("jwt");
    expect(authOptions.pages?.signIn).toBe("/login");
  });

  it("includes the dev credentials provider outside production", async () => {
    const authOptions = await loadAuthOptions();
    const credentialsProvider = authOptions.providers?.find(
      (provider) => provider.id === "credentials"
    ) as
      | {
          authorize?: (credentials: Record<string, unknown>, request: unknown) => Promise<unknown>;
          options?: {
            authorize?: (credentials: Record<string, unknown>, request: unknown) => Promise<unknown>;
          };
        }
      | undefined;

    expect(credentialsProvider).toBeTruthy();
  });

  it("bootstraps a development organization for credential logins without one", async () => {
    const authOptions = await loadAuthOptions();
    const credentialsProvider = authOptions.providers?.find(
      (provider) => provider.id === "credentials"
    ) as
      | {
          authorize?: (credentials: Record<string, unknown>, request: unknown) => Promise<unknown>;
          options?: {
            authorize?: (credentials: Record<string, unknown>, request: unknown) => Promise<unknown>;
          };
        }
      | undefined;

    mockFindFirst.mockResolvedValueOnce({
      id: "user-1",
      name: "Local Dev",
      email: "local-dev@wipguard.local",
      image: null,
      organizationId: null,
    });
    mockFindUnique.mockResolvedValueOnce({ organizationId: null });
    mockOrganizationFindFirst.mockResolvedValueOnce({ id: "org_existing" });

    const authorize =
      credentialsProvider?.options?.authorize ?? credentialsProvider?.authorize;
    const user = await authorize?.({ email: "local-dev@wipguard.local" }, {});

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { organizationId: "org_existing" },
    });
    expect(user).toEqual({
      id: "user-1",
      name: "Local Dev",
      email: "local-dev@wipguard.local",
      image: null,
    });
  });

  it("does not fail dev credential login when organization bootstrap is unavailable", async () => {
    const authOptions = await loadAuthOptions();
    const credentialsProvider = authOptions.providers?.find(
      (provider) => provider.id === "credentials"
    ) as
      | {
          authorize?: (credentials: Record<string, unknown>, request: unknown) => Promise<unknown>;
          options?: {
            authorize?: (credentials: Record<string, unknown>, request: unknown) => Promise<unknown>;
          };
        }
      | undefined;

    mockFindFirst.mockResolvedValueOnce({
      id: "user-1",
      name: "Local Dev",
      email: "local-dev@wipguard.local",
      image: null,
      organizationId: null,
    });
    mockFindUnique.mockResolvedValueOnce({ organizationId: null });
    mockOrganizationFindFirst.mockRejectedValueOnce(
      new Error('The table `public.Organization` does not exist')
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const authorize =
      credentialsProvider?.options?.authorize ?? credentialsProvider?.authorize;
    const user = await authorize?.({ email: "local-dev@wipguard.local" }, {});

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "[auth] Skipping development organization bootstrap:",
      expect.any(Error)
    );
    expect(user).toEqual({
      id: "user-1",
      name: "Local Dev",
      email: "local-dev@wipguard.local",
      image: null,
    });
  });

  it("normalizes adapter email lookups and selects only auth-safe user fields", async () => {
    const authOptions = await loadAuthOptions();

    mockFindFirst.mockResolvedValueOnce({
      id: "user-1",
      name: "Local Dev",
      email: "local-dev@wipguard.local",
      image: null,
    });

    const user = await authOptions.adapter?.getUserByEmail?.("  LOCAL-DEV@WIPGUARD.LOCAL  ");

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        email: {
          equals: "local-dev@wipguard.local",
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        image: true,
      },
    });
    expect(user).toEqual({
      id: "user-1",
      name: "Local Dev",
      email: "local-dev@wipguard.local",
      image: null,
    });
  });

  it("reuses an existing user after a unique-constraint collision", async () => {
    const authOptions = await loadAuthOptions();
    const adapter = authOptions.adapter!;

    mockCreateUser.mockRejectedValueOnce({ code: "P2002" });
    mockFindFirst.mockResolvedValueOnce({
      id: "existing-user",
      email: "user@example.com",
      name: "Existing User",
      emailVerified: null,
      image: null,
    });

    const user = await adapter.createUser?.({
      email: "USER@example.com",
      name: "Existing User",
      emailVerified: null,
      image: null,
    } as never);

    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "user@example.com" })
    );
    expect(user).toEqual(
      expect.objectContaining({ id: "existing-user", email: "user@example.com" })
    );
  });

  it("marks expired OAuth tokens in the JWT and projects role into session", async () => {
    const authOptions = await loadAuthOptions();
    const jwt = authOptions.callbacks?.jwt;
    const sessionCb = authOptions.callbacks?.session;

    const token = await jwt?.({
      token: {},
      user: { id: "user-1" } as never,
      account: {
        provider: "google",
        expires_at: Math.floor(Date.now() / 1000) - 5,
      } as never,
      profile: undefined,
      trigger: "signIn",
      session: undefined,
      isNewUser: false,
    });

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { role: true, organizationId: true },
    });
    expect(token).toEqual(
      expect.objectContaining({
        id: "user-1",
        role: "member",
        organizationId: "org_1",
        error: "OAUTH_TOKEN_EXPIRED",
      })
    );

    const session = await sessionCb?.({
      session: { user: { name: "User" } } as never,
      token: token as never,
      user: undefined,
      newSession: undefined,
      trigger: "update",
    } as never);

    expect(session).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ id: "user-1", role: "member", organizationId: "org_1" }),
        error: "OAUTH_TOKEN_EXPIRED",
      })
    );
  });

  it("denies sign-in for already expired non-credential OAuth tokens", async () => {
    const authOptions = await loadAuthOptions();
    const signIn = authOptions.callbacks?.signIn;

    const allowed = await signIn?.({
      user: { id: "user-1" } as never,
      account: {
        provider: "google",
        expires_at: Math.floor(Date.now() / 1000) - 60,
      } as never,
      profile: { email_verified: true } as never,
      credentials: undefined,
      email: undefined,
    });

    expect(allowed).toBe(false);
    expect(mockRecordSecurityAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.signin",
        outcome: "DENIED",
        details: expect.objectContaining({
          reason: "OAUTH_ACCESS_TOKEN_ALREADY_EXPIRED",
          provider: "google",
        }),
      })
    );
  });
});
