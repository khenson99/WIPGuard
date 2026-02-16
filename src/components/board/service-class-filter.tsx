"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Clock, Calendar, Zap, Wrench, ChevronDown, X } from "lucide-react";
import { clsx } from "clsx";
import {
  type ClassOfService,
  CLASS_OF_SERVICE_VALUES,
  SERVICE_CLASS_META,
  getServiceClassColors,
} from "@/lib/class-of-service";

// ---------------------------------------------------------------------------
// Icon resolver (matches service-class-badge.tsx)
// ---------------------------------------------------------------------------

const ICON_MAP = {
  Clock,
  Calendar,
  Zap,
  Wrench,
} as const;

// ---------------------------------------------------------------------------
// ServiceClassFilter
// ---------------------------------------------------------------------------

interface ServiceClassFilterProps {
  /** Currently selected service classes (empty = show all) */
  selected: ClassOfService[];
  /** Callback when selection changes */
  onChange: (selected: ClassOfService[]) => void;
  /** Count of items per class — used to show badges */
  counts?: Partial<Record<ClassOfService, number>>;
}

/**
 * Multi-select dropdown filter for class of service.
 *
 * Renders as a compact button that opens a checkbox popover.
 * Designed to sit alongside existing BoardFilters.
 */
export function ServiceClassFilter({
  selected,
  onChange,
  counts,
}: ServiceClassFilterProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    },
    []
  );

  const toggle = (cls: ClassOfService) => {
    if (selected.includes(cls)) {
      onChange(selected.filter((c) => c !== cls));
    } else {
      onChange([...selected, cls]);
    }
  };

  const clearAll = () => onChange([]);

  const buttonLabel =
    selected.length === 0
      ? "All Classes"
      : selected.length === 1
        ? SERVICE_CLASS_META[selected[0]].label
        : `${selected.length} Classes`;

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Filter by class of service"
        aria-expanded={open}
        aria-haspopup="listbox"
        className={clsx(
          "flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1 text-xs transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
          selected.length > 0
            ? "text-foreground"
            : "text-muted-foreground"
        )}
      >
        <span>{buttonLabel}</span>
        <ChevronDown
          className={clsx(
            "h-3 w-3 transition-transform",
            open && "rotate-180"
          )}
          aria-hidden="true"
        />
      </button>

      {/* Clear button — visible when filters are active */}
      {selected.length > 0 && (
        <button
          onClick={clearAll}
          aria-label="Clear class of service filter"
          className="ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}

      {/* Dropdown popover */}
      {open && (
        <div
          role="listbox"
          aria-label="Class of service options"
          aria-multiselectable="true"
          className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border border-border bg-card shadow-lg"
        >
          <div className="p-1.5">
            {CLASS_OF_SERVICE_VALUES.map((cls) => {
              const meta = SERVICE_CLASS_META[cls];
              const colors = getServiceClassColors(cls);
              const Icon = ICON_MAP[meta.iconName];
              const isSelected = selected.includes(cls);
              const count = counts?.[cls] ?? 0;

              return (
                <button
                  key={cls}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => toggle(cls)}
                  className={clsx(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors",
                    "hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]",
                    isSelected && "bg-secondary/60"
                  )}
                >
                  {/* Checkbox indicator */}
                  <span
                    className={clsx(
                      "flex h-3.5 w-3.5 items-center justify-center rounded-sm border",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40"
                    )}
                    aria-hidden="true"
                  >
                    {isSelected && (
                      <svg
                        viewBox="0 0 12 12"
                        className="h-2.5 w-2.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M2 6l3 3 5-5" />
                      </svg>
                    )}
                  </span>

                  {/* Icon */}
                  <span
                    className={clsx(
                      "flex h-4 w-4 items-center justify-center rounded",
                      colors.bg,
                      colors.text
                    )}
                  >
                    <Icon className="h-2.5 w-2.5" />
                  </span>

                  {/* Label */}
                  <span className="flex-1 text-left text-foreground">
                    {meta.label}
                  </span>

                  {/* Count */}
                  {count > 0 && (
                    <span className="rounded-full bg-tag-bg px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Description footer */}
          <div className="border-t border-border px-2.5 py-1.5">
            <p className="text-[10px] text-muted-foreground">
              Filter tasks by their scheduling policy lane.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
