"use client";

import { clsx } from "clsx";
import { getWorkspaceLabel, type WorkspaceId } from "@/lib/platform/workspaces";

const BADGE_STYLES: Record<WorkspaceId, string> = {
  sources: "bg-violet-100 text-violet-800",
  metrics: "bg-sky-100 text-sky-800",
  reports: "bg-emerald-100 text-emerald-800",
  pipelines: "bg-rose-100 text-rose-800",
};

export function WorkspaceBadge({ workspaceId }: { workspaceId: WorkspaceId }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em]",
        BADGE_STYLES[workspaceId],
      )}
    >
      {getWorkspaceLabel(workspaceId)}
    </span>
  );
}
