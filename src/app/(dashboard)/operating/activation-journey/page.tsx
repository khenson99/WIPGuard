import { redirect } from "next/navigation";
import { ActivationJourneyDashboard } from "@/components/imladris/activation-journey-dashboard";
import { auth } from "@/lib/auth";
import { buildActivationJourneyDashboard } from "@/lib/imladris/activation-journey";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/session-user";

export const dynamic = "force-dynamic";

export default async function ActivationJourneyPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const session = await auth();
  const user = getAuthenticatedUser(session);
  if (!user) redirect("/login");

  const params = await searchParams;
  const days = params.days ? Math.max(1, Math.min(365, Number(params.days) || 30)) : 30;

  const dashboard = await buildActivationJourneyDashboard({
    prisma,
    context: {
      userId: user.id,
      organizationId: user.organizationId ?? null,
    },
    days,
  });

  return <ActivationJourneyDashboard initialData={dashboard} />;
}
