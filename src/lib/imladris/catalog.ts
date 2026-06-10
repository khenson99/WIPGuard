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

export type ImladrisDashboardId = "operating" | "company" | ImladrisDepartment;

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

/**
 * A metric computed deterministically from other canonical metrics rather than
 * materialized from raw provider records. Derived metrics never have their own
 * `imladrisCanonicalMetricValue` rows; the service layer computes them on read
 * and degrades their status/confidence from the input metrics.
 */
export interface ImladrisDerivedMetricDefinition {
  key: string;
  label: string;
  department: ImladrisDepartment | "operating";
  unit: ImladrisMetricDefinition["unit"];
  /** Canonical metric keys this metric is calculated from. */
  inputs: string[];
  /** Human-readable deterministic formula, shown alongside the value. */
  formula: string;
  description: string;
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
    snapshotKeys: ["posthog", "product"],
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
    key: "finance.cash_balance",
    label: "Cash Balance",
    department: "finance",
    unit: "currency",
    sourceKeys: ["mercury"],
    description: "Current available cash across bank and treasury accounts.",
  },
  {
    key: "finance.expenses",
    label: "Expenses",
    department: "finance",
    unit: "currency",
    sourceKeys: ["mercury", "stripe"],
    description: "Operating expenses from banking, card, and billing records.",
  },
  {
    key: "finance.gross_margin",
    label: "Gross Margin",
    department: "finance",
    unit: "percent",
    sourceKeys: ["stripe", "mercury"],
    description: "Revenue margin after cost of goods sold and service delivery costs.",
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
    key: "revenue.arr",
    label: "ARR",
    department: "finance",
    unit: "currency",
    sourceKeys: ["stripe", "hubspot"],
    description: "Annualized recurring revenue from subscription billing and CRM contract evidence.",
  },
  {
    key: "revenue.total_revenue",
    label: "Revenue",
    department: "finance",
    unit: "currency",
    sourceKeys: ["stripe", "hubspot"],
    description: "Total recognized revenue across recurring subscriptions and services revenue.",
  },
  {
    key: "revenue.subscription_revenue",
    label: "Subscription Revenue",
    department: "finance",
    unit: "currency",
    sourceKeys: ["stripe", "hubspot"],
    description: "Recurring subscription revenue separated from services and one-time revenue.",
  },
  {
    key: "revenue.services_revenue",
    label: "Services Revenue",
    department: "finance",
    unit: "currency",
    sourceKeys: ["stripe", "hubspot"],
    description: "Implementation, support, professional services, and other non-recurring services revenue.",
  },
  {
    key: "revenue.active_subscriptions",
    label: "Active Subscriptions",
    department: "finance",
    unit: "count",
    sourceKeys: ["stripe", "hubspot"],
    description: "Active paying subscriptions from billing and CRM subscription objects.",
  },
  {
    key: "revenue.customer_count",
    label: "Customers",
    department: "finance",
    unit: "count",
    sourceKeys: ["stripe", "hubspot"],
    description: "Active customer count from billing accounts and CRM company records.",
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
    key: "sales.demos",
    label: "Demos",
    department: "sales",
    unit: "count",
    sourceKeys: ["hubspot", "googleWorkspace", "webflow"],
    description: "Demo volume from CRM deals, calendar meetings, and website demo requests.",
  },
  {
    key: "marketing.website_traffic",
    label: "Website Traffic",
    department: "marketing",
    unit: "count",
    sourceKeys: ["googleAnalytics", "googleSearchConsole", "semrush", "webflow", "posthog"],
    description: "Website sessions, search traffic, and product-site visit evidence.",
  },
  {
    key: "marketing.conversion_rate",
    label: "Conversion Rate",
    department: "marketing",
    unit: "percent",
    sourceKeys: ["googleAnalytics", "webflow", "unify", "hubspot", "posthog"],
    description: "Visitor-to-lead, visitor-to-demo, or lead conversion rate from acquisition and CRM evidence.",
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
    key: "customer_success.customer_health",
    label: "Customer Health",
    department: "customer-success",
    unit: "score",
    sourceKeys: ["pylon", "posthog", "slack", "googleWorkspace", "stripe"],
    description: "Composite customer health from support, usage, collaboration, and billing signals.",
  },
  {
    key: "customer_success.customer_activity",
    label: "Customer Activity",
    department: "customer-success",
    unit: "count",
    sourceKeys: ["posthog", "pylon", "slack", "googleWorkspace"],
    description: "Recent customer product, support, and collaboration activity volume.",
  },
  {
    key: "customer_success.churn_rate",
    label: "Churn Rate",
    department: "customer-success",
    unit: "percent",
    sourceKeys: ["stripe", "hubspot", "pylon"],
    description: "Logo or revenue churn rate from billing, CRM lifecycle, and support signals.",
  },
  {
    key: "customer_success.retention_rate",
    label: "Retention Rate",
    department: "customer-success",
    unit: "percent",
    sourceKeys: ["stripe", "hubspot", "posthog"],
    description: "Customer retention rate from billing status, CRM lifecycle, and product usage.",
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

export const IMLADRIS_DERIVED_CALCULATION_VERSION = "derived.v1";

export const IMLADRIS_DERIVED_METRIC_DEFINITIONS: ImladrisDerivedMetricDefinition[] = [
  {
    key: "revenue.net_new_arr",
    label: "Net New ARR",
    department: "finance",
    unit: "currency",
    inputs: ["revenue.arr"],
    formula: "ARR(current period) − ARR(previous period)",
    description: "ARR added or lost versus the prior month — the raw output of the growth engine.",
  },
  {
    key: "revenue.arr_growth_rate",
    label: "ARR Growth Rate",
    department: "finance",
    unit: "percent",
    inputs: ["revenue.arr"],
    formula: "(ARR(current) − ARR(previous)) ÷ ARR(previous) × 100",
    description: "Month-over-month ARR growth rate.",
  },
  {
    key: "finance.burn_multiple",
    label: "Burn Multiple",
    department: "finance",
    unit: "ratio",
    inputs: ["finance.net_burn", "revenue.arr"],
    formula: "net burn ÷ net new ARR (same period)",
    description: "Cash burned per dollar of net-new ARR; under ~1.5x is efficient growth.",
  },
  {
    key: "revenue.arpa",
    label: "ARPA",
    department: "finance",
    unit: "currency",
    inputs: ["revenue.mrr", "revenue.customer_count"],
    formula: "MRR ÷ active customers",
    description: "Average monthly recurring revenue per paying account.",
  },
  {
    key: "company.healthy_arr_growth",
    label: "Healthy ARR Growth",
    department: "operating",
    unit: "score",
    inputs: [
      "revenue.arr",
      "finance.net_burn",
      "customer_success.retention_rate",
      "finance.cash_runway_months",
    ],
    formula:
      "clamp(ARR growth% ÷ 15) × 40 + clamp((4 − burn multiple) ÷ 3) × 25 + clamp((NRR − 85) ÷ 35) × 20 + clamp((runway − 3) ÷ 15) × 15",
    description:
      "Composite 0–100 company-health score: ARR growth interpreted through burn efficiency, net revenue retention, and runway.",
  },
];

export const IMLADRIS_DASHBOARDS: ImladrisDashboardDefinition[] = [
  {
    id: "operating",
    label: "Operating Dashboard",
    sourceKeys: REQUIRED_IMLADRIS_PROVIDERS.map((provider) => provider.key),
    metricKeys: [
      "finance.cash_runway_months",
      "finance.cash_balance",
      "finance.net_burn",
      "finance.expenses",
      "finance.gross_margin",
      "revenue.mrr",
      "revenue.arr",
      "revenue.total_revenue",
      "revenue.subscription_revenue",
      "revenue.services_revenue",
      "revenue.active_subscriptions",
      "revenue.customer_count",
      "sales.qualified_pipeline",
      "sales.demos",
      "marketing.website_traffic",
      "marketing.conversion_rate",
      "marketing.pipeline_efficiency",
      "development.delivery_health",
      "product.activation_rate",
      "customer_success.customer_health",
      "customer_success.customer_activity",
      "customer_success.churn_rate",
      "customer_success.retention_rate",
      "customer_success.retention_risk",
      "company.healthy_arr_growth",
      "revenue.net_new_arr",
      "revenue.arr_growth_rate",
      "finance.burn_multiple",
      "revenue.arpa",
    ],
  },
  {
    id: "company",
    label: "Company Tracker",
    sourceKeys: [
      "stripe",
      "hubspot",
      "mercury",
      "googleWorkspace",
      "slack",
      "googleAnalytics",
      "googleSearchConsole",
      "googleAds",
      "metaAds",
      "reddit",
      "semrush",
      "coda",
      "webflow",
      "unify",
      "posthog",
      "pylon",
      "linear",
      "github",
    ],
    metricKeys: [
      "revenue.mrr",
      "revenue.arr",
      "revenue.total_revenue",
      "revenue.subscription_revenue",
      "revenue.services_revenue",
      "revenue.active_subscriptions",
      "revenue.customer_count",
      "finance.cash_balance",
      "finance.cash_runway_months",
      "finance.net_burn",
      "finance.expenses",
      "finance.gross_margin",
      "sales.qualified_pipeline",
      "sales.demos",
      "marketing.website_traffic",
      "marketing.conversion_rate",
      "marketing.pipeline_efficiency",
      "product.activation_rate",
      "customer_success.customer_health",
      "customer_success.customer_activity",
      "customer_success.churn_rate",
      "customer_success.retention_rate",
      "customer_success.retention_risk",
      "company.healthy_arr_growth",
      "revenue.net_new_arr",
      "revenue.arr_growth_rate",
      "finance.burn_multiple",
      "revenue.arpa",
    ],
  },
  {
    id: "finance",
    label: "Finance",
    sourceKeys: ["mercury", "stripe", "hubspot"],
    metricKeys: [
      "finance.cash_runway_months",
      "finance.cash_balance",
      "finance.net_burn",
      "finance.expenses",
      "finance.gross_margin",
      "revenue.mrr",
      "revenue.arr",
      "revenue.subscription_revenue",
      "revenue.services_revenue",
      "revenue.active_subscriptions",
      "revenue.customer_count",
      "revenue.net_new_arr",
      "revenue.arr_growth_rate",
      "finance.burn_multiple",
      "revenue.arpa",
    ],
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
    metricKeys: [
      "marketing.website_traffic",
      "marketing.conversion_rate",
      "marketing.pipeline_efficiency",
    ],
  },
  {
    id: "sales",
    label: "Sales",
    sourceKeys: ["hubspot", "googleWorkspace", "slack", "stripe"],
    metricKeys: [
      "sales.qualified_pipeline",
      "sales.demos",
      "revenue.mrr",
      "revenue.active_subscriptions",
      "revenue.customer_count",
    ],
  },
  {
    id: "customer-success",
    label: "Customer Success",
    sourceKeys: ["pylon", "posthog", "slack", "googleWorkspace", "stripe"],
    metricKeys: [
      "customer_success.customer_health",
      "customer_success.customer_activity",
      "customer_success.churn_rate",
      "customer_success.retention_rate",
      "customer_success.retention_risk",
      "product.activation_rate",
    ],
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

export function getImladrisDerivedMetricDefinition(
  key: string,
): ImladrisDerivedMetricDefinition | null {
  return IMLADRIS_DERIVED_METRIC_DEFINITIONS.find((metric) => metric.key === key) ?? null;
}

/** Provider dependencies of a derived metric: the union of its inputs' sources. */
export function derivedMetricSourceKeys(
  definition: ImladrisDerivedMetricDefinition,
): ImladrisProviderKey[] {
  const keys: ImladrisProviderKey[] = [];
  for (const inputKey of definition.inputs) {
    for (const sourceKey of getImladrisMetricDefinition(inputKey)?.sourceKeys ?? []) {
      if (!keys.includes(sourceKey)) keys.push(sourceKey);
    }
  }
  return keys;
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
