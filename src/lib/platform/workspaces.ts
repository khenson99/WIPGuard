export type WorkspaceId =
  | "sources"
  | "goals"
  | "metrics"
  | "reports"
  | "pipelines"
  | "investor";

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
    id: "goals",
    label: "Goals",
    href: "/goals",
    description: "Company goals and progress from Linear projects.",
  },
  {
    id: "metrics",
    label: "Metrics",
    href: "/metrics",
    description: "Canonical metric definitions, computed values, trust, and lineage.",
    children: [
      {
        id: "company-tracker",
        label: "Company Tracker",
        href: "/metrics/company",
        workspaceId: "metrics",
      },
      {
        id: "operating",
        label: "Operating",
        href: "/operating",
        workspaceId: "metrics",
      },
      {
        id: "company-tracker-cockpit",
        label: "Company Tracker (Cockpit)",
        href: "/operating/company",
        workspaceId: "metrics",
      },
      {
        id: "finance",
        label: "Finance",
        href: "/operating/finance",
        workspaceId: "metrics",
      },
      {
        id: "sales",
        label: "Sales",
        href: "/operating/sales",
        workspaceId: "metrics",
      },
      {
        id: "marketing",
        label: "Marketing",
        href: "/operating/marketing",
        workspaceId: "metrics",
      },
      {
        id: "development",
        label: "Development",
        href: "/operating/development",
        workspaceId: "metrics",
      },
      {
        id: "customer-success",
        label: "Customer Success",
        href: "/operating/customer-success",
        workspaceId: "metrics",
      },
      {
        id: "source-health",
        label: "Source Health",
        href: "/operating/sources",
        workspaceId: "metrics",
      },
      {
        id: "customer-health",
        label: "Customer Health",
        href: "/metrics/customer-health",
        workspaceId: "metrics",
      },
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
