"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { LayoutGrid, Users } from "lucide-react";
import { KanbanBoard } from "@/components/board/kanban-board";
import { StandupView } from "@/components/standup/standup-view";

type ViewMode = "standup" | "board";

export default function TodayPage() {
  const [view, setView] = useState<ViewMode>("standup");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            {view === "standup" ? "Daily Standup" : "Working on Today"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {view === "standup"
              ? "Flow coaching and team overview"
              : "Active tasks board view"}
          </p>
        </div>
        <div className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
          <button
            onClick={() => setView("standup")}
            className={clsx(
              "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
              view === "standup"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Standup
          </button>
          <button
            onClick={() => setView("board")}
            className={clsx(
              "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
              view === "board"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Board
          </button>
        </div>
      </div>
      <div className="flex-1">
        {view === "standup" ? (
          <StandupView />
        ) : (
          <KanbanBoard filterByStatus={["WORKING_ON_TODAY", "ACTIVE"]} />
        )}
      </div>
    </div>
  );
}
