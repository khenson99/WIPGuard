import { BarChart3, Cable, FileText, Target, Workflow, type LucideIcon } from "lucide-react";
import { WORKSPACE_NAV_ITEMS, type WorkspaceId } from "@/lib/platform/workspaces";

export interface NavChildItem {
  id: string;
  href: string;
  label: string;
  workspaceId: WorkspaceId;
  dataDomain?: string;
}

export interface NavItem {
  id: WorkspaceId;
  href: string;
  label: string;
  workspaceId: WorkspaceId;
  icon: LucideIcon;
  children?: NavChildItem[];
}

const WORKSPACE_ICONS: Record<WorkspaceId, LucideIcon> = {
  sources: Cable,
  goals: Target,
  metrics: BarChart3,
  reports: FileText,
  pipelines: Workflow,
  investor: FileText,
};

export function buildNavItems(role?: string | null): NavItem[] {
  if (role?.trim().toLowerCase() === "investor") {
    return [
      {
        id: "investor",
        href: "/investor",
        label: "Investor",
        workspaceId: "investor",
        icon: WORKSPACE_ICONS.investor,
      },
    ];
  }

  return WORKSPACE_NAV_ITEMS.map((item) => ({
    id: item.id,
    href: item.href,
    label: item.label,
    workspaceId: item.id,
    icon: WORKSPACE_ICONS[item.id],
    children: item.children?.map((child) => ({
      id: child.id,
      href: child.href,
      label: child.label,
      workspaceId: child.workspaceId,
    })),
  }));
}
