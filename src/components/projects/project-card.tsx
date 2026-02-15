"use client";

import { useMemo } from "react";
import { CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import type { ProjectWithDetails, ProjectStatus } from "@/types";
import { COLUMN_LABELS } from "@/types";

interface ProjectCardProps {
  project: ProjectWithDetails;
  onClick: () => void;
}

const STATUS_STYLES: Record<
  ProjectStatus,
  { bg: string; text: string; label: string }
> = {
  ACTIVE: { bg: "#22c55e18", text: "#22c55e", label: "Active" },
  ON_HOLD: { bg: "#eab30818", text: "#eab308", label: "On Hold" },
  COMPLETED: { bg: "#3b82f618", text: "#3b82f6", label: "Completed" },
  ARCHIVED: { bg: "#64748b18", text: "#64748b", label: "Archived" },
};

const TYPE_LABELS: Record<string, string> = {
  RECURRING: "Recurring",
  PERPETUAL: "Perpetual",
  ONE_OFF: "One-off",
};

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const { total, done, pct } = useMemo(() => {
    const counts = project.taskStatusCounts || {};
    const t = Object.values(counts).reduce((s, n) => s + n, 0);
    const d = (counts["DONE"] || 0) + (counts["RELEASED"] || 0);
    return { total: t, done: d, pct: t > 0 ? Math.round((d / t) * 100) : 0 };
  }, [project.taskStatusCounts]);

  const status = STATUS_STYLES[project.status] || STATUS_STYLES.ACTIVE;

  // SVG progress ring dimensions
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  // Status bar segments
  const statusSegments = useMemo(() => {
    const counts = project.taskStatusCounts || {};
    if (total === 0) return [];

    const colors: Record<string, string> = {
      BACKLOG: "#94a3b8",
      READY: "#a78bfa",
      IN_PROGRESS: "#3b82f6",
      REVIEW: "#f59e0b",
      DONE: "#22c55e",
      RELEASED: "#06b6d4",
      BLOCKED: "#ef4444",
    };

    return Object.entries(counts).map(([key, count]) => ({
      status: key,
      count,
      pct: (count / total) * 100,
      color: colors[key] || "#64748b",
      label: COLUMN_LABELS[key as keyof typeof COLUMN_LABELS] || key,
    }));
  }, [project.taskStatusCounts, total]);

  const avatars = [...(project.responsible || []), ...(project.sponsor || [])];
  const uniqueAvatars = avatars.filter(
    (u, i, self) => self.findIndex((s) => s.id === u.id) === i,
  );

  return (
    <button
      onClick={onClick}
      className="group w-full rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-ring hover:shadow-lg hover:shadow-primary/5"
    >
      {/* Top row: status badge + type */}
      <div className="mb-3 flex items-center justify-between">
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{ backgroundColor: status.bg, color: status.text }}
        >
          {status.label}
        </span>
        <span className="text-xs text-muted-foreground">
          {TYPE_LABELS[project.projectType] || project.projectType}
        </span>
      </div>

      {/* Project name */}
      <h3 className="mb-1 truncate text-sm font-semibold text-foreground group-hover:text-primary">
        {project.name}
      </h3>

      {/* Department tag */}
      {project.department && (
        <div className="mb-3 flex items-center gap-1.5">
          {project.department.color && (
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: project.department.color }}
            />
          )}
          <span className="text-xs text-muted-foreground">
            {project.department.name}
          </span>
        </div>
      )}

      {/* Progress ring + stats */}
      <div className="mb-3 flex items-center gap-4">
        <div className="relative h-16 w-16 flex-shrink-0">
          <svg
            className="h-16 w-16 -rotate-90"
            viewBox="0 0 64 64"
            fill="none"
          >
            <circle
              cx="32"
              cy="32"
              r={radius}
              stroke="var(--border)"
              strokeWidth="4"
              fill="none"
            />
            <circle
              cx="32"
              cy="32"
              r={radius}
              stroke={status.text}
              strokeWidth="4"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">
            {pct}%
          </span>
        </div>

        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            <span>{done} done</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3 text-blue-500" />
            <span>{total - done} remaining</span>
          </div>
          {(project.taskStatusCounts?.["BLOCKED"] || 0) > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <AlertTriangle className="h-3 w-3 text-red-500" />
              <span className="text-red-400">
                {project.taskStatusCounts?.["BLOCKED"]} blocked
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      {total > 0 && (
        <div className="mb-3 flex h-1.5 overflow-hidden rounded-full bg-border">
          {statusSegments.map((seg) => (
            <div
              key={seg.status}
              className="h-full transition-all"
              style={{ width: `${seg.pct}%`, backgroundColor: seg.color }}
              title={`${seg.label}: ${seg.count}`}
            />
          ))}
        </div>
      )}

      {/* Footer: avatars + task count */}
      <div className="flex items-center justify-between">
        <div className="flex -space-x-1.5">
          {uniqueAvatars.slice(0, 4).map((user) => (
            <div
              key={user.id}
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-secondary text-[10px] font-medium text-foreground"
              title={user.name || user.email}
            >
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt=""
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                (user.name || user.email || "?").charAt(0).toUpperCase()
              )}
            </div>
          ))}
          {uniqueAvatars.length > 4 && (
            <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] text-muted-foreground">
              +{uniqueAvatars.length - 4}
            </div>
          )}
        </div>

        <span className="text-xs text-muted-foreground">
          {total} task{total !== 1 ? "s" : ""}
        </span>
      </div>
    </button>
  );
}
