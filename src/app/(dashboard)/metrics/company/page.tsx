import { redirect } from "next/navigation";
import { CompanyTrackerDashboard } from "@/components/workspaces/company-tracker-dashboard";
import { auth } from "@/lib/auth";
import { buildCompanyTrackerDashboard } from "@/lib/imladris/company-tracker";
import { prisma } from "@/lib/prisma";

export default async function CompanyTrackerPage() {
  const session = await auth();
  const user = session?.user as { id?: string; organizationId?: string | null } | undefined;
  if (!user?.id) {
    redirect("/login");
  }

  const data = await buildCompanyTrackerDashboard({
    prisma,
    context: {
      userId: user.id,
      organizationId: user.organizationId ?? null,
    },
  });

  return <CompanyTrackerDashboard data={data} />;
}
