import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import { normalizeRole } from "@/lib/permissions";
import { recordSecurityAuditEvent } from "@/lib/security-audit";

const providers: NextAuthOptions["providers"] = [];
const normalizeEmail = (email?: string | null) => email?.trim().toLowerCase() ?? null;

function isPrismaUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeCode = (error as { code?: unknown }).code;
  return maybeCode === "P2002";
}

function createResilientAdapter(): Adapter {
  const baseAdapter = PrismaAdapter(prisma as never) as Adapter;
  const createUserImpl = baseAdapter.createUser as NonNullable<Adapter["createUser"]> | undefined;

  if (!createUserImpl) {
    throw new Error("Prisma adapter missing createUser method.");
  }

  return {
    ...baseAdapter,
    async getUserByEmail(email: string) {
      const normalized = normalizeEmail(email);
      if (!normalized) return null;

      return prisma.user.findFirst({
        where: {
          email: {
            equals: normalized,
            mode: "insensitive",
          },
        },
      });
    },
    async createUser(data: Parameters<NonNullable<Adapter["createUser"]>>[0]) {
      const normalized = normalizeEmail(data.email);
      const payload = normalized ? { ...data, email: normalized } : data;

      try {
        return await createUserImpl(payload as never);
      } catch (error) {
        if (!isPrismaUniqueViolation(error) || !normalized) throw error;

        const existingUser = await prisma.user.findFirst({
          where: {
            email: {
              equals: normalized,
              mode: "insensitive",
            },
          },
        });
        if (existingUser) return existingUser;
        throw error;
      }
    },
  };
}

// Google OAuth — only add if credentials are configured
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

// Dev credentials provider — lets you sign in as any seeded user by email
if (process.env.NODE_ENV !== "production") {
  providers.push(
    CredentialsProvider({
      name: "Dev Login",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "user@example.com" },
      },
      async authorize(credentials) {
        const normalized = normalizeEmail(credentials?.email);
        if (!normalized) return null;
        const user = await prisma.user.findFirst({
          where: {
            email: {
              equals: normalized,
              mode: "insensitive",
            },
          },
        });
        if (!user) return null;
        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
  );
}

export const authOptions: NextAuthOptions = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: createResilientAdapter() as any,
  providers,
  debug: process.env.NODE_ENV !== "production",
  logger: {
    error(code, metadata) {
      console.error("[next-auth][error]", code, metadata);
    },
    warn(code) {
      console.warn("[next-auth][warn]", code);
    },
    debug(code, metadata) {
      console.log("[next-auth][debug]", code, metadata);
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8,
    updateAge: 60 * 60,
  },
  jwt: {
    maxAge: 60 * 60 * 8,
  },
  callbacks: {
    async signIn({ user, account }) {
      try {
        // Hygiene check: reject sign-ins that arrive with already expired OAuth tokens.
        if (
          account?.provider &&
          account.provider !== "credentials" &&
          typeof account.expires_at === "number" &&
          account.expires_at <= Math.floor(Date.now() / 1000)
        ) {
          await recordSecurityAuditEvent({
            action: "auth.signin",
            category: "auth",
            outcome: "DENIED",
            actorId: user.id,
            details: {
              reason: "OAUTH_ACCESS_TOKEN_ALREADY_EXPIRED",
              provider: account.provider,
              expiresAt: account.expires_at,
            },
          });
          return false;
        }
        return true;
      } catch (error) {
        console.error("signIn callback error:", error);
        return true; // Allow sign-in even if audit logging fails
      }
    },
    async jwt({ token, user, account }) {
      try {
        if (user) {
          token.id = user.id;
        }

        if (token.id) {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true },
          });
          token.role = normalizeRole(dbUser?.role);
        }

        if (
          account?.provider &&
          account.provider !== "credentials" &&
          typeof account.expires_at === "number"
        ) {
          token.oauthExpiresAt = account.expires_at;
        }

        if (
          typeof token.oauthExpiresAt === "number" &&
          token.oauthExpiresAt <= Math.floor(Date.now() / 1000)
        ) {
          token.error = "OAUTH_TOKEN_EXPIRED";
        } else {
          delete token.error;
        }
      } catch (error) {
        console.error("jwt callback error:", error);
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: string }).role =
          (token.role as string | undefined) ?? "member";
      }

      if (token.error) {
        (session as { error?: string }).error = token.error as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};

export async function auth() {
  return getServerSession(authOptions);
}
