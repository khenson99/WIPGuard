import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Gauge,
  Megaphone,
  Landmark,
  Target,
  HeartHandshake,
  Bot,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  ANALYTICS_PRIMARY_SECTIONS,
  getAnalyticsSecondaryForPrimary,
  type AnalyticsPrimarySectionId,
} from "@/lib/analytics/section-registry";

export interface NavChildItem {
  id: string;
  href: string;
  label: string;
  dataDomain: string;
}

export interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
  children?: NavChildItem[];
}

const ANALYTICS_ICONS: Record<AnalyticsPrimarySectionId, LucideIcon> = {
  "ads-traffic": Megaphone,
  finance: Landmark,
  "sales-pipeline": Target,
  "customer-success": HeartHandshake,
};

export function buildNavItems(): NavItem[] {
  const topStatic: NavItem[] = [
    { id: "dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "projects", href: "/projects", label: "Projects", icon: FolderKanban },
    { id: "tasks", href: "/tasks", label: "Tasks", icon: CheckSquare },
    { id: "whip", href: "/whip", label: "Whip View", icon: Gauge },
  ];

  const analyticsGroups: NavItem[] = ANALYTICS_PRIMARY_SECTIONS.map((section) => {
    const subs = getAnalyticsSecondaryForPrimary(section.id);
    return {
      id: section.id,
      href: section.path,
      label: section.label,
      icon: ANALYTICS_ICONS[section.id],
      children: subs.map((sub) => ({
        id: sub.id,
        href: sub.path,
        label: sub.label,
        dataDomain: sub.dataDomain,
      })),
    };
  });

  const bottomStatic: NavItem[] = [
    { id: "standup", href: "/today", label: "Standup Hub", icon: Users },
    { id: "automations", href: "/automations", label: "Automations", icon: Bot },
  ];

  return [...topStatic, ...analyticsGroups, ...bottomStatic];
}
