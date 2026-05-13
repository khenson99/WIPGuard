"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Settings as SettingsIcon } from "lucide-react";
import { clsx } from "clsx";
import { TeamTab } from "@/components/settings/team-tab";
import { OperationsTab } from "@/components/settings/operations-tab";

const TABS = [
  { id: "team", label: "Team" },
  { id: "operations", label: "Operations" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const LEGACY_SETTINGS_TABS = new Set([
  "board",
  "sprints",
  "projects",
  "departments",
  "priorities",
  "design-interview",
]);

export default function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab");
  const isLegacySettingsTab = tabParam ? LEGACY_SETTINGS_TABS.has(tabParam) : false;
  const activeTab: TabId =
    tabParam && TABS.some((candidate) => candidate.id === tabParam)
      ? (tabParam as TabId)
      : "team";

  useEffect(() => {
    if (
      tabParam !== "integrations" &&
      tabParam !== "board" &&
      tabParam !== "sprints" &&
      tabParam !== "projects"
    ) {
      return;
    }

    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (tabParam === "integrations") {
      params.delete("tab");
      const suffix = params.toString();
      router.replace(`/integrations${suffix ? `?${suffix}` : ""}`, { scroll: false });
      return;
    }

    params.set("tab", "departments");
    const basePath = pathname || "/settings";
    router.replace(`${basePath}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams, tabParam]);

  useEffect(() => {
    if (!isLegacySettingsTab) return;

    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", "team");
    const basePath = pathname || "/settings";
    router.replace(`${basePath}?${params.toString()}`, { scroll: false });
  }, [isLegacySettingsTab, pathname, router, searchParams]);

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

  if (tabParam === "integrations" || isLegacySettingsTab) {
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
          Configure team access and analytics operating guardrails.
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
        {activeTab === "team" && <TeamTab />}
        {activeTab === "operations" && <OperationsTab />}
      </div>
    </div>
  );
}
