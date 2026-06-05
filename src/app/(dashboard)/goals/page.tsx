import { redirect } from "next/navigation";
import { CompanyGoalsDashboard } from "@/components/workspaces/company-goals-dashboard";
import { auth } from "@/lib/auth";
import { buildCompanyGoalsDashboard } from "@/lib/imladris/company-goals";
import { redirectInvestorToInvestorWorkspace } from "@/lib/investor/route-guards";
import { prisma } from "@/lib/prisma";

export default async function GoalsPage() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string | null; organizationId?: string | null } | undefined;
  if (!user?.id) {
    redirect("/login");
  }
  redirectInvestorToInvestorWorkspace(user.role);

  const data = await buildCompanyGoalsDashboard({
    prisma,
    context: {
      userId: user.id,
      organizationId: user.organizationId ?? null,
    },
  });

  return <CompanyGoalsDashboard data={data} />;
}
