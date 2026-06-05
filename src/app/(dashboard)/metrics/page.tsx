import { ExecutiveMetricsDashboard } from "@/components/workspaces/executive-metrics-dashboard";
import { MetricsWorkspace } from "@/components/workspaces/metrics-workspace";
import { auth } from "@/lib/auth";
import { CeoOrganizationContextError, withCeoOrganizationContext } from "@/lib/ceo/api-context";
import { loadCeoMetricSnapshot, type CeoMetricSnapshotPayload } from "@/lib/ceo/service";
import { buildCompanyTrackerDashboard } from "@/lib/imladris/company-tracker";
import { buildExpenseDashboard } from "@/lib/imladris/expense-dashboard";
import { buildImladrisMetrics } from "@/lib/imladris/service";
import { redirectInvestorToInvestorWorkspace } from "@/lib/investor/route-guards";
import { prisma } from "@/lib/prisma";
import { buildCustomerHealthDashboard } from "@/lib/retention/customer-health-dashboard";
import { getAuthenticatedUser } from "@/lib/session-user";
import { redirect } from "next/navigation";

function emptyCeoSnapshot(): CeoMetricSnapshotPayload {
  const now = new Date().toISOString();
  return { generatedAt: now, periodStart: now, periodEnd: now, definitions: [], metrics: [], reportPacks: [], trustSummary: { fresh: 0, stale: 0, partial: 0, missing: 0, error: 0, conflicted: 0 }, readiness: { status: "not_board_final", ready: false, summary: "CEO metric readiness requires organization context.", failingGates: [] } };
}

function isMissingTableError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2021";
}

export default async function MetricsPage() {
  const session = await auth();
  const user = getAuthenticatedUser(session);
  if (!user) redirect("/login");
  redirectInvestorToInvestorWorkspace(user.role);

  const userId = user.id;
  const organizationId = user.organizationId ?? null;

  const [company, customerHealth, expenses, metrics, ceoSnapshot] = await Promise.all([
    buildCompanyTrackerDashboard({
      prisma,
      context: {
        userId,
        organizationId,
      },
    }),
    buildCustomerHealthDashboard({
      id: userId,
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
    buildImladrisMetrics({ prisma, context: { userId, organizationId } }).catch(() => []),
    withCeoOrganizationContext(session, user, (orgId) => loadCeoMetricSnapshot({ userId, organizationId: orgId, persist: false })).catch((error) => {
      if (error instanceof CeoOrganizationContextError || isMissingTableError(error)) return emptyCeoSnapshot();
      throw error;
    }),
  ]);

  return (
    <>
      <ExecutiveMetricsDashboard
        company={company}
        customerHealth={customerHealth}
        expenses={expenses}
      />
      <MetricsWorkspace metrics={metrics} ceoSnapshot={ceoSnapshot} />
    </>
  );
}
