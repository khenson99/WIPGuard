export interface AnalyticsSection {
  id: string;
  label: string;
  kind: "aggregate" | "source" | "ops";
  path: string;
}

export const ANALYTICS_SECTION_REGISTRY: AnalyticsSection[] = [
  { id: "overview", label: "Overview", kind: "aggregate", path: "/analytics/overview" },
  { id: "sales", label: "Sales & Pipeline", kind: "aggregate", path: "/analytics/sales" },
  { id: "finance", label: "Revenue & Finance", kind: "aggregate", path: "/analytics/finance" },
  { id: "marketing", label: "Ads & Traffic", kind: "aggregate", path: "/analytics/marketing" },
  { id: "tasks", label: "Tasks", kind: "aggregate", path: "/analytics/tasks" },
  { id: "hubspot", label: "HubSpot", kind: "source", path: "/analytics/hubspot" },
  { id: "stripe", label: "Stripe", kind: "source", path: "/analytics/stripe" },
  { id: "mercury", label: "Mercury", kind: "source", path: "/analytics/mercury" },
  { id: "google-analytics", label: "Google Analytics", kind: "source", path: "/analytics/google-analytics" },
  { id: "google-ads", label: "Google Ads", kind: "source", path: "/analytics/google-ads" },
  { id: "meta-ads", label: "Meta Ads", kind: "source", path: "/analytics/meta-ads" },
  { id: "meta-page", label: "Meta Page", kind: "source", path: "/analytics/meta-page" },
  { id: "reddit-ads", label: "Reddit Ads", kind: "source", path: "/analytics/reddit-ads" },
  { id: "webflow", label: "Webflow", kind: "source", path: "/analytics/webflow" },
  { id: "coda", label: "Coda", kind: "source", path: "/analytics/coda" },
  { id: "semrush", label: "Semrush", kind: "source", path: "/analytics/semrush" },
  { id: "decision-dashboard", label: "Decision Dashboard", kind: "aggregate", path: "/analytics/decision-dashboard" },
  { id: "flow-metrics", label: "Flow Metrics", kind: "aggregate", path: "/analytics/flow-metrics" },
  { id: "flow-risk", label: "Flow Risk", kind: "aggregate", path: "/analytics/flow-risk" },
  { id: "observability", label: "Observability", kind: "ops", path: "/analytics/observability" },
];

export function getAnalyticsSectionById(id: string): AnalyticsSection | null {
  return ANALYTICS_SECTION_REGISTRY.find((section) => section.id === id) ?? null;
}

export const LEGACY_ANALYTICS_TAB_REDIRECTS: Record<string, string> = {
  overview: "/analytics/overview",
  sales: "/analytics/sales",
  finance: "/analytics/finance",
  marketing: "/analytics/marketing",
  tasks: "/analytics/tasks",
};
