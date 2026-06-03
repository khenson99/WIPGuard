export type WorkspaceId =
  | "sources"
  | "metrics"
  | "reports"
  | "pipelines";

export interface WorkspaceNavChildItem {
  id: string;
  label: string;
  href: string;
  workspaceId: WorkspaceId;
}

export interface WorkspaceNavItem {
  id: WorkspaceId;
  label: string;
  href: string;
  description: string;
  children?: WorkspaceNavChildItem[];
}

export const WORKSPACE_NAV_ITEMS: WorkspaceNavItem[] = [
  {
    id: "sources",
    label: "Sources",
    href: "/sources",
    description: "Provider health, sync state, freshness, errors, and source lineage.",
  },
  {
    id: "metrics",
    label: "Metrics",
    href: "/metrics",
    description: "Canonical metric definitions, computed values, trust, and lineage.",
    children: [
      {
        id: "expense-dashboard",
        label: "Expenses",
        href: "/metrics/expenses",
        workspaceId: "metrics",
      },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    href: "/reports",
    description: "Generated report packs, readiness, exports, and trust warnings.",
  },
  {
    id: "pipelines",
    label: "Automation Pipelines",
    href: "/pipelines",
    description: "Ingestion, metric refresh, report generation, approvals, failures, and artifacts.",
  },
];

export function getWorkspaceById(id: WorkspaceId): WorkspaceNavItem | null {
  return WORKSPACE_NAV_ITEMS.find((item) => item.id === id) ?? null;
}

export function getWorkspaceLabel(id: WorkspaceId): string {
  return getWorkspaceById(id)?.label ?? id;
}
