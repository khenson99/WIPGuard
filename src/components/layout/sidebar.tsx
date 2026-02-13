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
    <aside className="flex h-screen w-56 flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-300">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-4">
        <LayoutDashboard className="h-6 w-6 text-amber-500" />
        <span className="text-lg font-bold text-white">WIPGuard</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-zinc-800 p-2">
        <Link
          href="/settings"
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>
    </aside>
  );
}
