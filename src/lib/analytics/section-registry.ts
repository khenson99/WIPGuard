export type AnalyticsPrimarySectionId =
  | "ads-traffic"
  | "finance"
  | "sales-pipeline"
  | "customer-success";

export interface AnalyticsPrimarySection {
  id: AnalyticsPrimarySectionId;
  label: string;
  path: string;
  description: string;
}

export interface AnalyticsSubSection {
  id: string;
  label: string;
  path: string;
  parentId: AnalyticsPrimarySectionId;
  dataDomain:
    | "hubspot"
    | "stripe"
    | "mercury"
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
    | "decisionDashboard"
    | "flowMetrics"
    | "flowRisk"
    | "observability";
}

export const ANALYTICS_PRIMARY_SECTIONS: AnalyticsPrimarySection[] = [
  {
    id: "ads-traffic",
    label: "Ads & Traffic",
    path: "/analytics/ads-traffic",
    description: "Campaigns, traffic, and content performance.",
  },
  {
    id: "finance",
    label: "Finance",
    path: "/analytics/finance",
    description: "Revenue, balance, and cash health.",
  },
  {
    id: "sales-pipeline",
    label: "Sales & Pipeline",
    path: "/analytics/sales-pipeline",
    description: "Pipeline progression and close performance.",
  },
  {
    id: "customer-success",
    label: "Customer Success",
    path: "/analytics/customer-success",
    description: "Post-sale support and product adoption.",
  },
];

export const ANALYTICS_SUB_SECTIONS: AnalyticsSubSection[] = [
  { id: "ads-google-analytics", label: "Google Analytics", path: "/analytics/ads-google-analytics", parentId: "ads-traffic", dataDomain: "googleAnalytics" },
  { id: "ads-google-ads", label: "Google Ads", path: "/analytics/ads-google-ads", parentId: "ads-traffic", dataDomain: "googleAds" },
  { id: "ads-meta-ads", label: "Meta Ads", path: "/analytics/ads-meta-ads", parentId: "ads-traffic", dataDomain: "metaAds" },
  { id: "ads-reddit-ads", label: "Reddit Ads", path: "/analytics/ads-reddit-ads", parentId: "ads-traffic", dataDomain: "redditAds" },
  { id: "ads-webflow", label: "Webflow", path: "/analytics/ads-webflow", parentId: "ads-traffic", dataDomain: "webflow" },
  { id: "ads-semrush", label: "SEMrush", path: "/analytics/ads-semrush", parentId: "ads-traffic", dataDomain: "semrush" },
  { id: "ads-coda-kanban", label: "Free Kanban Creator (Coda)", path: "/analytics/ads-coda-kanban", parentId: "ads-traffic", dataDomain: "coda" },

  { id: "finance-mercury", label: "Mercury", path: "/analytics/finance-mercury", parentId: "finance", dataDomain: "mercury" },
  { id: "finance-stripe", label: "Stripe", path: "/analytics/finance-stripe", parentId: "finance", dataDomain: "stripe" },
  { id: "finance-hubspot", label: "HubSpot", path: "/analytics/finance-hubspot", parentId: "finance", dataDomain: "hubspot" },

  { id: "sales-hubspot", label: "HubSpot", path: "/analytics/sales-hubspot", parentId: "sales-pipeline", dataDomain: "hubspot" },
  { id: "sales-stripe", label: "Stripe", path: "/analytics/sales-stripe", parentId: "sales-pipeline", dataDomain: "stripe" },

  { id: "cs-pylon", label: "Pylon", path: "/analytics/cs-pylon", parentId: "customer-success", dataDomain: "pylon" },
  { id: "cs-coda", label: "Coda", path: "/analytics/cs-coda", parentId: "customer-success", dataDomain: "coda" },
  { id: "cs-product", label: "Product", path: "/analytics/cs-product", parentId: "customer-success", dataDomain: "product" },
  { id: "cs-decision-dashboard", label: "Decision Dashboard", path: "/analytics/cs-decision-dashboard", parentId: "customer-success", dataDomain: "decisionDashboard" },
  { id: "cs-flow-metrics", label: "Flow Metrics", path: "/analytics/cs-flow-metrics", parentId: "customer-success", dataDomain: "flowMetrics" },
  { id: "cs-flow-risk", label: "Flow Risk", path: "/analytics/cs-flow-risk", parentId: "customer-success", dataDomain: "flowRisk" },
  { id: "cs-observability", label: "Observability", path: "/analytics/cs-observability", parentId: "customer-success", dataDomain: "observability" },
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
  marketing: "/analytics/ads-traffic",
  tasks: "/analytics/customer-success",
};

export const LEGACY_ANALYTICS_ROUTE_REDIRECTS: Record<string, string> = {
  overview: "/analytics",
  sales: "/analytics/sales-pipeline",
  finance: "/analytics/finance",
  marketing: "/analytics/ads-traffic",
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
  coda: "/analytics/cs-coda",
  semrush: "/analytics/ads-semrush",
  "decision-dashboard": "/analytics/cs-decision-dashboard",
  "flow-metrics": "/analytics/cs-flow-metrics",
  "flow-risk": "/analytics/cs-flow-risk",
  observability: "/analytics/cs-observability",
};

