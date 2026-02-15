"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Settings as SettingsIcon } from "lucide-react";
import { clsx } from "clsx";
import { BoardSettingsTab } from "@/components/settings/board-settings-tab";
import { SprintsTab } from "@/components/settings/sprints-tab";
import { ProjectsTab } from "@/components/settings/projects-tab";
import { PrioritiesTab } from "@/components/settings/priorities-tab";
import { TeamTab } from "@/components/settings/team-tab";
import { DepartmentsTab } from "@/components/settings/departments-tab";
import { IntegrationsTab } from "@/components/settings/integrations-tab";

const TABS = [
  { id: "board", label: "Board & WIP Limits" },
  { id: "sprints", label: "Sprints" },
  { id: "projects", label: "Projects" },
  { id: "departments", label: "Departments" },
  { id: "priorities", label: "Company Priorities" },
  { id: "team", label: "Team" },
  { id: "integrations", label: "Integrations" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab");
  const activeTab: TabId =
    tabParam && TABS.some((candidate) => candidate.id === tabParam)
      ? (tabParam as TabId)
      : "board";

  const handleTabChange = (tabId: TabId) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", tabId);
    const basePath = pathname || "/settings";
    router.replace(`${basePath}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <SettingsIcon className="h-5 w-5 text-primary" />
          Settings
        </h1>
        <p className="text-xs text-muted-foreground">
          Configure your board, sprints, projects, and team
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border px-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={clsx(
              "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
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
        {activeTab === "departments" && <DepartmentsTab />}
        {activeTab === "priorities" && <PrioritiesTab />}
        {activeTab === "team" && <TeamTab />}
        {activeTab === "integrations" && <IntegrationsTab />}
      </div>
    </div>
  );
}
