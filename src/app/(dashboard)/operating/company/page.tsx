import { redirect } from "next/navigation";
import { ImladrisCompanyShell } from "@/components/imladris/company-dashboard-shell";
import { auth } from "@/lib/auth";
import { redirectInvestorToInvestorWorkspace } from "@/lib/investor/route-guards";
import { getAuthenticatedUser } from "@/lib/session-user";

export const dynamic = "force-dynamic";

/**
 * Company Tracker — the redesigned founder-cockpit lead view.
 *
 * Lives at a NEW route; the existing `/metrics/company` Company Tracker is left
 * intact for parity comparison. Same auth + investor gating as Operating; the
 * dashboard data is fetched client-side from the NextAuth-gated Imladris
 * endpoints, with `?demo` opting into the loudly-labeled demo model.
 */
export default async function CompanyTrackerPage({
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

  return <ImladrisCompanyShell initialDemo={initialDemo} />;
}
