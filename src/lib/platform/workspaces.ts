import {
  ANALYTICS_PRIMARY_SECTIONS,
  type AnalyticsSubSection,
} from "@/lib/analytics/section-registry";

export type WorkspaceId =
  | "dashboard"
  | "deals"
  | "analytics"
  | "integrations"
  | "automations";

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
    id: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    description: "Cross-platform GTM operating view.",
  },
  {
    id: "deals",
    label: "Deals",
    href: "/deals",
    description: "Pipeline execution and revenue context.",
    children: [
      {
        id: "deals-dashboard",
        label: "Pipeline View",
        href: "/deals",
        workspaceId: "deals",
      },
      {
        id: "deals-analytics",
        label: "Deal Analytics",
        href: "/deals/analytics",
        workspaceId: "deals",
      },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    href: "/analytics",
    description: "Performance, customer journey, and operational intelligence.",
    children: [
      ...ANALYTICS_PRIMARY_SECTIONS.map((section) => ({
        id: section.id,
        label: section.label,
        href: section.path,
        workspaceId: "analytics" as const,
      })),
      {
        id: "ai-insights",
        label: "AI Insights",
        href: "/analytics/ai-insights",
        workspaceId: "analytics",
      },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    href: "/integrations",
    description: "Connections, sync health, and provider operations.",
  },
  {
    id: "automations",
    label: "Automations",
    href: "/automations",
    description: "Workflow orchestration, monitoring, and artifacts.",
    children: [
      {
        id: "automations-home",
        label: "Automation Center",
        href: "/automations",
        workspaceId: "automations",
      },
      {
        id: "automations-artifacts",
        label: "Artifacts",
        href: "/automations/artifacts",
        workspaceId: "automations",
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
