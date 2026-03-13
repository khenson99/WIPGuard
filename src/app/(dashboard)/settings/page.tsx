"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Settings as SettingsIcon } from "lucide-react";
import { clsx } from "clsx";
import { BoardSettingsTab } from "@/components/settings/board-settings-tab";
import { SprintsTab } from "@/components/settings/sprints-tab";
import { ProjectsTab } from "@/components/settings/projects-tab";
import { PrioritiesTab } from "@/components/settings/priorities-tab";
import { TeamTab } from "@/components/settings/team-tab";
import { DepartmentsTab } from "@/components/settings/departments-tab";
import { OperationsTab } from "@/components/settings/operations-tab";
import { DesignInterviewTab } from "@/components/settings/design-interview-tab";

const TABS = [
  { id: "board", label: "Board & WIP Limits" },
  { id: "sprints", label: "Sprints" },
  { id: "projects", label: "Projects" },
  { id: "departments", label: "Departments" },
  { id: "priorities", label: "Company Priorities" },
  { id: "design-interview", label: "Design Interview" },
  { id: "team", label: "Team" },
  { id: "operations", label: "Operations" },
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

  useEffect(() => {
    if (tabParam !== "integrations") return;

    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("tab");
    const suffix = params.toString();
    router.replace(`/integrations${suffix ? `?${suffix}` : ""}`, { scroll: false });
  }, [router, searchParams, tabParam]);

  const handleTabChange = useCallback((tabId: TabId) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", tabId);
    const basePath = pathname || "/settings";
    router.replace(`${basePath}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const tabIds = TABS.map((t) => t.id);
      const currentIndex = tabIds.indexOf(activeTab);
      let nextIndex: number | null = null;

      if (e.key === "ArrowRight") {
        nextIndex = (currentIndex + 1) % tabIds.length;
      } else if (e.key === "ArrowLeft") {
        nextIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
      } else if (e.key === "Home") {
        nextIndex = 0;
      } else if (e.key === "End") {
        nextIndex = tabIds.length - 1;
      }

      if (nextIndex !== null) {
        e.preventDefault();
        const nextTab = tabIds[nextIndex];
        handleTabChange(nextTab);
        document.getElementById(`tab-${nextTab}`)?.focus();
      }
    },
    [activeTab, handleTabChange],
  );

  if (tabParam === "integrations") {
    return null;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <SettingsIcon className="h-5 w-5 text-primary" />
          Settings
        </h1>
        <p className="text-xs text-muted-foreground">
          Configure platform defaults, WIP policy, team setup, and operating guardrails.
        </p>
      </div>

      {/* Tab bar */}
      <div role="tablist" aria-label="Settings sections" onKeyDown={handleTabKeyDown} className="flex border-b border-border px-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
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
      <div role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} className="flex-1 overflow-auto px-6 py-5">
        {activeTab === "board" && <BoardSettingsTab />}
        {activeTab === "sprints" && <SprintsTab />}
        {activeTab === "projects" && <ProjectsTab />}
        {activeTab === "departments" && <DepartmentsTab />}
        {activeTab === "priorities" && <PrioritiesTab />}
        {activeTab === "design-interview" && <DesignInterviewTab />}
        {activeTab === "team" && <TeamTab />}
        {activeTab === "operations" && <OperationsTab />}
      </div>
    </div>
  );
}
