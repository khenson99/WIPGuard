"use client";

import { useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { clsx } from "clsx";
import { BoardSettingsTab } from "@/components/settings/board-settings-tab";
import { SprintsTab } from "@/components/settings/sprints-tab";
import { ProjectsTab } from "@/components/settings/projects-tab";
import { PrioritiesTab } from "@/components/settings/priorities-tab";
import { TeamTab } from "@/components/settings/team-tab";

const TABS = [
  { id: "board", label: "Board & WIP Limits" },
  { id: "sprints", label: "Sprints" },
  { id: "projects", label: "Projects" },
  { id: "priorities", label: "Company Priorities" },
  { id: "team", label: "Team" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("board");

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 px-6 py-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-white">
          <SettingsIcon className="h-5 w-5 text-amber-500" />
          Settings
        </h1>
        <p className="text-xs text-zinc-500">
          Configure your board, sprints, projects, and team
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-zinc-800 px-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto px-6 py-5">
        {activeTab === "board" && <BoardSettingsTab />}
        {activeTab === "sprints" && <SprintsTab />}
        {activeTab === "projects" && <ProjectsTab />}
        {activeTab === "priorities" && <PrioritiesTab />}
        {activeTab === "team" && <TeamTab />}
      </div>
    </div>
  );
}
