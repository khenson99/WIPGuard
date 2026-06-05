import { notFound, redirect } from "next/navigation";
import { ImladrisDashboardShell } from "@/components/imladris/dashboard-shell";
import { auth } from "@/lib/auth";
import {
  CANONICAL_DEPARTMENTS,
  type ImladrisDepartment,
} from "@/lib/imladris/catalog";
import { redirectInvestorToInvestorWorkspace } from "@/lib/investor/route-guards";
import { getAuthenticatedUser } from "@/lib/session-user";

export const dynamic = "force-dynamic";

const DEPARTMENT_IDS = new Set<string>(CANONICAL_DEPARTMENTS);

function isDepartment(value: string): value is ImladrisDepartment {
  return DEPARTMENT_IDS.has(value);
}

/**
 * Department metric views (finance, sales, marketing, development,
 * customer-success). A single dynamic route reuses `ImladrisDashboardShell`
 * with the matching catalog `dashboardId`; an unknown `department` 404s.
 *
 * Same auth + investor gating as the Operating route; the dashboard data is
 * fetched client-side from the NextAuth-gated Imladris endpoints, with `?demo`
 * opting into the loudly-labeled demo model.
 */
export default async function DepartmentDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ department: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const user = getAuthenticatedUser(session);
  if (!user) redirect("/login");
  redirectInvestorToInvestorWorkspace(user.role);

  const { department } = await params;
  if (!isDepartment(department)) notFound();

  const search = await searchParams;
  const initialDemo = search.demo !== undefined;

  return <ImladrisDashboardShell dashboardId={department} initialDemo={initialDemo} />;
}
