"use client";

import { useSession } from "next-auth/react";
import { KanbanBoard } from "@/components/board/kanban-board";

export default function MyTasksPage() {
  const { data: session } = useSession();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-3">
        <h1 className="text-lg font-semibold text-foreground">My Tasks</h1>
        <p className="text-xs text-muted-foreground">
          Personal Kanban filtered to your assignments
        </p>
      </div>
      <div className="flex-1">
        <KanbanBoard filterByUser={session?.user?.id} />
      </div>
    </div>
  );
}
