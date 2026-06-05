import { SourcesWorkspace } from "@/components/workspaces/sources-workspace";
import { auth } from "@/lib/auth";
import { buildImladrisSources } from "@/lib/imladris/service";
import { redirectInvestorToInvestorWorkspace } from "@/lib/investor/route-guards";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/session-user";
import { redirect } from "next/navigation";

export default async function SourcesPage() {
  const session = await auth();
  const user = getAuthenticatedUser(session);
  if (!user) redirect("/login");
  redirectInvestorToInvestorWorkspace(user.role);

  const sources = await buildImladrisSources({
    prisma,
    context: { userId: user.id, organizationId: user.organizationId ?? null },
  }).catch(() => []);

  return <SourcesWorkspace sources={sources} />;
}
