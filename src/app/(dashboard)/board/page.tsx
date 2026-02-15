"use client";

import { useState } from "react";
import { KanbanBoard } from "@/components/board/kanban-board";
import { DashboardView } from "@/components/board/dashboard-view";
import { LayoutDashboard, Columns3 } from "lucide-react";

type ViewMode = "dashboard" | "board";

export default function BoardPage() {
  const [view, setView] = useState<ViewMode>("dashboard");

  return (
    <div className="flex h-full flex-col">
      {/* View switcher */}
      <div className="flex items-center gap-1 border-b border-border px-4 py-2">
        <button
          onClick={() => setView("dashboard")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            view === "dashboard"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </button>
        <button
          onClick={() => setView("board")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            view === "board"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Columns3 className="h-4 w-4" />
          Kanban Board
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {view === "dashboard" ? <DashboardView /> : <KanbanBoard />}
      </div>
    </div>
  );
}
