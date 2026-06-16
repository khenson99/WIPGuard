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

async function loadAuthOptions(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  const mutableEnv = process.env as Record<string, string | undefined>;
  const overrides: Record<string, string | undefined> = {
    NODE_ENV: "test",
    E2E_MODE: "false",
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
    NEXTAUTH_DEBUG: undefined,
    ...env,
  };
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = mutableEnv[key];
    if (value === undefined) delete mutableEnv[key];
    else mutableEnv[key] = value;
  }
  try {
    const { authOptions } = await import("@/lib/auth");
    return authOptions;
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete mutableEnv[key];
      else mutableEnv[key] = value;
    }
    mutableEnv.NODE_ENV = "test";
  }
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

  it("excludes the dev credentials provider for non-allowlisted environments", async () => {
    // A stray NODE_ENV override on the host (unset, "staging", etc.) must not
    // enable the passwordless dev login.
    vi.resetModules();
    const mutableEnv = process.env as Record<string, string | undefined>;
    mutableEnv.NODE_ENV = "staging";
    mutableEnv.E2E_MODE = "false";
    const { authOptions } = await import("@/lib/auth");
    mutableEnv.NODE_ENV = "test";

    expect(
      authOptions.providers?.find((provider) => provider.id === "credentials"),
    ).toBeUndefined();
  });

  it("keeps next-auth debug logging opt-in so provider secrets stay out of logs", async () => {
    const authOptions = await loadAuthOptions();
    expect(authOptions.debug).toBe(false);
  });

  it("allows opting into debug logging outside production", async () => {
    const authOptions = await loadAuthOptions({ NEXTAUTH_DEBUG: "true" });
    expect(authOptions.debug).toBe(true);
  });

  it("never enables debug logging in production, even with NEXTAUTH_DEBUG=true", async () => {
    // Regression guard: NEXTAUTH_DEBUG=true on the production host previously
    // dumped the full provider config — Google client secret included — plus
    // state/PKCE cookies into Railway logs.
    const authOptions = await loadAuthOptions({
      NODE_ENV: "production",
      NEXTAUTH_DEBUG: "true",
    });
    expect(authOptions.debug).toBe(false);
  });

  it("silences the custom debug handler when NEXTAUTH_DEBUG is unset", async () => {
    // Regression guard: next-auth v4 invokes a custom logger.debug even when
    // the `debug` option is false — setLogger() installs the debug-flag no-op
    // first, then unconditionally overwrites it with the user-supplied
    // handler. An ungated handler is exactly how GET_AUTHORIZATION_URL
    // entries (provider config, cookie payloads) kept reaching production
    // Railway logs with NEXTAUTH_DEBUG unset.
    const authOptions = await loadAuthOptions();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      authOptions.logger?.debug?.("GET_AUTHORIZATION_URL", {
        provider: { id: "google", clientSecret: "GOCSPX-super-secret" },
      });
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });

  it("silences the custom debug handler in production even with NEXTAUTH_DEBUG=true", async () => {
    const authOptions = await loadAuthOptions({
      NODE_ENV: "production",
      NEXTAUTH_DEBUG: "true",
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      authOptions.logger?.debug?.("GET_AUTHORIZATION_URL", {
        provider: { id: "google", clientSecret: "GOCSPX-super-secret" },
      });
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });

  it("redacts provider secrets and cookie values from debug log metadata", async () => {
    // Debug output is opt-in; even once opted in, secrets must be redacted.
    const authOptions = await loadAuthOptions({ NEXTAUTH_DEBUG: "true" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      // Shape mirrors next-auth's GET_AUTHORIZATION_URL debug event.
      authOptions.logger?.debug?.("GET_AUTHORIZATION_URL", {
        url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc",
        cookies: [
          { name: "next-auth.pkce.code_verifier", value: "pkce-verifier-value" },
          { name: "next-auth.state", value: "state-cookie-value" },
        ],
        provider: {
          id: "google",
          clientId: "public-client-id",
          clientSecret: "GOCSPX-super-secret",
          callbackUrl: "https://app.example.com/api/auth/callback/google",
        },
      });

      expect(logSpy).toHaveBeenCalledTimes(1);
      const [prefix, code, metadata] = logSpy.mock.calls[0];
      expect(prefix).toBe("[next-auth][debug]");
      expect(code).toBe("GET_AUTHORIZATION_URL");

      const serialized = JSON.stringify(metadata);
      expect(serialized).not.toContain("GOCSPX-super-secret");
      expect(serialized).not.toContain("pkce-verifier-value");
      expect(serialized).not.toContain("state-cookie-value");

      // Non-sensitive context survives so debug output stays useful.
      const sanitized = metadata as {
        url: string;
        cookies: string;
        provider: Record<string, string>;
      };
      expect(sanitized.url).toContain("accounts.google.com");
      expect(sanitized.cookies).toBe("[REDACTED]");
      expect(sanitized.provider.id).toBe("google");
      expect(sanitized.provider.clientSecret).toBe("[REDACTED]");
      expect(sanitized.provider.callbackUrl).toContain("/api/auth/callback/google");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("redacts secret-bearing fields from error log metadata while keeping the error", async () => {
    const authOptions = await loadAuthOptions();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      authOptions.logger?.error?.("OAUTH_CALLBACK_ERROR", {
        error: new Error("callback failed"),
        provider: { id: "google", clientSecret: "GOCSPX-super-secret" },
      } as never);

      const [, , metadata] = errorSpy.mock.calls[0];
      const serialized = JSON.stringify(metadata);
      expect(serialized).not.toContain("GOCSPX-super-secret");
      expect(serialized).toContain("callback failed");
    } finally {
      errorSpy.mockRestore();
    }
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
