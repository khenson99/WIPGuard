"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronDown, Download } from "lucide-react";
import { downloadCSV, downloadJSON } from "@/lib/export/logbook-export";
import type { LogbookEntry } from "@/lib/export/logbook-export";

export interface LogbookExportDropdownProps {
  entries: LogbookEntry[];
  dateRange?: { from: Date; to: Date } | null;
  disabled?: boolean;
}

const MENU_ITEMS = [
  { label: "Export as CSV", format: "csv" as const },
  { label: "Export as JSON", format: "json" as const },
] as const;

export default function LogbookExportDropdown({
  entries,
  dateRange,
  disabled = false,
}: LogbookExportDropdownProps) {
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const isDisabled = disabled || entries.length === 0;

  const handleExport = useCallback(
    (format: "csv" | "json") => {
      if (format === "csv") {
        downloadCSV(entries, dateRange);
      } else {
        downloadJSON(entries, dateRange);
      }
      setOpen(false);
      setFocusIndex(-1);
      triggerRef.current?.focus();
    },
    [entries, dateRange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (!open) {
            setOpen(true);
            setFocusIndex(0);
          } else {
            setFocusIndex((prev) => Math.min(prev + 1, MENU_ITEMS.length - 1));
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (open) {
            setFocusIndex((prev) => Math.max(prev - 1, 0));
          }
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (open && focusIndex >= 0) {
            handleExport(MENU_ITEMS[focusIndex].format);
          } else if (!open) {
            setOpen(true);
            setFocusIndex(0);
          }
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          setFocusIndex(-1);
          triggerRef.current?.focus();
          break;
        case "Tab":
          setOpen(false);
          setFocusIndex(-1);
          break;
      }
    },
    [open, focusIndex, handleExport]
  );

  // Move focus to the active menu item when focusIndex changes
  useEffect(() => {
    if (open && focusIndex >= 0 && menuRef.current) {
      const items = menuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]');
      items[focusIndex]?.focus();
    }
  }, [open, focusIndex]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
        setFocusIndex(-1);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        id="logbook-export-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="logbook-export-menu"
        aria-label={`Export ${entries.length} logbook entries`}
        disabled={isDisabled}
        onClick={() => {
          if (!isDisabled) setOpen((prev) => !prev);
        }}
        onKeyDown={handleKeyDown}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2.5 py-1 text-xs text-foreground hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Download className="h-3.5 w-3.5" />
        Export
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <ul
          ref={menuRef}
          id="logbook-export-menu"
          role="menu"
          aria-labelledby="logbook-export-trigger"
          className="absolute right-0 top-full z-10 mt-1 w-40 rounded-md border border-border bg-card py-1 shadow-lg"
        >
          {MENU_ITEMS.map((item, i) => (
            <li
              key={item.format}
              role="menuitem"
              tabIndex={focusIndex === i ? 0 : -1}
              onClick={() => handleExport(item.format)}
              onKeyDown={handleKeyDown}
              className="flex w-full cursor-pointer items-center px-3 py-1.5 text-xs text-foreground hover:bg-secondary focus:bg-secondary focus:outline-none"
            >
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
