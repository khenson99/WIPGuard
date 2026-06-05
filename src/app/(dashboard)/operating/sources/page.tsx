import { redirect } from "next/navigation";
import { ImladrisSourcesShell } from "@/components/imladris/sources-health-shell";
import { auth } from "@/lib/auth";
import { redirectInvestorToInvestorWorkspace } from "@/lib/investor/route-guards";
import { getAuthenticatedUser } from "@/lib/session-user";

export const dynamic = "force-dynamic";

/**
 * Sources health — the redesigned provider-health board.
 *
 * Lives at a NEW route; the existing `/sources` workspace is left intact. Same
 * auth + investor gating as Operating; provider health is fetched client-side
 * from the NextAuth-gated `/api/imladris/sources` (via the dashboard hook), with
 * `?demo` opting into the loudly-labeled demo model.
 */
export default async function OperatingSourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const user = getAuthenticatedUser(session);
  if (!user) redirect("/login");
  redirectInvestorToInvestorWorkspace(user.role);

  const params = await searchParams;
  const initialDemo = params.demo !== undefined;

  return <ImladrisSourcesShell initialDemo={initialDemo} />;
}
