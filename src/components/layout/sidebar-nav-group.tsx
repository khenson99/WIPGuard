"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import type { NavItem } from "./sidebar-nav-config";
import { ConnectionDot } from "@/components/analytics/connection-dot";
import { useConnectionStatus } from "@/hooks/use-connection-status";

const STORAGE_KEY = "sidebar:expanded";

type SidebarExpandedPreference = {
  /**
   * When true: `ids` is the explicit allowlist of expanded group IDs.
   * When false: `ids` is the explicit blocklist of collapsed group IDs.
   */
  explicit: boolean;
  ids: Set<string>;
};

function parseIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

function readExpandedPreference(): SidebarExpandedPreference {
  if (typeof window === "undefined") return { explicit: false, ids: new Set() };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { explicit: false, ids: new Set() };
    }

    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const ids = parseIds(parsed);
      if (ids.length === 0) {
        return { explicit: false, ids: new Set() };
      }
      return { explicit: true, ids: new Set(ids) };
    }

    if (!parsed || typeof parsed !== "object") {
      return { explicit: false, ids: new Set() };
    }

    const record = parsed as Record<string, unknown>;
    return {
      explicit: record.explicit === true,
      ids: new Set(parseIds(record.ids)),
    };
  } catch {
    return { explicit: false, ids: new Set() };
  }
}

function writeExpandedPreference(preference: SidebarExpandedPreference): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ids: [...preference.ids],
        explicit: preference.explicit,
      }),
    );
  } catch {
    // Ignore storage write failures.
  }
}

export function SidebarNavGroup({ item }: { item: NavItem }) {
  const pathname = usePathname() ?? "";
  const getStatus = useConnectionStatus((s) => s.getStatus);

  const isChildActive = item.children?.some((child) => {
    return pathname === child.href || pathname.startsWith(`${child.href}/`);
  });
  const isParentActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

  const [preference, setPreference] = useState<SidebarExpandedPreference>(() => {
    return readExpandedPreference();
  });

  const storedExpanded = preference.explicit
    ? preference.ids.has(item.id)
    : !preference.ids.has(item.id);
  const expanded = storedExpanded || Boolean(isChildActive);

  const toggle = () => {
    setPreference(() => {
      const stored = readExpandedPreference();
      const currentlyExpanded = stored.explicit
        ? stored.ids.has(item.id)
        : !stored.ids.has(item.id);

      if (stored.explicit) {
        if (currentlyExpanded) {
          stored.ids.delete(item.id);
        } else {
          stored.ids.add(item.id);
        }
      } else {
        if (currentlyExpanded) {
          stored.ids.add(item.id);
        } else {
          stored.ids.delete(item.id);
        }
      }

      writeExpandedPreference(stored);
      return stored;
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
                <ConnectionDot status={getStatus(child.dataDomain)} size="sm" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
