import { ExecutiveMetricsDashboard } from "@/components/workspaces/executive-metrics-dashboard";
import { auth } from "@/lib/auth";
import { buildCompanyTrackerDashboard } from "@/lib/imladris/company-tracker";
import { buildExpenseDashboard } from "@/lib/imladris/expense-dashboard";
import { prisma } from "@/lib/prisma";
import { buildCustomerHealthDashboard } from "@/lib/retention/customer-health-dashboard";

export default async function MetricsPage() {
  const session = await auth();
  const user = session?.user as { id?: string; organizationId?: string | null } | undefined;
  const userId = user?.id ?? null;
  const organizationId = user?.organizationId ?? null;

  const [company, customerHealth, expenses] = await Promise.all([
    buildCompanyTrackerDashboard({
      prisma,
      context: {
        userId,
        organizationId,
      },
    }),
    buildCustomerHealthDashboard({
      id: userId ?? "",
      organizationId: organizationId ?? "",
    }),
    buildExpenseDashboard({
      prisma,
      context: {
        userId,
        organizationId,
      },
      range: "180d",
    }),
  ]);

  return (
    <ExecutiveMetricsDashboard
      company={company}
      customerHealth={customerHealth}
      expenses={expenses}
    />
  );
}
