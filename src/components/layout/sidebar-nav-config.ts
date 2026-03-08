import {
  LayoutDashboard,
  Handshake,
  Megaphone,
  Landmark,
  Target,
  HeartHandshake,
  Route,
  Presentation,
  Activity,
  Bot,
  Sparkles,
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
  "customer-journey": Route,
  "demo-analytics": Presentation,
  "process-analytics": Activity,
};

export function buildNavItems(): NavItem[] {
  const topStatic: NavItem[] = [
    { id: "dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "deals", href: "/deals", label: "Deals", icon: Handshake },
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
    { id: "ai-insights", href: "/analytics/ai-insights", label: "AI Insights", icon: Sparkles },
  ];

  const bottomStatic: NavItem[] = [
    { id: "automations", href: "/automations", label: "Automations", icon: Bot },
  ];

  return [...topStatic, ...analyticsGroups, ...newPages, ...bottomStatic];
}
