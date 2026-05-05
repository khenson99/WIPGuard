import { resolveDashboardOrganizationId, tenantBypassEnabled } from "@/lib/platform/dashboard/context";
import { runWithContextAsync } from "@/lib/request-context";
import type { AuthenticatedUser } from "@/lib/session-user";

export class CeoOrganizationContextError extends Error {
  constructor() {
    super("Organization context required for CEO metrics");
    this.name = "CeoOrganizationContextError";
  }
}

export async function withCeoOrganizationContext<T>(
  session: unknown,
  user: AuthenticatedUser,
  fn: (organizationId: string | null) => Promise<T>
): Promise<T> {
  const organizationId = await resolveDashboardOrganizationId(session, user.id);
  if (!organizationId && !tenantBypassEnabled) {
    throw new CeoOrganizationContextError();
  }

  if (!organizationId) {
    return fn(null);
  }

  return runWithContextAsync({ organizationId, userId: user.id }, () => fn(organizationId));
}
