import { ReportsWorkspace } from "@/components/workspaces/reports-workspace";
import { auth } from "@/lib/auth";
import { CeoOrganizationContextError, withCeoOrganizationContext } from "@/lib/ceo/api-context";
import { loadCeoMetricSnapshot, type CeoMetricSnapshotPayload } from "@/lib/ceo/service";
import { redirectInvestorToInvestorWorkspace } from "@/lib/investor/route-guards";
import { getAuthenticatedUser } from "@/lib/session-user";
import { redirect } from "next/navigation";

function emptyCeoSnapshot(): CeoMetricSnapshotPayload {
  const now = new Date().toISOString();
  return { generatedAt: now, periodStart: now, periodEnd: now, definitions: [], metrics: [], reportPacks: [], trustSummary: { fresh: 0, stale: 0, partial: 0, missing: 0, error: 0, conflicted: 0 }, readiness: { status: "not_board_final", ready: false, summary: "Report generation requires organization context.", failingGates: [] } };
}

function isMissingTableError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2021";
}

export default async function ReportsRoutePage() {
  const session = await auth();
  const user = getAuthenticatedUser(session);
  if (!user) redirect("/login");
  redirectInvestorToInvestorWorkspace(user.role);

  const snapshot = await withCeoOrganizationContext(session, user, (organizationId) =>
    loadCeoMetricSnapshot({ userId: user.id, organizationId, persist: false }),
  ).catch((error) => {
    if (error instanceof CeoOrganizationContextError || isMissingTableError(error)) return emptyCeoSnapshot();
    throw error;
  });

  return <ReportsWorkspace snapshot={snapshot} />;
}
