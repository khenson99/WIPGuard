import { PipelineArtifactsWorkspace } from "@/components/workspaces/pipeline-artifacts-workspace";
import { auth } from "@/lib/auth";
import { loadAutomationOperatorDashboard } from "@/lib/automations/operator-dashboard";
import { redirectInvestorToInvestorWorkspace } from "@/lib/investor/route-guards";
import { getAuthenticatedUser } from "@/lib/session-user";
import { redirect } from "next/navigation";

export default async function PipelineArtifactsPage() {
  const session = await auth();
  const user = getAuthenticatedUser(session);
  if (!user) redirect("/login");
  redirectInvestorToInvestorWorkspace(user.role);
  const data = await loadAutomationOperatorDashboard({ userId: user.id });
  return <PipelineArtifactsWorkspace data={data} />;
}
