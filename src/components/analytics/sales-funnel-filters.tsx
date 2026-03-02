"use client";

import type { DateRangePreset, Rep } from "@/lib/sales-funnel-filter-utils";

interface SalesFunnelFiltersProps {
  reps: Rep[];
  dateRange: DateRangePreset;
  selectedRepId: string | null;
  filteredCount: number;
  totalCount: number;
  onDateRangeChange: (preset: DateRangePreset) => void;
  onRepChange: (repId: string | null) => void;
}

const DATE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

export function SalesFunnelFilters({
  reps,
  dateRange,
  selectedRepId,
  filteredCount,
  totalCount,
  onDateRangeChange,
  onRepChange,
}: SalesFunnelFiltersProps) {
  const isFiltered = filteredCount < totalCount;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4">
      {/* Date range */}
      <div className="flex items-center gap-2">
        <label
          htmlFor="date-range-select"
          className="text-sm font-medium text-muted-foreground"
        >
          Date range
        </label>
        <select
          id="date-range-select"
          value={dateRange}
          onChange={(e) => onDateRangeChange(e.target.value as DateRangePreset)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {DATE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Rep selector */}
      <div className="flex items-center gap-2">
        <label
          htmlFor="rep-select"
          className="text-sm font-medium text-muted-foreground"
        >
          Rep
        </label>
        <select
          id="rep-select"
          value={selectedRepId ?? ""}
          onChange={(e) => onRepChange(e.target.value || null)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">All reps</option>
          {reps.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {/* Active-filter indicator */}
      {isFiltered && (
        <span
          className="text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          Showing {filteredCount} of {totalCount} deals
        </span>
      )}
    </div>
  );
}
