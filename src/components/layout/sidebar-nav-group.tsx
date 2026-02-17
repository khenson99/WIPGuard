"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import type { NavItem } from "./sidebar-nav-config";

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

function writeExpanded(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Ignore storage write failures.
  }
}

export type AnalyticsSectionStatus = "connected" | "partial" | "degraded" | "missing";

const STATUS_DOT_CLASS: Record<AnalyticsSectionStatus, string> = {
  connected: "bg-emerald-500",
  partial: "bg-amber-500",
  degraded: "bg-orange-500",
  missing: "bg-muted-foreground/50",
};

function StatusDot({ status }: { status?: AnalyticsSectionStatus }) {
  if (!status) return null;
  return (
    <span
      className={clsx("h-1.5 w-1.5 rounded-full", STATUS_DOT_CLASS[status])}
      title={`Status: ${status}`}
      aria-label={`Status: ${status}`}
    />
  );
}

export function SidebarNavGroup({
  item,
  status,
  childStatusMap,
}: {
  item: NavItem;
  status?: AnalyticsSectionStatus;
  childStatusMap?: Record<string, AnalyticsSectionStatus>;
}) {
  const pathname = usePathname() ?? "";

  const isChildActive = item.children?.some((child) => {
    return pathname === child.href || pathname.startsWith(`${child.href}/`);
  });
  const isParentActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

  const [storedExpanded, setStoredExpanded] = useState(() => {
    return readExpanded().has(item.id);
  });

  const expanded = storedExpanded || Boolean(isChildActive);

  const toggle = () => {
    setStoredExpanded((previous) => {
      const next = !previous;
      const stored = readExpanded();
      if (next) {
        stored.add(item.id);
      } else {
        stored.delete(item.id);
      }
      writeExpanded(stored);
      return next;
    });
  };

  return (
    <div>
      <div className="flex items-center">
        <Link
          href={item.href}
          aria-current={isParentActive || isChildActive ? "page" : undefined}
          className={clsx(
            "flex flex-1 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
            isParentActive || isChildActive ? "sidebar-link-active" : "sidebar-link"
          )}
        >
          <item.icon className="h-4 w-4" aria-hidden="true" />
          {item.label}
          <span className="ml-auto">
            <StatusDot status={status} />
          </span>
        </Link>
        <button
          type="button"
          onClick={toggle}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
          aria-label={expanded ? `Collapse ${item.label}` : `Expand ${item.label}`}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="grid transition-[grid-template-rows] duration-200" style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}>
        <div className="overflow-hidden">
          {item.children?.map((child) => {
            const childActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
            return (
              <Link
                key={child.id}
                href={child.href}
                aria-current={childActive ? "page" : undefined}
                className={clsx(
                  "flex items-center justify-between rounded-md py-1.5 pl-10 pr-3 text-[13px]",
                  childActive ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span>{child.label}</span>
                <StatusDot status={childStatusMap?.[child.id]} />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
