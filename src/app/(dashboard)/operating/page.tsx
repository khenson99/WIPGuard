import { redirect } from "next/navigation";
import { ImladrisDashboardShell } from "@/components/imladris/dashboard-shell";
import { auth } from "@/lib/auth";
import { redirectInvestorToInvestorWorkspace } from "@/lib/investor/route-guards";
import { getAuthenticatedUser } from "@/lib/session-user";

export const dynamic = "force-dynamic";

/**
 * Operating dashboard — the all-up business view.
 *
 * Auth + investor gating happens server-side; the dashboard data is fetched
 * client-side from the same-origin, NextAuth-gated Imladris endpoints via
 * `useImladrisDashboardData`. The `?demo` flag opts into the loudly-labeled
 * demo model.
 */
export default async function OperatingPage({
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

  return <ImladrisDashboardShell dashboardId="operating" initialDemo={initialDemo} />;
}
