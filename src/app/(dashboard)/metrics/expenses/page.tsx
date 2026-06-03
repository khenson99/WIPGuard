import { redirect } from "next/navigation";
import { ExpenseDashboard } from "@/components/workspaces/expense-dashboard";
import { auth } from "@/lib/auth";
import { buildExpenseDashboard } from "@/lib/imladris/expense-dashboard";
import { prisma } from "@/lib/prisma";

export default async function ExpensesPage() {
  const session = await auth();
  const user = session?.user as { id?: string; organizationId?: string | null } | undefined;
  if (!user?.id) {
    redirect("/login");
  }

  const data = await buildExpenseDashboard({
    prisma,
    context: {
      userId: user.id,
      organizationId: user.organizationId ?? null,
    },
    range: "180d",
  });

  return <ExpenseDashboard initialData={data} />;
}
