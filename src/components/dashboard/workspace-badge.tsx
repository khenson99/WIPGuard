"use client";

import { clsx } from "clsx";
import { getWorkspaceLabel, type WorkspaceId } from "@/lib/platform/workspaces";

const BADGE_STYLES: Record<WorkspaceId, string> = {
  deals: "bg-emerald-100 text-emerald-800",
  analytics: "bg-sky-100 text-sky-800",
  integrations: "bg-violet-100 text-violet-800",
  automations: "bg-rose-100 text-rose-800",
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
