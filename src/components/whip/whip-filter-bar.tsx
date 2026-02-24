"use client";

import { useMemo } from "react";
import type { SprintOption, WhipFilters, WhipTask } from "./types";
import { getSprintLabel } from "@/lib/sprints";

interface WhipFilterBarProps {
  sprints: SprintOption[];
  tasks: WhipTask[];
  filters: WhipFilters;
  setFilters: (partial: Partial<WhipFilters>) => void;
}

export function WhipFilterBar({ sprints, tasks, filters, setFilters }: WhipFilterBarProps) {
  const owners = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const task of tasks) {
      for (const r of task.responsible) {
        if (!map.has(r.id)) {
          map.set(r.id, { id: r.id, name: r.name ?? r.email });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  const selectClass =
    "rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none";

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Sprint selector */}
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Sprint
        <select
          value={filters.sprintId ?? ""}
          onChange={(e) => setFilters({ sprintId: e.target.value || null })}
          className={selectClass}
        >
          <option value="">All sprints</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {getSprintLabel(s)}
              {s.isActive ? " (active)" : ""}
            </option>
          ))}
        </select>
      </label>

      {/* Priority filter */}
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Priority
        <select
          value={filters.priority ?? ""}
          onChange={(e) => setFilters({ priority: e.target.value || null })}
          className={selectClass}
        >
          <option value="">All</option>
          <option value="P0">P0 - Critical</option>
          <option value="P1">P1 - High</option>
          <option value="P2">P2 - Medium</option>
          <option value="P3">P3 - Low</option>
        </select>
      </label>

      {/* Owner filter */}
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Owner
        <select
          value={filters.ownerId ?? ""}
          onChange={(e) => setFilters({ ownerId: e.target.value || null })}
          className={selectClass}
        >
          <option value="">All owners</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
