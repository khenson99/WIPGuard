"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { LayoutDashboard, BookOpen, Settings } from "lucide-react";
import { buildNavItems } from "./sidebar-nav-config";
import { SidebarNavGroup, type AnalyticsSectionStatus } from "./sidebar-nav-group";

export const SECONDARY_NAV_ITEMS = [
  { href: "/logbook", label: "Logbook", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

const navItems = buildNavItems();

interface AnalyticsSummarySidebarPayload {
  primarySections?: Array<{
    id?: string;
    status?: AnalyticsSectionStatus;
    children?: Array<{
      id?: string;
      status?: AnalyticsSectionStatus;
    }>;
  }>;
}

interface AnalyticsSidebarStatusMap {
  primary: Record<string, AnalyticsSectionStatus>;
  secondary: Record<string, AnalyticsSectionStatus>;
}

export function Sidebar() {
  const pathname = usePathname() ?? "";
  const [analyticsStatuses, setAnalyticsStatuses] = useState<AnalyticsSidebarStatusMap | null>(null);

  const isActive = (href: string): boolean => {
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    const loadStatuses = async () => {
      try {
        const response = await fetch("/api/analytics/summary", {
          signal: controller.signal,
          cache: "default",
        });
        if (!response.ok) return;

        const payload = (await response.json()) as AnalyticsSummarySidebarPayload;
        const primary: Record<string, AnalyticsSectionStatus> = {};
        const secondary: Record<string, AnalyticsSectionStatus> = {};

        for (const section of payload.primarySections ?? []) {
          if (section.id && section.status) {
            primary[section.id] = section.status;
          }
          for (const child of section.children ?? []) {
            if (child.id && child.status) {
              secondary[child.id] = child.status;
            }
          }
        }

        if (!mounted) return;
        setAnalyticsStatuses({ primary, secondary });
      } catch {
        // Best-effort indicator load; keep nav usable without status data.
      }
    };

    void loadStatuses();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-sidebar-border bg-sidebar-bg text-sm text-sidebar-foreground">
      <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-4">
        <LayoutDashboard className="h-6 w-6 text-primary" aria-hidden="true" />
        <span className="text-lg font-bold text-foreground">WIPGuard</span>
      </div>

      <nav aria-label="Main navigation" className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {navItems.map((item) =>
          item.children && item.children.length > 0 ? (
            <SidebarNavGroup
              key={item.id}
              item={item}
              status={analyticsStatuses?.primary[item.id]}
              childStatusMap={analyticsStatuses?.secondary}
            />
          ) : (
            <Link
              key={item.id}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={clsx(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
                isActive(item.href) ? "sidebar-link-active" : "sidebar-link"
              )}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          )
        )}
      </nav>

      <nav aria-label="Secondary navigation" className="space-y-0.5 border-t border-sidebar-border p-2">
        {SECONDARY_NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
                active ? "sidebar-link-active" : "sidebar-link"
              )}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
