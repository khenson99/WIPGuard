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
  Columns3,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/board", label: "Taskboard", icon: Columns3 },
  { href: "/my-tasks", label: "My Tasks", icon: User },
  { href: "/today", label: "Working on Today", icon: Sun },
  { href: "/table", label: "Table View", icon: Table },
  { href: "/logbook", label: "Logbook", icon: BookOpen },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="flex h-screen w-56 flex-col border-r text-sm"
      style={{
        background: "var(--sidebar-bg)",
        borderColor: "var(--sidebar-border)",
        color: "var(--sidebar-foreground)",
      }}
    >
      <div
        className="flex items-center gap-2 border-b px-4 py-4"
        style={{ borderColor: "var(--sidebar-border)" }}
      >
        <LayoutDashboard
          className="h-6 w-6"
          style={{ color: "var(--primary)" }}
        />
        <span className="text-lg font-bold" style={{ color: "var(--foreground)" }}>
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
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors"
              )}
              style={{
                background: isActive
                  ? "var(--sidebar-active)"
                  : undefined,
                color: isActive
                  ? "var(--sidebar-active-text)"
                  : "var(--sidebar-muted)",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "var(--sidebar-hover)";
                  e.currentTarget.style.color = "var(--sidebar-foreground)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "";
                  e.currentTarget.style.color = "var(--sidebar-muted)";
                }
              }}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div
        className="border-t p-2"
        style={{ borderColor: "var(--sidebar-border)" }}
      >
        <Link
          href="/settings"
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors"
          style={{ color: "var(--sidebar-muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--sidebar-hover)";
            e.currentTarget.style.color = "var(--sidebar-foreground)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "";
            e.currentTarget.style.color = "var(--sidebar-muted)";
          }}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>
    </aside>
  );
}
