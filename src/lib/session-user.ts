export interface AuthenticatedUser {
  id: string;
  role?: string;
  organizationId?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export function getAuthenticatedUser(
  session: { user?: unknown } | null | undefined
): AuthenticatedUser | null {
  const rawUser = (session as { user?: unknown } | null | undefined)?.user;
  if (!rawUser || typeof rawUser !== "object") {
    return null;
  }

  const user = rawUser as Record<string, unknown>;
  if (typeof user.id !== "string" || user.id.trim().length === 0) {
    return null;
  }

  return {
    id: user.id,
    role: typeof user.role === "string" ? user.role : undefined,
    organizationId:
      typeof user.organizationId === "string" && user.organizationId.trim().length > 0
        ? user.organizationId
        : null,
    name: typeof user.name === "string" ? user.name : null,
    email: typeof user.email === "string" ? user.email : null,
    image: typeof user.image === "string" ? user.image : null,
  };
}
