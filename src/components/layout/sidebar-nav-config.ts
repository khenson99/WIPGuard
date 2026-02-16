import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Megaphone,
  Landmark,
  Target,
  HeartHandshake,
  Bot,
  Route,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import {
  ANALYTICS_PRIMARY_SECTIONS,
  getAnalyticsSecondaryForPrimary,
  type AnalyticsPrimarySectionId,
} from "@/lib/analytics/section-registry";

export interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
  children?: NavChildItem[];
}

export interface NavChildItem {
  id: string;
  href: string;
  label: string;
  dataDomain: string;
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

  const newPages: NavItem[] = [
    { id: "customer-journey", href: "/analytics/customer-journey", label: "Customer Journey", icon: Route },
    { id: "ai-insights", href: "/analytics/ai-insights", label: "AI Insights", icon: Sparkles },
  ];

  const bottomStatic: NavItem[] = [
    { id: "automations", href: "/automations", label: "Automations", icon: Bot },
  ];

  return [...topStatic, ...analyticsGroups, ...newPages, ...bottomStatic];
}
