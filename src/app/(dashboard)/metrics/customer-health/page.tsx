import { redirect } from "next/navigation";
import { CustomerHealthDashboard } from "@/components/workspaces/customer-health-dashboard";
import { auth } from "@/lib/auth";
import { redirectInvestorToInvestorWorkspace } from "@/lib/investor/route-guards";
import { buildCustomerHealthDashboard } from "@/lib/retention/customer-health-dashboard";

export default async function CustomerHealthPage() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string | null; organizationId?: string | null } | undefined;
  if (!user?.id) {
    redirect("/login");
  }
  redirectInvestorToInvestorWorkspace(user.role);

  const data = await buildCustomerHealthDashboard({
    id: user.id,
    organizationId: user.organizationId ?? "",
  });

  return <CustomerHealthDashboard data={data} />;
}
