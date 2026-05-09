export type AnalyticsPrimarySectionId =
  | "website-traffic"
  | "social-media"
  | "finance"
  | "sales-pipeline"
  | "retention"
  | "customer-success"
  | "customer-journey"
  | "demo-analytics"
  | "process-analytics";

export type FinanceDataDomain =
  | "financePlanning"
  | "financeForecast"
  | "financePnl"
  | "financeUnitEconomics"
  | "financeMonthlyHistory"
  | "financeAiBrief";

export interface AnalyticsPrimarySection {
  id: AnalyticsPrimarySectionId;
  label: string;
  path: string;
  description: string;
}

export interface AnalyticsDashboardFunnelGroup {
  id: string;
  label: string;
  path: string;
  description: string;
  primaryIds: AnalyticsPrimarySectionId[];
}

export interface AnalyticsSubSection {
  id: string;
  label: string;
  path: string;
  parentId: AnalyticsPrimarySectionId;
  dataDomain:
    | "googleWorkspace"
    | "hubspot"
    | "salesPerformance"
    | "stripe"
    | "mercury"
    | "slack"
    | "googleAnalytics"
    | "googleAds"
    | "metaAds"
    | "metaPage"
    | "redditAds"
    | "webflow"
    | "coda"
    | "semrush"
    | "pylon"
    | "product"
    | "customerJourney"
    | "visitorFunnel"
    | "demoAnalytics"
    | "processAnalytics"
    | "financePlanning"
    | "financeForecast"
    | "financePnl"
    | "financeUnitEconomics"
    | "financeMonthlyHistory"
    | "financeAiBrief";
}

export const ANALYTICS_PRIMARY_SECTIONS: AnalyticsPrimarySection[] = [
  {
    id: "social-media",
    label: "Social Media, Ads & Conferences",
    path: "/analytics/social-media",
    description: "Top-of-funnel demand from paid, organic, and event-driven campaigns.",
  },
  {
    id: "website-traffic",
    label: "Website Conversion",
    path: "/analytics/website-traffic",
    description: "Traffic quality, content performance, and onsite conversion.",
  },
  {
    id: "sales-pipeline",
    label: "Sales",
    path: "/analytics/sales-pipeline",
    description: "Pipeline progression and close performance.",
  },
  {
    id: "customer-success",
    label: "Customer Success",
    path: "/analytics/customer-success",
    description: "Post-sale support and product adoption.",
  },
  {
    id: "retention",
    label: "Retention",
    path: "/analytics/retention",
    description: "Tenant-level leading indicators of retention and contraction risk.",
  },
  {
    id: "customer-journey",
    label: "Full-Funnel Analytics",
    path: "/analytics/customer-journey",
    description: "End-to-end analytics across acquisition, conversion, sales, success, and retention.",
  },
  {
    id: "demo-analytics",
    label: "Demo Analytics",
    path: "/analytics/demo-analytics",
    description: "Demo scheduling, attendance, and conversion.",
  },
  {
    id: "process-analytics",
    label: "Process Analytics",
    path: "/analytics/process-analytics",
    description: "Pipeline velocity, health, and bottlenecks.",
  },
  {
    id: "finance",
    label: "Revenue & Finance",
    path: "/analytics/finance",
    description: "Revenue, balance, and cash health.",
  },
];

export const ANALYTICS_DASHBOARD_FUNNEL_GROUPS: AnalyticsDashboardFunnelGroup[] = [
  {
    id: "top-of-funnel",
    label: "Social Media, Ads & Conferences",
    path: "/analytics/social-media",
    description: "Demand generation before prospects reach the website.",
    primaryIds: ["social-media"],
  },
  {
    id: "website-conversion",
    label: "Website Conversion",
    path: "/analytics/website-traffic",
    description: "Traffic, page performance, forms, search, and conversion intent.",
    primaryIds: ["website-traffic"],
  },
  {
    id: "sales",
    label: "Sales",
    path: "/analytics/sales-pipeline",
    description: "Opportunities, demo scheduling, demo follow-up, pipeline movement, and close rates.",
    primaryIds: ["sales-pipeline", "demo-analytics"],
  },
  {
    id: "customer-success",
    label: "Customer Success",
    path: "/analytics/customer-success",
    description: "Support load, adoption signals, and account health after close.",
    primaryIds: ["customer-success"],
  },
  {
    id: "retention",
    label: "Retention",
    path: "/analytics/retention",
    description: "Renewal risk, contraction signals, and tenant retention health.",
    primaryIds: ["retention"],
  },
  {
    id: "full-funnel-analytics",
    label: "Full-Funnel Analytics",
    path: "/analytics/customer-journey",
    description: "Analytics across the entire process, including journey, process, and revenue signals.",
    primaryIds: ["customer-journey", "process-analytics", "finance"],
  },
];

export const ANALYTICS_SUB_SECTIONS: AnalyticsSubSection[] = [
  { id: "ads-google-analytics", label: "Google Analytics", path: "/analytics/ads-google-analytics", parentId: "website-traffic", dataDomain: "googleAnalytics" },
  { id: "ads-google-ads", label: "Google Ads", path: "/analytics/ads-google-ads", parentId: "social-media", dataDomain: "googleAds" },
  { id: "ads-meta-ads", label: "Meta Ads", path: "/analytics/ads-meta-ads", parentId: "social-media", dataDomain: "metaAds" },
  { id: "ads-reddit-ads", label: "Reddit Ads", path: "/analytics/ads-reddit-ads", parentId: "social-media", dataDomain: "redditAds" },
  { id: "ads-webflow", label: "Webflow", path: "/analytics/ads-webflow", parentId: "website-traffic", dataDomain: "webflow" },
  { id: "ads-semrush", label: "SEMrush", path: "/analytics/ads-semrush", parentId: "website-traffic", dataDomain: "semrush" },
  { id: "ads-coda-kanban", label: "Campaigns & Conferences", path: "/analytics/ads-coda-kanban", parentId: "social-media", dataDomain: "coda" },

  { id: "finance-mercury", label: "Mercury", path: "/analytics/finance-mercury", parentId: "finance", dataDomain: "mercury" },
  { id: "finance-stripe", label: "Stripe", path: "/analytics/finance-stripe", parentId: "finance", dataDomain: "stripe" },
  { id: "finance-hubspot", label: "HubSpot", path: "/analytics/finance-hubspot", parentId: "finance", dataDomain: "hubspot" },
  { id: "finance-planning", label: "Budget & Goals", path: "/analytics/finance-planning", parentId: "finance", dataDomain: "financePlanning" },
  { id: "finance-forecast", label: "Forecasts", path: "/analytics/finance-forecast", parentId: "finance", dataDomain: "financeForecast" },
  { id: "finance-pnl", label: "P&L", path: "/analytics/finance-pnl", parentId: "finance", dataDomain: "financePnl" },
  { id: "finance-unit-economics", label: "Unit Economics", path: "/analytics/finance-unit-economics", parentId: "finance", dataDomain: "financeUnitEconomics" },
  { id: "finance-monthly-history", label: "Monthly History", path: "/analytics/finance-monthly-history", parentId: "finance", dataDomain: "financeMonthlyHistory" },
  { id: "finance-ai-brief", label: "AI Executive Brief", path: "/analytics/finance-ai-brief", parentId: "finance", dataDomain: "financeAiBrief" },

  { id: "sales-hubspot", label: "HubSpot", path: "/analytics/sales-hubspot", parentId: "sales-pipeline", dataDomain: "hubspot" },
  { id: "sales-stripe", label: "Stripe", path: "/analytics/sales-stripe", parentId: "sales-pipeline", dataDomain: "stripe" },
  { id: "sales-performance", label: "Performance Pack", path: "/analytics/sales-performance", parentId: "sales-pipeline", dataDomain: "salesPerformance" },
  { id: "sales-google-workspace", label: "Google Workspace", path: "/analytics/sales-google-workspace", parentId: "sales-pipeline", dataDomain: "googleWorkspace" },
  { id: "sales-slack", label: "Slack", path: "/analytics/sales-slack", parentId: "sales-pipeline", dataDomain: "slack" },

  { id: "cs-pylon", label: "Pylon", path: "/analytics/cs-pylon", parentId: "customer-success", dataDomain: "pylon" },
  { id: "cs-google-workspace", label: "Google Workspace", path: "/analytics/cs-google-workspace", parentId: "customer-success", dataDomain: "googleWorkspace" },
  { id: "cs-slack", label: "Slack", path: "/analytics/cs-slack", parentId: "customer-success", dataDomain: "slack" },

  { id: "cj-overview", label: "Journey Overview", path: "/analytics/cj-overview", parentId: "customer-journey", dataDomain: "customerJourney" },
  { id: "cj-touchpoints", label: "Touchpoints", path: "/analytics/cj-touchpoints", parentId: "customer-journey", dataDomain: "customerJourney" },
  { id: "cj-conversion", label: "Conversion Analysis", path: "/analytics/cj-conversion", parentId: "customer-journey", dataDomain: "customerJourney" },
  { id: "cj-acquisition-funnel", label: "Acquisition Funnel", path: "/analytics/cj-acquisition-funnel", parentId: "customer-journey", dataDomain: "visitorFunnel" },

  { id: "demo-scheduling", label: "Demo Scheduling", path: "/analytics/demo-scheduling", parentId: "sales-pipeline", dataDomain: "demoAnalytics" },
  { id: "demo-attribution", label: "Demo Attribution", path: "/analytics/demo-attribution", parentId: "sales-pipeline", dataDomain: "demoAnalytics" },
  { id: "demo-coaching", label: "Demo Coaching", path: "/analytics/demo-coaching", parentId: "sales-pipeline", dataDomain: "demoAnalytics" },

  { id: "process-bottlenecks", label: "Bottlenecks", path: "/analytics/process-bottlenecks", parentId: "process-analytics", dataDomain: "processAnalytics" },
  { id: "process-velocity", label: "Velocity", path: "/analytics/process-velocity", parentId: "process-analytics", dataDomain: "processAnalytics" },
  { id: "process-health", label: "Health", path: "/analytics/process-health", parentId: "process-analytics", dataDomain: "processAnalytics" },
  { id: "process-throughput", label: "Throughput", path: "/analytics/process-throughput", parentId: "process-analytics", dataDomain: "processAnalytics" },
];

export function getAnalyticsPrimarySectionById(id: string): AnalyticsPrimarySection | null {
  return ANALYTICS_PRIMARY_SECTIONS.find((section) => section.id === id) ?? null;
}

export function getAnalyticsSubSectionById(id: string): AnalyticsSubSection | null {
  return ANALYTICS_SUB_SECTIONS.find((section) => section.id === id) ?? null;
}

export function getAnalyticsPrimaryForSection(id: string): AnalyticsPrimarySection | null {
  const primary = getAnalyticsPrimarySectionById(id);
  if (primary) return primary;
  const child = getAnalyticsSubSectionById(id);
  if (!child) return null;
  return getAnalyticsPrimarySectionById(child.parentId);
}

export function getAnalyticsSecondaryForPrimary(
  primaryId: AnalyticsPrimarySectionId
): AnalyticsSubSection[] {
  return ANALYTICS_SUB_SECTIONS.filter((section) => section.parentId === primaryId);
}

export const LEGACY_ANALYTICS_TAB_REDIRECTS: Record<string, string> = {
  overview: "/analytics",
  sales: "/analytics/sales-pipeline",
  finance: "/analytics/finance",
  marketing: "/analytics/website-traffic",
  tasks: "/analytics/customer-success",
  journey: "/analytics/customer-journey",
  demos: "/analytics/demo-analytics",
  process: "/analytics/process-analytics",
};

export const LEGACY_ANALYTICS_ROUTE_REDIRECTS: Record<string, string> = {
  overview: "/analytics",
  sales: "/analytics/sales-pipeline",
  finance: "/analytics/finance",
  marketing: "/analytics/website-traffic",
  "ads-traffic": "/analytics/website-traffic",
  tasks: "/analytics/customer-success",
  hubspot: "/analytics/sales-hubspot",
  stripe: "/analytics/finance-stripe",
  mercury: "/analytics/finance-mercury",
  "google-analytics": "/analytics/ads-google-analytics",
  "google-ads": "/analytics/ads-google-ads",
  "meta-ads": "/analytics/ads-meta-ads",
  "meta-page": "/analytics/ads-meta-ads",
  "reddit-ads": "/analytics/ads-reddit-ads",
  webflow: "/analytics/ads-webflow",
  coda: "/analytics/ads-coda-kanban",
  "google-workspace": "/analytics/sales-google-workspace",
  slack: "/analytics/sales-slack",
  semrush: "/analytics/ads-semrush",
  "decision-dashboard": "/analytics/customer-success",
  "flow-metrics": "/analytics/customer-success",
  "flow-risk": "/analytics/customer-success",
  observability: "/analytics/customer-success",
  "cs-decision-dashboard": "/analytics/customer-success",
  "cs-flow-metrics": "/analytics/customer-success",
  "cs-flow-risk": "/analytics/customer-success",
  "cs-observability": "/analytics/customer-success",
  "customer-journey": "/analytics/customer-journey",
  "demo-analytics": "/analytics/demo-analytics",
  "process-analytics": "/analytics/process-analytics",
  "finance-planning": "/analytics/finance-planning",
  "finance-forecast": "/analytics/finance-forecast",
  "finance-pnl": "/analytics/finance-pnl",
  "finance-unit-economics": "/analytics/finance-unit-economics",
  "finance-monthly-history": "/analytics/finance-monthly-history",
  "finance-ai-brief": "/analytics/finance-ai-brief",
};
