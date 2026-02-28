// src/components/analytics/dashboard-section-card.tsx
"use client";

import { useState } from "react";

interface DashboardSectionCardProps {
  title: string;
  subtitle?: string;
  tabs?: { id: string; label: string }[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function DashboardSectionCard({
  title,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  children,
  className,
}: DashboardSectionCardProps) {
  const [internalTab, setInternalTab] = useState(tabs?.[0]?.id ?? "");
  const currentTab = activeTab ?? internalTab;
  const handleTabChange = onTabChange ?? setInternalTab;

  return (
    <div className={`rounded-xl border border-border bg-card p-5 ${className ?? ""}`}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {tabs && tabs.length > 1 && (
          <div className="flex gap-1 rounded-lg bg-secondary/50 p-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  currentTab === tab.id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
