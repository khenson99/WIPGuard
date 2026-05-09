import {
  ANALYTICS_DASHBOARD_FUNNEL_GROUPS,
  type AnalyticsSubSection,
} from "@/lib/analytics/section-registry";

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
  dataDomain?: AnalyticsSubSection["dataDomain"];
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
        id: "metric-catalog",
        label: "Metric Catalog",
        href: "/metrics",
        workspaceId: "metrics",
      },
      ...ANALYTICS_DASHBOARD_FUNNEL_GROUPS.map((section) => ({
        id: section.id,
        label: section.label,
        href: section.path,
        workspaceId: "metrics" as const,
      })),
      {
        id: "ai-insights",
        label: "AI Insights",
        href: "/analytics/ai-insights",
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
    children: [
      {
        id: "pipeline-center",
        label: "Pipeline Center",
        href: "/pipelines",
        workspaceId: "pipelines",
      },
      {
        id: "pipeline-artifacts",
        label: "Artifacts",
        href: "/pipelines/artifacts",
        workspaceId: "pipelines",
      },
    ],
  },
];

export function getWorkspaceById(id: WorkspaceId): WorkspaceNavItem | null {
  return WORKSPACE_NAV_ITEMS.find((item) => item.id === id) ?? null;
}

export function getWorkspaceLabel(id: WorkspaceId): string {
  return getWorkspaceById(id)?.label ?? id;
}
