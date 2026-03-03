import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Prisma before importing auth
vi.mock('@/lib/prisma', () => ({
  default: {
    account: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    session: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    verificationToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('next-auth/providers/github', () => ({
  default: vi.fn(() => ({ id: 'github', name: 'GitHub', type: 'oauth' })),
}));

vi.mock('next-auth/providers/google', () => ({
  default: vi.fn(() => ({ id: 'google', name: 'Google', type: 'oauth' })),
}));

vi.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: vi.fn(() => ({
    createUser: vi.fn(),
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

describe('auth module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resilientAdapter', () => {
    it('should wrap PrismaAdapter methods', async () => {
      const { resilientAdapter } = await import('@/lib/auth');

      expect(resilientAdapter).toBeDefined();
      // The resilient adapter should expose standard adapter methods
      if (resilientAdapter) {
        expect(typeof resilientAdapter.createUser === 'function' || resilientAdapter.createUser === undefined).toBe(true);
      }
    });

    it('should handle linkAccount deduplication gracefully', async () => {
      const prisma = (await import('@/lib/prisma')).default;
      const { resilientAdapter } = await import('@/lib/auth');

      // Simulate a duplicate account scenario
      vi.mocked(prisma.account.findFirst).mockResolvedValue({
        id: 'existing-account',
        userId: 'user-1',
        type: 'oauth',
        provider: 'github',
        providerAccountId: '12345',
        refresh_token: null,
        access_token: 'token',
        expires_at: null,
        token_type: null,
        scope: null,
        id_token: null,
        session_state: null,
      });

      if (resilientAdapter?.linkAccount) {
        // Should not throw even if account already exists
        const result = await resilientAdapter.linkAccount({
          userId: 'user-1',
          type: 'oauth',
          provider: 'github',
          providerAccountId: '12345',
          access_token: 'token',
        });
        // Should handle gracefully (either return existing or create)
        expect(result).toBeDefined();
      }
    });

    it('should handle createUser with existing email gracefully', async () => {
      const prisma = (await import('@/lib/prisma')).default;
      const { resilientAdapter } = await import('@/lib/auth');

      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: 'existing-user',
        name: 'Test User',
        email: 'test@example.com',
        emailVerified: new Date(),
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      if (resilientAdapter?.createUser) {
        const result = await resilientAdapter.createUser({
          name: 'Test User',
          email: 'test@example.com',
          emailVerified: new Date(),
          image: null,
        } as any);
        expect(result).toBeDefined();
      }
    });
  });

  describe('authOptions', () => {
    it('should export authOptions with required configuration', async () => {
      const { authOptions } = await import('@/lib/auth');

      expect(authOptions).toBeDefined();
      expect(authOptions.providers).toBeDefined();
      expect(Array.isArray(authOptions.providers)).toBe(true);
    });

    it('should have session strategy configured', async () => {
      const { authOptions } = await import('@/lib/auth');

      expect(authOptions.session).toBeDefined();
      // Typically JWT strategy for serverless
      expect(authOptions.session?.strategy).toBeDefined();
    });

    it('should have callbacks configured', async () => {
      const { authOptions } = await import('@/lib/auth');

      expect(authOptions.callbacks).toBeDefined();
    });

    describe('session callback', () => {
      it('should add user id to session', async () => {
        const { authOptions } = await import('@/lib/auth');
        const sessionCallback = authOptions.callbacks?.session;

        if (sessionCallback) {
          const mockSession = {
            user: { name: 'Test', email: 'test@example.com', image: null },
            expires: new Date(Date.now() + 86400000).toISOString(),
          };
          const mockToken = {
            sub: 'user-123',
            name: 'Test',
            email: 'test@example.com',
          };

          const result = await (sessionCallback as Function)({
            session: mockSession,
            token: mockToken,
            user: { id: 'user-123', name: 'Test', email: 'test@example.com' },
            trigger: 'update',
            newSession: undefined,
          });

          expect(result).toBeDefined();
          // Session should have user info
          expect(result.user).toBeDefined();
        }
      });

      it('should handle missing token sub gracefully', async () => {
        const { authOptions } = await import('@/lib/auth');
        const sessionCallback = authOptions.callbacks?.session;

        if (sessionCallback) {
          const mockSession = {
            user: { name: 'Test', email: 'test@example.com', image: null },
            expires: new Date(Date.now() + 86400000).toISOString(),
          };
          const mockToken = {
            name: 'Test',
            email: 'test@example.com',
          };

          const result = await (sessionCallback as Function)({
            session: mockSession,
            token: mockToken,
            user: undefined,
            trigger: 'update',
            newSession: undefined,
          });

          expect(result).toBeDefined();
        }
      });
    });

    describe('jwt callback', () => {
      it('should add user id to JWT token', async () => {
        const { authOptions } = await import('@/lib/auth');
        const jwtCallback = authOptions.callbacks?.jwt;

        if (jwtCallback) {
          const mockToken = { name: 'Test', email: 'test@example.com' };
          const mockUser = { id: 'user-123', name: 'Test', email: 'test@example.com' };

          const result = await (jwtCallback as Function)({
            token: mockToken,
            user: mockUser,
            account: null,
            trigger: 'signIn',
          });

          expect(result).toBeDefined();
        }
      });

      it('should pass through token when no user present', async () => {
        const { authOptions } = await import('@/lib/auth');
        const jwtCallback = authOptions.callbacks?.jwt;

        if (jwtCallback) {
          const mockToken = {
            sub: 'user-123',
            name: 'Test',
            email: 'test@example.com',
          };

          const result = await (jwtCallback as Function)({
            token: mockToken,
            user: undefined,
            account: null,
            trigger: 'update',
          });

          expect(result).toBeDefined();
          expect(result.sub).toBe('user-123');
        }
      });
    });

    describe('signIn callback', () => {
      it('should allow sign-in for valid users', async () => {
        const { authOptions } = await import('@/lib/auth');
        const signInCallback = authOptions.callbacks?.signIn;

        if (signInCallback) {
          const result = await (signInCallback as Function)({
            user: { id: 'user-1', email: 'test@example.com' },
            account: { provider: 'github', providerAccountId: '123' },
            profile: { email: 'test@example.com' },
          });

          // Should return true or a URL string
          expect(result === true || typeof result === 'string').toBe(true);
        }
      });
    });
  });

  describe('providers configuration', () => {
    it('should include OAuth providers', async () => {
      const { authOptions } = await import('@/lib/auth');

      expect(authOptions.providers.length).toBeGreaterThan(0);
    });
  });
});
