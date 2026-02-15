"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  User,
  Sun,
  Table,
  BookOpen,
  Settings,
  FolderKanban,
  BarChart3,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/board", label: "Dashboard", icon: LayoutDashboard },
  { href: "/my-tasks", label: "My Tasks", icon: User },
  { href: "/today", label: "Working on Today", icon: Sun },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/table", label: "Table View", icon: Table },
  { href: "/logbook", label: "Logbook", icon: BookOpen },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-sidebar-border bg-sidebar-bg text-sm text-sidebar-foreground">
      <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-4">
        <LayoutDashboard className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold text-foreground">
          WIPGuard
        </span>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium",
                isActive ? "sidebar-link-active" : "sidebar-link"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <Link
          href="/settings"
          className="sidebar-link flex items-center gap-2.5 rounded-md px-3 py-2 text-sm"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>
    </aside>
  );
}
