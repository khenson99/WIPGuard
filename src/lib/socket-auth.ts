import { parse } from "cookie";
import { prisma } from "@/lib/prisma";

export interface SocketSessionData {
  userId: string;
  email: string;
}

/**
 * Parse the session token from a raw cookie header string.
 * Supports both secure (`__Secure-next-auth.session-token`)
 * and non-secure (`next-auth.session-token`) cookie names.
 */
export function extractSessionToken(
  cookieHeader: string | undefined
): string | null {
  if (!cookieHeader) return null;

  const cookies = parse(cookieHeader);

  // Next-Auth uses different cookie names depending on HTTPS
  const token =
    cookies["__Secure-next-auth.session-token"] ??
    cookies["next-auth.session-token"] ??
    null;

  return token || null;
}

/**
 * Look up a valid session from the database using a session token.
 * Returns the user data if the session is valid and not expired.
 */
export async function getSessionFromToken(
  token: string
): Promise<SocketSessionData | null> {
  try {
    const session = await prisma.session.findUnique({
      where: { sessionToken: token },
      include: { user: true },
    });

    if (!session) return null;
    if (session.expires < new Date()) return null;
    if (!session.user) return null;

    return {
      userId: session.user.id,
      email: session.user.email ?? "",
    };
  } catch (error) {
    console.error("[socket-auth] Failed to validate session token:", error);
    return null;
  }
}

/**
 * Verify that a user has access to a specific project.
 * Returns true if the user is a member of the project.
 */
export async function verifyProjectAccess(
  userId: string,
  projectId: string
): Promise<boolean> {
  try {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { responsible: { some: { id: userId } } },
          { accountable: { some: { id: userId } } },
          { consulted: { some: { id: userId } } },
          { informed: { some: { id: userId } } },
          { sponsor: { some: { id: userId } } },
        ],
      },
      select: { id: true },
    });

    return project !== null;
  } catch (error) {
    console.error("[socket-auth] Failed to verify project access:", error);
    return false;
  }
}
