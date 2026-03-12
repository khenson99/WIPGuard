import { RalphBoardView } from "@/components/automations/ralph-board-view";
import { prisma } from "@/lib/prisma";
import { ARDA_GTM_OPERATOR_BOARD_PROJECT_NAME } from "@/lib/automations/ralph-board";

export default async function RalphBoardPage() {
  const project = await prisma.project.findFirst({
    where: { name: ARDA_GTM_OPERATOR_BOARD_PROJECT_NAME },
    select: {
      id: true,
      name: true,
      description: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-lg rounded-xl border border-border bg-card p-6">
          <h1 className="text-lg font-semibold text-foreground">Ralph board unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The dedicated Arda GTM operator board project has not been seeded yet.
            Run the Prisma seed to create the shared project and rollout tasks.
          </p>
        </div>
      </div>
    );
  }

  return <RalphBoardView projectId={project.id} projectName={project.name} />;
}
