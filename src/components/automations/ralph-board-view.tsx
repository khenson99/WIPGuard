"use client";

import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { KanbanBoard } from "@/components/board/kanban-board";

export function RalphBoardView({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FolderKanban className="h-4 w-4 text-primary" />
              Ralph Board
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Dedicated rollout board for Arda GTM operators. This view is pinned to the{" "}
              <span className="font-medium text-foreground">{projectName}</span> project.
            </p>
          </div>
          <Link
            href={`/projects/${projectId}`}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Open Project
          </Link>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <KanbanBoard filterByProject={projectId} lockProjectFilter />
      </div>
    </div>
  );
}
