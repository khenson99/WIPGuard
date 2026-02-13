"use client";

import { KanbanBoard } from "@/components/board/kanban-board";

export default function TodayPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 px-6 py-3">
        <h1 className="text-lg font-semibold text-white">Working on Today</h1>
        <p className="text-xs text-zinc-500">
          Daily standup view — what&apos;s active right now
        </p>
      </div>
      <div className="flex-1">
        <KanbanBoard filterByStatus={["WORKING_ON_TODAY", "ACTIVE"]} />
      </div>
    </div>
  );
}
