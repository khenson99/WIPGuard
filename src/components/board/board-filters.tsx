"use client";

import { useBoardStore } from "@/store/board-store";
import { Filter, X } from "lucide-react";

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

  const selectStyle: React.CSSProperties = {
    borderColor: "var(--border)",
    background: "var(--input-bg)",
    color: "var(--foreground)",
  };

  return (
    <div className="flex items-center gap-2">
      <Filter className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />

      <select
        value={filterAssignee || ""}
        onChange={(e) =>
          setFilter("filterAssignee", e.target.value || null)
        }
        className="rounded-md border px-2 py-1 text-xs"
        style={selectStyle}
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
        className="rounded-md border px-2 py-1 text-xs"
        style={selectStyle}
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
        className="rounded-md border px-2 py-1 text-xs"
        style={selectStyle}
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
        className="rounded-md border px-2 py-1 text-xs"
        style={selectStyle}
      >
        <option value="">All Sprints</option>
        {sprints.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
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
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs"
          style={{ color: "var(--muted-foreground)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--foreground)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--muted-foreground)";
          }}
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      )}
    </div>
  );
}
