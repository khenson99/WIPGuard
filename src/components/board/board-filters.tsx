"use client";

import { useBoardStore } from "@/store/board-store";
import { Filter, X } from "lucide-react";
import { getSprintLabel } from "@/lib/sprints";

export function BoardFilters() {
  const {
    teamMembers,
    projects,
    sprints,
    filterAssignee,
    filterProject,
    filterPriority,
    filterSprint,
    setFilter,
  } = useBoardStore();

  const hasActiveFilters =
    filterAssignee || filterProject || filterPriority || filterSprint;

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Board filters">
      <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />

      <select
        value={filterAssignee || ""}
        onChange={(e) =>
          setFilter("filterAssignee", e.target.value || null)
        }
        aria-label="Filter by team member"
        className="rounded-md border border-border bg-secondary text-foreground px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
      >
        <option value="">All Members</option>
        {teamMembers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name || m.email}
          </option>
        ))}
      </select>

      <select
        value={filterProject || ""}
        onChange={(e) =>
          setFilter("filterProject", e.target.value || null)
        }
        aria-label="Filter by project"
        className="rounded-md border border-border bg-secondary text-foreground px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
      >
        <option value="">All Projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <select
        value={filterPriority || ""}
        onChange={(e) =>
          setFilter("filterPriority", e.target.value || null)
        }
        aria-label="Filter by priority"
        className="rounded-md border border-border bg-secondary text-foreground px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
      >
        <option value="">All Priorities</option>
        <option value="P0">P0 - Critical</option>
        <option value="P1">P1 - High</option>
        <option value="P2">P2 - Medium</option>
        <option value="P3">P3 - Low</option>
      </select>

      <select
        value={filterSprint || ""}
        onChange={(e) =>
          setFilter("filterSprint", e.target.value || null)
        }
        aria-label="Filter by sprint"
        className="rounded-md border border-border bg-secondary text-foreground px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
      >
        <option value="">All Sprints</option>
        {sprints.map((s) => (
          <option key={s.id} value={s.id}>
            {getSprintLabel(s)}
            {s.isActive ? " (active)" : ""}
          </option>
        ))}
      </select>

      {hasActiveFilters && (
        <button
          onClick={() => {
            setFilter("filterAssignee", null);
            setFilter("filterProject", null);
            setFilter("filterPriority", null);
            setFilter("filterSprint", null);
          }}
          aria-label="Clear all filters"
          className="btn-ghost-muted flex items-center gap-1 rounded-md px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
        >
          <X className="h-3 w-3" aria-hidden="true" />
          Clear
        </button>
      )}
    </div>
  );
}
