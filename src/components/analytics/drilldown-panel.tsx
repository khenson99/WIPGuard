"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Download, X } from "lucide-react";
import { downloadCsv } from "@/lib/analytics/csv-export";

// ---------------------------------------------------------------------------
// DrilldownPanel — standardized wrapper for analytics drill-down sections
// ---------------------------------------------------------------------------

export interface DrilldownPanelProps {
  /** Panel heading displayed in the header bar. */
  title: string;
  /** Optional subtitle below the title. */
  subtitle?: string;
  /** If provided, renders an "Export CSV" button that calls `downloadCsv`. */
  csvExport?: {
    filename: string;
    headers: string[];
    rows: () => string[][];
  };
  /** Optional filter controls rendered between the header and body. */
  filters?: ReactNode;
  /** Summary line below filters (e.g. "12 of 48 journeys"). */
  statusLine?: string;
  /** Body content — table, chart, etc. */
  children: ReactNode;
  /** Optional empty state message when there is no data. */
  emptyMessage?: string;
  /** Whether the panel body is empty (triggers empty state). */
  isEmpty?: boolean;
  /** Start collapsed (default false). */
  defaultCollapsed?: boolean;
}

export function DrilldownPanel({
  title,
  subtitle,
  csvExport,
  filters,
  statusLine,
  children,
  emptyMessage = "No data available.",
  isEmpty = false,
  defaultCollapsed = false,
}: DrilldownPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const handleExport = () => {
    if (!csvExport) return;
    downloadCsv(csvExport.filename, csvExport.headers, csvExport.rows());
  };

  return (
    <section className="rounded-xl border border-border bg-card" aria-label={title}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2">
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>

        {csvExport && !collapsed && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              handleExport();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                handleExport();
              }
            }}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            <Download className="h-3 w-3" aria-hidden="true" />
            Export CSV
          </span>
        )}
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="border-t border-border px-5 pb-5 pt-4">
          {filters && <div className="mb-3">{filters}</div>}

          {statusLine && (
            <p className="mb-3 text-xs text-muted-foreground">{statusLine}</p>
          )}

          {isEmpty ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
          ) : (
            children
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// DrilldownDrawer — slide-over drawer for row-level detail
// ---------------------------------------------------------------------------

export interface DrilldownDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function DrilldownDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
}: DrilldownDrawerProps) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-card shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </>
  );
}
