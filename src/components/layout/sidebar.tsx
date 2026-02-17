"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Bot,
  BookOpen,
  Settings,
  Gauge,
  type LucideIcon,
} from "lucide-react";

interface SidebarNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface DashboardNavItem {
  href: string;
  label: string;
  indicatorColor: string;
}

export const PRIMARY_NAV_ITEMS: SidebarNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/whip", label: "Whip View", icon: Gauge },
  { href: "/automations", label: "Automations", icon: Bot },
];

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  { href: "/analytics/ads-traffic", label: "Ads & Traffic", indicatorColor: "#3b82f6" },
  { href: "/analytics/finance", label: "Finance", indicatorColor: "#16a34a" },
  { href: "/analytics/sales-pipeline", label: "Sales & Pipeline", indicatorColor: "#f59e0b" },
  { href: "/analytics/customer-success", label: "Customer Success", indicatorColor: "#ef4444" },
];

export const SECONDARY_NAV_ITEMS: SidebarNavItem[] = [
  { href: "/logbook", label: "Logbook", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname() ?? "";

  const isActive = (href: string): boolean => {
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-sidebar-border bg-sidebar-bg text-sm text-sidebar-foreground">
      <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-4">
        <LayoutDashboard className="h-6 w-6 text-primary" aria-hidden="true" />
        <span className="text-lg font-bold text-foreground">WIPGuard</span>
      </div>

      <nav aria-label="Main navigation" className="flex-1 space-y-0.5 px-2 py-3">
        {PRIMARY_NAV_ITEMS.map((item) => {
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

        <div className="pt-2">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-sidebar-muted">
            Dashboards
          </p>
          <div aria-label="Dashboard navigation" className="space-y-0.5 pl-4">
            {DASHBOARD_NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
                    active ? "sidebar-link-active" : "sidebar-link"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.indicatorColor }}
                  />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
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
