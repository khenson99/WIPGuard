"use client";

import { useEffect, useRef } from "react";
import { X, ArrowRight } from "lucide-react";
import type { MatchedJourney } from "@/lib/analytics/path-matching";

interface PathDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  pathStages: string[];
  journeys: MatchedJourney[];
  isLoading?: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function relativeDate(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function PathDetailDrawer({
  open,
  onClose,
  pathStages,
  journeys,
  isLoading,
}: PathDetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const titleId = "path-drawer-title";

  useEffect(() => {
    if (!open) return;
    drawerRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute right-0 top-0 h-full w-full max-w-lg bg-background border-l border-border shadow-xl flex flex-col outline-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border p-4 gap-3">
          <div className="min-w-0">
            <p id={titleId} className="text-sm font-semibold text-foreground">
              Path Detail
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {pathStages.map((stage, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
                    {stage}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
              ))}
            </div>
          ) : journeys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm font-medium text-muted-foreground">No matching deals found</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                No deals took this exact path sequence.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                {journeys.length} deal{journeys.length !== 1 ? "s" : ""} matched this path
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 pr-3 font-medium">Deal</th>
                      <th className="pb-2 pr-3 text-right font-medium">Value</th>
                      <th className="pb-2 pr-3 font-medium">Stage</th>
                      <th className="pb-2 pr-3 text-right font-medium">Days</th>
                      <th className="pb-2 text-right font-medium">Last Touch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journeys.map((j) => (
                      <tr
                        key={j.id}
                        className="border-b border-border/40 even:bg-muted/30 last:border-0"
                      >
                        <td className="py-2.5 pr-3">
                          <div className="max-w-[160px] truncate font-medium text-foreground">
                            {j.dealName}
                          </div>
                          {j.contactEmail && (
                            <div className="max-w-[160px] truncate text-muted-foreground">
                              {j.contactEmail}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                          {j.value > 0 ? formatCurrency(j.value) : "—"}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-foreground">
                            {j.currentStage}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">
                          {j.daysInPipeline}d
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                          {relativeDate(j.lastTouch)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
