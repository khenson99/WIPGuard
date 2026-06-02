export type ImladrisProviderKey =
  | "hubspot"
  | "stripe"
  | "pylon"
  | "posthog"
  | "linear"
  | "slack"
  | "googleWorkspace"
  | "github"
  | "googleAnalytics"
  | "googleSearchConsole"
  | "googleAds"
  | "metaAds"
  | "reddit"
  | "semrush"
  | "coda"
  | "webflow"
  | "unify"
  | "mercury";

export type ImladrisDepartment =
  | "finance"
  | "development"
  | "marketing"
  | "sales"
  | "customer-success";

export type ImladrisDashboardId = "operating" | ImladrisDepartment;

export interface ImladrisProviderDefinition {
  key: ImladrisProviderKey;
  label: string;
  snapshotKeys: string[];
  providerAliases: string[];
  freshnessSlaHours: number;
  historicalLookbackMonths: number;
}

export interface ImladrisMetricDefinition {
  key: string;
  label: string;
  department: ImladrisDepartment | "operating";
  unit: "currency" | "count" | "days" | "months" | "percent" | "score" | "ratio";
  sourceKeys: ImladrisProviderKey[];
  description: string;
}

export interface ImladrisDashboardDefinition {
  id: ImladrisDashboardId;
  label: string;
  sourceKeys: ImladrisProviderKey[];
  metricKeys: string[];
}

const DEFAULT_PROVIDER_POLICY = {
  freshnessSlaHours: 24,
  historicalLookbackMonths: 13,
} as const;

export const REQUIRED_IMLADRIS_PROVIDERS: ImladrisProviderDefinition[] = [
  {
    key: "hubspot",
    label: "HubSpot",
    snapshotKeys: ["hubspot", "hubspotOps", "salesPerformance"],
    providerAliases: ["HUBSPOT"],
    ...DEFAULT_PROVIDER_POLICY,
  },
  {
    key: "stripe",
    label: "Stripe",
    snapshotKeys: ["stripe"],
    providerAliases: ["STRIPE"],
    ...DEFAULT_PROVIDER_POLICY,
  },
  {
    key: "pylon",
    label: "Pylon",
    snapshotKeys: ["pylon"],
    providerAliases: ["PYLON"],
    ...DEFAULT_PROVIDER_POLICY,
  },
  {
    key: "posthog",
    label: "PostHog",
    snapshotKeys: ["posthog"],
    providerAliases: ["POSTHOG"],
    ...DEFAULT_PROVIDER_POLICY,
  },
  {
    key: "linear",
    label: "Linear",
    snapshotKeys: ["linear"],
    providerAliases: ["LINEAR"],
    ...DEFAULT_PROVIDER_POLICY,
  },
  {
    key: "slack",
    label: "Slack",
    snapshotKeys: ["slack"],
    providerAliases: ["SLACK"],
    ...DEFAULT_PROVIDER_POLICY,
  },
  {
    key: "googleWorkspace",
    label: "Google Workspace",
    snapshotKeys: ["googleWorkspace"],
    providerAliases: ["GOOGLE_WORKSPACE"],
    ...DEFAULT_PROVIDER_POLICY,
  },
  {
    key: "github",
    label: "GitHub",
    snapshotKeys: ["github"],
    providerAliases: ["GITHUB"],
    ...DEFAULT_PROVIDER_POLICY,
  },
  {
    key: "googleAnalytics",
    label: "Google Analytics",
    snapshotKeys: ["googleAnalytics"],
    providerAliases: ["GOOGLE_ANALYTICS"],
    ...DEFAULT_PROVIDER_POLICY,
  },
  {
    key: "googleSearchConsole",
    label: "Google Search Console",
    snapshotKeys: ["googleSearchConsole", "searchConsole"],
    providerAliases: ["GOOGLE_SEARCH_CONSOLE"],
    ...DEFAULT_PROVIDER_POLICY,
  },
  {
    key: "googleAds",
    label: "Google Ads",
    snapshotKeys: ["googleAds"],
    providerAliases: ["GOOGLE_ADS"],
    ...DEFAULT_PROVIDER_POLICY,
  },
  {
    key: "metaAds",
    label: "Meta Ads",
    snapshotKeys: ["metaAds", "metaPage", "instagram"],
    providerAliases: ["META_ADS", "META_PAGE"],
    ...DEFAULT_PROVIDER_POLICY,
  },
  {
    key: "reddit",
    label: "Reddit Ads",
    snapshotKeys: ["redditAds", "redditOps"],
    providerAliases: ["REDDIT"],
    ...DEFAULT_PROVIDER_POLICY,
  },
  {
    key: "semrush",
    label: "SEMrush",
    snapshotKeys: ["semrush"],
    providerAliases: ["SEMRUSH"],
    ...DEFAULT_PROVIDER_POLICY,
  },
  {
    key: "coda",
    label: "Coda",
    snapshotKeys: ["coda", "codaOps"],
    providerAliases: ["CODA"],
    ...DEFAULT_PROVIDER_POLICY,
  },
  {
    key: "webflow",
    label: "Webflow",
    snapshotKeys: ["webflow"],
    providerAliases: ["WEBFLOW"],
    ...DEFAULT_PROVIDER_POLICY,
  },
  {
    key: "unify",
    label: "Unify",
    snapshotKeys: ["unify", "visitorFunnel"],
    providerAliases: ["UNIFY"],
    ...DEFAULT_PROVIDER_POLICY,
  },
  {
    key: "mercury",
    label: "Mercury",
    snapshotKeys: ["mercury"],
    providerAliases: ["MERCURY"],
    ...DEFAULT_PROVIDER_POLICY,
  },
];

export const CANONICAL_DEPARTMENTS: ImladrisDepartment[] = [
  "finance",
  "development",
  "marketing",
  "sales",
  "customer-success",
];

export const IMLADRIS_METRIC_DEFINITIONS: ImladrisMetricDefinition[] = [
  {
    key: "finance.cash_runway_months",
    label: "Cash Runway",
    department: "finance",
    unit: "months",
    sourceKeys: ["mercury", "stripe"],
    description: "Estimated months of runway from canonical cash and burn facts.",
  },
  {
    key: "finance.net_burn",
    label: "Net Burn",
    department: "finance",
    unit: "currency",
    sourceKeys: ["mercury", "stripe"],
    description: "Trailing operating cash burn from bank and revenue systems.",
  },
  {
    key: "revenue.mrr",
    label: "MRR",
    department: "finance",
    unit: "currency",
    sourceKeys: ["stripe", "hubspot"],
    description: "Monthly recurring revenue from billing plus CRM subscription evidence.",
  },
  {
    key: "sales.qualified_pipeline",
    label: "Qualified Pipeline",
    department: "sales",
    unit: "currency",
    sourceKeys: ["hubspot", "googleWorkspace", "slack"],
    description: "Qualified open sales pipeline with collaboration evidence.",
  },
  {
    key: "marketing.pipeline_efficiency",
    label: "Pipeline Efficiency",
    department: "marketing",
    unit: "ratio",
    sourceKeys: [
      "googleAnalytics",
      "googleSearchConsole",
      "googleAds",
      "metaAds",
      "reddit",
      "semrush",
      "coda",
      "webflow",
      "unify",
      "hubspot",
    ],
    description: "Qualified pipeline generated per acquisition dollar and source signal.",
  },
  {
    key: "development.delivery_health",
    label: "Development Delivery Health",
    department: "development",
    unit: "score",
    sourceKeys: ["linear", "github", "posthog"],
    description: "Engineering delivery health from issue flow, code activity, and product telemetry.",
  },
  {
    key: "product.activation_rate",
    label: "Activation Rate",
    department: "development",
    unit: "percent",
    sourceKeys: ["posthog", "hubspot"],
    description: "New-account activation from product events and CRM lifecycle context.",
  },
  {
    key: "customer_success.retention_risk",
    label: "Retention Risk",
    department: "customer-success",
    unit: "score",
    sourceKeys: ["pylon", "posthog", "slack", "googleWorkspace", "stripe"],
    description: "Account retention risk from support, usage, collaboration, and billing signals.",
  },
];

export const IMLADRIS_DASHBOARDS: ImladrisDashboardDefinition[] = [
  {
    id: "operating",
    label: "Operating Dashboard",
    sourceKeys: REQUIRED_IMLADRIS_PROVIDERS.map((provider) => provider.key),
    metricKeys: [
      "finance.cash_runway_months",
      "finance.net_burn",
      "revenue.mrr",
      "sales.qualified_pipeline",
      "marketing.pipeline_efficiency",
      "development.delivery_health",
      "product.activation_rate",
      "customer_success.retention_risk",
    ],
  },
  {
    id: "finance",
    label: "Finance",
    sourceKeys: ["mercury", "stripe", "hubspot"],
    metricKeys: ["finance.cash_runway_months", "finance.net_burn", "revenue.mrr"],
  },
  {
    id: "development",
    label: "Development",
    sourceKeys: ["linear", "github", "posthog"],
    metricKeys: ["development.delivery_health", "product.activation_rate"],
  },
  {
    id: "marketing",
    label: "Marketing",
    sourceKeys: [
      "googleAnalytics",
      "googleSearchConsole",
      "googleAds",
      "metaAds",
      "reddit",
      "semrush",
      "coda",
      "webflow",
      "unify",
      "hubspot",
    ],
    metricKeys: ["marketing.pipeline_efficiency"],
  },
  {
    id: "sales",
    label: "Sales",
    sourceKeys: ["hubspot", "googleWorkspace", "slack", "stripe"],
    metricKeys: ["sales.qualified_pipeline", "revenue.mrr"],
  },
  {
    id: "customer-success",
    label: "Customer Success",
    sourceKeys: ["pylon", "posthog", "slack", "googleWorkspace", "stripe"],
    metricKeys: ["customer_success.retention_risk", "product.activation_rate"],
  },
];

export function getImladrisDashboardDefinition(
  id: string,
): ImladrisDashboardDefinition | null {
  return IMLADRIS_DASHBOARDS.find((dashboard) => dashboard.id === id) ?? null;
}

export function getImladrisMetricDefinition(key: string): ImladrisMetricDefinition | null {
  return IMLADRIS_METRIC_DEFINITIONS.find((metric) => metric.key === key) ?? null;
}

export function getImladrisProviderDefinitionByAlias(
  alias: string,
): ImladrisProviderDefinition | null {
  return (
    REQUIRED_IMLADRIS_PROVIDERS.find((provider) =>
      provider.providerAliases.includes(alias),
    ) ?? null
  );
}
