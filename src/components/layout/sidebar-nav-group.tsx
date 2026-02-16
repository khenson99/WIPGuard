"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import type { NavItem } from "./sidebar-nav-config";
import { ConnectionDot } from "@/components/analytics/connection-dot";
import { useConnectionStatus } from "@/hooks/use-connection-status";

const STORAGE_KEY = "sidebar:expanded";

function readExpanded(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeExpanded(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // noop
  }
}

export function SidebarNavGroup({ item }: { item: NavItem }) {
  const pathname = usePathname() ?? "";
  const getStatus = useConnectionStatus((s) => s.getStatus);

  const isChildActive = item.children?.some(
    (c) => pathname === c.href || pathname.startsWith(`${c.href}/`)
  );
  const isParentActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const stored = readExpanded();
    if (stored.has(item.id) || isChildActive) {
      setExpanded(true);
    }
  }, [item.id, isChildActive]);

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev;
      const stored = readExpanded();
      if (next) stored.add(item.id); else stored.delete(item.id);
      writeExpanded(stored);
      return next;
    });
  };

  return (
    <div>
      <div className="flex items-center">
        <Link
          href={item.href}
          className={clsx(
            "flex flex-1 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium",
            isParentActive || isChildActive ? "sidebar-link-active" : "sidebar-link"
          )}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </Link>
        <button
          onClick={toggle}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
          aria-label={expanded ? `Collapse ${item.label}` : `Expand ${item.label}`}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <div
        className="grid transition-[grid-template-rows] duration-200"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          {item.children?.map((child) => {
            const childActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
            return (
              <Link
                key={child.id}
                href={child.href}
                className={clsx(
                  "flex items-center justify-between rounded-md py-1.5 pl-10 pr-3 text-[13px]",
                  childActive
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span>{child.label}</span>
                <ConnectionDot status={getStatus(child.dataDomain)} size="sm" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
