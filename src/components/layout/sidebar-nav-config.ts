import {
  Activity,
  Bot,
  Cable,
  Handshake,
  type LucideIcon,
} from "lucide-react";
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
  analytics: Activity,
  integrations: Cable,
  deals: Handshake,
  automations: Bot,
};

export function buildNavItems(): NavItem[] {
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
      dataDomain: child.dataDomain,
    })),
  }));
}
