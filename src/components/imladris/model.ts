/**
 * Imladris canonical-metric seed model + dashboard definitions.
 *
 * Ports `prototype/app/data.js`: a coherent Series A B2B SaaS demo model with
 * 13 months of history per metric, plus the per-dashboard hero/group layout
 * (which mirrors `IMLADRIS_DASHBOARDS` in `src/lib/imladris/catalog.ts`).
 *
 * The same seed model is the base the live adapter clones and overlays real
 * values onto — demo values are only ever shown behind explicit `?demo`.
 */

import type {
  DashboardDefinition,
  GoodDirection,
  ImladrisModel,
  MetricCohortDimension,
  MetricUnit,
  NormalizedMetric,
  NormalizedProvider,
} from "./types";
import type { ImladrisProviderKey } from "@/lib/imladris/catalog";

const MONTH_LABELS = [
  "2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-08",
  "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03",
];
const N = MONTH_LABELS.length; // 13

// Deterministic pseudo-random so the demo model is stable across renders.
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build a 13-point history ending at `current`, walking backward by monthly
// growth with small bounded noise.
function hist(current: number, monthlyGrowth: number, noise: number, seed: number): number[] {
  const rnd = mulberry32(seed);
  const out = new Array<number>(N);
  out[N - 1] = current;
  for (let i = N - 2; i >= 0; i--) {
    const wobble = 1 + (rnd() - 0.5) * 2 * noise;
    out[i] = (out[i + 1] / (1 + monthlyGrowth)) * wobble;
  }
  return out.map((v) => Math.round(v * 100) / 100);
}

// Splice a single-month anomaly into the latest point.
function spike(arr: number[], factor: number): number[] {
  const a = arr.slice();
  a[a.length - 1] = Math.round(a[a.length - 1] * factor * 100) / 100;
  return a;
}

const CUR = "USD";

interface SeedMetric {
  key: string;
  label: string;
  dept: string;
  unit: MetricUnit;
  good: GoodDirection;
  value: number;
  history: number[];
  target?: number | null;
  targetLabel?: string;
  status: NormalizedMetric["status"];
  confidence: number;
  sources: ImladrisProviderKey[];
  breakdown?: NormalizedMetric["breakdown"];
  narrative?: string;
}

function seedProviders(): Record<string, NormalizedProvider> {
  return {
    stripe: { label: "Stripe", state: "connected", daysAgo: 0, records: 4120 },
    hubspot: { label: "HubSpot", state: "connected", daysAgo: 0, records: 9840 },
    mercury: { label: "Mercury", state: "connected", daysAgo: 0, records: 1860 },
    posthog: { label: "PostHog", state: "connected", daysAgo: 0, records: 251000 },
    linear: { label: "Linear", state: "connected", daysAgo: 0, records: 3120 },
    github: { label: "GitHub", state: "connected", daysAgo: 0, records: 5740 },
    pylon: { label: "Pylon", state: "connected", daysAgo: 1, records: 980 },
    slack: { label: "Slack", state: "connected", daysAgo: 0, records: 41200 },
    googleWorkspace: { label: "Google Workspace", state: "connected", daysAgo: 0, records: 6300 },
    googleAnalytics: { label: "Google Analytics", state: "connected", daysAgo: 0, records: 47800 },
    googleSearchConsole: { label: "Google Search Console", state: "connected", daysAgo: 1, records: 12400 },
    googleAds: { label: "Google Ads", state: "connected", daysAgo: 0, records: 2210 },
    metaAds: { label: "Meta Ads", state: "connected", daysAgo: 0, records: 1890 },
    reddit: { label: "Reddit Ads", state: "error", daysAgo: 6, records: 0, error: "OAuth token expired — reconnect required." },
    semrush: { label: "SEMrush", state: "stale", daysAgo: 4, records: 740, error: "Last sync 4 days ago (SLA: 24h)." },
    coda: { label: "Coda", state: "connected", daysAgo: 1, records: 320 },
    webflow: { label: "Webflow", state: "connected", daysAgo: 0, records: 1540 },
    unify: { label: "Unify", state: "partial", daysAgo: 0, records: 410, error: "Accepted 410 of 612 visitor records." },
  };
}

function seedMetrics(): SeedMetric[] {
  return [
    {
      key: "revenue.arr", label: "ARR", dept: "finance", unit: "currency", good: "up",
      value: 4_236_000, history: hist(4_236_000, 0.055, 0.015, 11),
      target: 5_000_000, targetLabel: "$5.0m by EOY", status: "ready", confidence: 0.97,
      sources: ["stripe", "hubspot"],
      breakdown: { label: "By billing system", parts: [
        { label: "Stripe (billed)", value: 3_910_000 },
        { label: "HubSpot-only contracts", value: 326_000 },
      ] },
      narrative: "ARR grew +5.5% MoM, adding $221k net-new. Expansion from 3 enterprise upgrades offset $44k of churn.",
    },
    {
      key: "revenue.mrr", label: "MRR", dept: "finance", unit: "currency", good: "up",
      value: 353_000, history: hist(353_000, 0.055, 0.015, 12),
      target: 416_000, targetLabel: "$416k (=$5.0m ARR)", status: "ready", confidence: 0.97,
      sources: ["stripe", "hubspot"],
      breakdown: { label: "By movement", parts: [
        { label: "New", value: 38_400 },
        { label: "Expansion", value: 26_700 },
        { label: "Contraction", value: -9_800 },
        { label: "Churn", value: -36_900 },
      ] },
      narrative: "Net new MRR of $18.4k. Gross new + expansion of $65.1k was partially offset by $46.7k of contraction and churn.",
    },
    {
      key: "revenue.total_revenue", label: "Revenue", dept: "finance", unit: "currency", good: "up",
      value: 372_400, history: hist(372_400, 0.052, 0.02, 21),
      target: null, status: "ready", confidence: 0.98, sources: ["stripe", "hubspot"],
      breakdown: { label: "Recognized this month", parts: [
        { label: "Subscription", value: 338_200 },
        { label: "Services", value: 34_200 },
      ] },
      narrative: "Recognized revenue of $372k, 91% recurring. Services revenue rose on two onboarding engagements.",
    },
    {
      key: "revenue.subscription_revenue", label: "Subscription revenue", dept: "finance", unit: "currency", good: "up",
      value: 338_200, history: hist(338_200, 0.054, 0.018, 31), target: null,
      status: "ready", confidence: 0.98, sources: ["stripe", "hubspot"],
      narrative: "Recurring subscription revenue, the durable base of the business.",
    },
    {
      key: "revenue.services_revenue", label: "Services revenue", dept: "finance", unit: "currency", good: "up",
      value: 34_200, history: hist(34_200, 0.03, 0.08, 41), target: null,
      status: "ready", confidence: 0.94, sources: ["stripe", "hubspot"],
      narrative: "Non-recurring implementation and support revenue. Lumpy by nature; keep below ~12% of total.",
    },
    {
      key: "finance.cash_balance", label: "Cash balance", dept: "finance", unit: "currency", good: "up",
      value: 6_082_000, history: hist(6_082_000, -0.045, 0.01, 51), target: null,
      status: "ready", confidence: 0.99, sources: ["mercury"],
      breakdown: { label: "By account", parts: [
        { label: "Operating (Mercury)", value: 1_420_000 },
        { label: "Treasury (T-bills)", value: 4_662_000 },
      ] },
      narrative: "Cash down $307k MoM in line with burn. 77% held in treasury earning yield.",
    },
    {
      key: "finance.cash_runway_months", label: "Cash runway", dept: "finance", unit: "months", good: "up",
      value: 19.4, history: hist(19.4, -0.012, 0.03, 61),
      target: 24, targetLabel: "24 months floor", status: "ready", confidence: 0.96,
      sources: ["mercury", "stripe"],
      narrative: "At current net burn, 19.4 months of runway. Below the 24-month board floor — burn discipline needed to extend.",
    },
    {
      key: "finance.net_burn", label: "Net burn", dept: "finance", unit: "currency", good: "down",
      value: 313_000, history: spike(hist(313_000, 0.012, 0.03, 71), 1.13),
      target: 275_000, targetLabel: "$275k/mo plan", status: "ready", confidence: 0.95,
      sources: ["mercury", "stripe"],
      breakdown: { label: "Cash flow", parts: [
        { label: "Outflow", value: 685_400 },
        { label: "Inflow", value: 372_400 },
      ] },
      narrative: "Net burn rose +13% MoM to $313k, above the $275k plan — driven by annual SOC 2 audit fees and Q1 hiring.",
    },
    {
      key: "finance.expenses", label: "Operating expenses", dept: "finance", unit: "currency", good: "down",
      value: 685_400, history: hist(685_400, 0.018, 0.025, 81), target: 660_000, targetLabel: "$660k/mo",
      status: "ready", confidence: 0.96, sources: ["mercury", "stripe"],
      breakdown: { label: "By category", parts: [
        { label: "Payroll", value: 432_000 },
        { label: "Infrastructure", value: 78_400 },
        { label: "Sales & marketing", value: 96_300 },
        { label: "G&A / software", value: 78_700 },
      ] },
      narrative: "Opex of $685k. Payroll is 63% of spend across 31 FTEs.",
    },
    {
      key: "finance.gross_margin", label: "Gross margin", dept: "finance", unit: "percent", good: "up",
      value: 78.4, history: hist(78.4, 0.004, 0.01, 91), target: 80, targetLabel: "80%",
      status: "ready", confidence: 0.93, sources: ["stripe", "mercury"],
      narrative: "Gross margin of 78.4%, trending toward the 80% target as infra cost-per-customer falls with scale.",
    },
    {
      key: "revenue.active_subscriptions", label: "Active subscriptions", dept: "finance", unit: "count", good: "up",
      value: 156, history: hist(156, 0.038, 0.012, 101), target: null,
      status: "ready", confidence: 0.99, sources: ["stripe", "hubspot"],
      breakdown: { label: "By plan", parts: [
        { label: "Enterprise", value: 28 },
        { label: "Growth", value: 71 },
        { label: "Starter", value: 57 },
      ] },
      narrative: "156 active paid subscriptions, +6 net this month.",
    },
    {
      key: "revenue.customer_count", label: "Customers", dept: "finance", unit: "count", good: "up",
      value: 142, history: hist(142, 0.036, 0.012, 111), target: null,
      status: "ready", confidence: 0.99, sources: ["stripe", "hubspot"],
      breakdown: { label: "By plan", parts: [
        { label: "Enterprise", value: 24 },
        { label: "Growth", value: 66 },
        { label: "Starter", value: 52 },
      ] },
      narrative: "142 paying customers. Enterprise logos up 2 to 24, lifting average contract value.",
    },
    {
      key: "sales.qualified_pipeline", label: "Qualified pipeline", dept: "sales", unit: "currency", good: "up",
      value: 2_840_000, history: hist(2_840_000, 0.04, 0.04, 121), target: 3_200_000, targetLabel: "$3.2m",
      status: "ready", confidence: 0.9, sources: ["hubspot", "googleWorkspace", "slack"],
      breakdown: { label: "By stage", parts: [
        { label: "Discovery", value: 1_180_000 },
        { label: "Evaluation", value: 940_000 },
        { label: "Proposal", value: 480_000 },
        { label: "Negotiation", value: 240_000 },
      ] },
      narrative: "Qualified open pipeline of $2.84m, 3.1x next-quarter target coverage. Proposal stage thinning — top-of-funnel needs attention.",
    },
    {
      key: "sales.demos", label: "Demos booked", dept: "sales", unit: "count", good: "up",
      value: 64, history: hist(64, 0.03, 0.06, 131), target: 75, targetLabel: "75/mo",
      status: "ready", confidence: 0.92, sources: ["hubspot", "googleWorkspace", "webflow"],
      breakdown: { label: "By source", parts: [
        { label: "Inbound (web)", value: 31 },
        { label: "Outbound", value: 22 },
        { label: "Partner / referral", value: 11 },
      ] },
      narrative: "64 demos booked, below the 75 target. Inbound held but outbound dipped with one rep ramping.",
    },
    {
      key: "marketing.website_traffic", label: "Website traffic", dept: "marketing", unit: "count", good: "up",
      value: 47_800, history: spike(hist(47_800, 0.03, 0.04, 141), 0.91), target: 55_000, targetLabel: "55k sessions",
      status: "stale", confidence: 0.78, sources: ["googleAnalytics", "googleSearchConsole", "semrush", "webflow", "posthog"],
      narrative: "Sessions down 9% MoM. SEMrush data is 4 days stale, so organic attribution is lower-confidence this period.",
    },
    {
      key: "marketing.conversion_rate", label: "Visitor conversion", dept: "marketing", unit: "percent", good: "up",
      value: 3.2, history: hist(3.2, 0.01, 0.05, 151), target: 3.8, targetLabel: "3.8%",
      status: "ready", confidence: 0.85, sources: ["googleAnalytics", "webflow", "unify", "hubspot", "posthog"],
      narrative: "Visitor-to-lead conversion of 3.2%. Pricing-page experiment is live; early lift not yet significant.",
    },
    {
      key: "marketing.pipeline_efficiency", label: "Pipeline efficiency", dept: "marketing", unit: "ratio", good: "up",
      value: 4.1, history: hist(4.1, 0.015, 0.05, 161), target: 4.5, targetLabel: "4.5x",
      status: "partial", confidence: 0.72, sources: ["googleAnalytics", "googleAds", "metaAds", "reddit", "semrush", "webflow", "unify", "hubspot"],
      narrative: "$4.10 of qualified pipeline per acquisition dollar. Reddit Ads disconnected and Unify is partial, so spend coverage is incomplete.",
    },
    {
      key: "development.delivery_health", label: "Delivery health", dept: "development", unit: "score", good: "up",
      value: 74, history: hist(74, 0.008, 0.04, 171), target: 80, targetLabel: "80",
      status: "ready", confidence: 0.88, sources: ["linear", "github", "posthog"],
      breakdown: { label: "Component scores", parts: [
        { label: "Cycle time", value: 71 },
        { label: "Throughput", value: 78 },
        { label: "Review latency", value: 69 },
        { label: "Incident-free", value: 82 },
      ] },
      narrative: "Composite delivery health of 74/100. Review latency is the weakest input — PRs waiting a median 1.8 days.",
    },
    {
      key: "product.activation_rate", label: "Activation rate", dept: "development", unit: "percent", good: "up",
      value: 61.5, history: hist(61.5, 0.012, 0.03, 181), target: 70, targetLabel: "70%",
      status: "ready", confidence: 0.9, sources: ["posthog", "hubspot"],
      breakdown: { label: "New-account funnel", parts: [
        { label: "Activated", value: 87 },
        { label: "Onboarding", value: 31 },
        { label: "Stalled", value: 23 },
      ] },
      narrative: "61.5% of new accounts reach the activation milestone within 14 days. The 'invite a teammate' step is the largest drop-off.",
    },
    {
      key: "customer_success.customer_health", label: "Customer health", dept: "customer-success", unit: "score", good: "up",
      value: 82, history: hist(82, 0.004, 0.02, 191), target: 85, targetLabel: "85",
      status: "ready", confidence: 0.86, sources: ["pylon", "posthog", "slack", "googleWorkspace", "stripe"],
      breakdown: { label: "By band", parts: [
        { label: "Healthy", value: 104 },
        { label: "Watch", value: 27 },
        { label: "At risk", value: 11 },
      ] },
      narrative: "Portfolio health score of 82. 104 of 142 accounts healthy; 11 at-risk accounts hold $312k of ARR.",
    },
    {
      key: "customer_success.customer_activity", label: "Customer activity", dept: "customer-success", unit: "count", good: "up",
      value: 8_640, history: hist(8_640, 0.02, 0.04, 201), target: null,
      status: "ready", confidence: 0.84, sources: ["posthog", "pylon", "slack", "googleWorkspace"],
      breakdown: { label: "By signal", parts: [
        { label: "Product usage", value: 6_120 },
        { label: "Support", value: 1_340 },
        { label: "Collaboration", value: 1_180 },
      ] },
      narrative: "8,640 customer activity signals this month, a healthy engagement base across product, support and shared channels.",
    },
    {
      key: "customer_success.churn_rate", label: "Logo churn", dept: "customer-success", unit: "percent", good: "down",
      value: 1.9, history: hist(1.9, -0.01, 0.06, 211), target: 1.5, targetLabel: "1.5%",
      status: "ready", confidence: 0.91, sources: ["stripe", "hubspot", "pylon"],
      narrative: "Monthly logo churn of 1.9%, above the 1.5% target. Two starter-tier accounts lapsed on card failures.",
    },
    {
      key: "customer_success.retention_rate", label: "Net revenue retention", dept: "customer-success", unit: "percent", good: "up",
      value: 111, history: hist(111, 0.002, 0.01, 221), target: 115, targetLabel: "115%",
      status: "ready", confidence: 0.89, sources: ["stripe", "hubspot", "posthog"],
      narrative: "NRR of 111% — expansion outpaces churn. Enterprise cohort runs at 128%; starter cohort drags below 100%.",
    },
    {
      key: "customer_success.retention_risk", label: "Retention risk", dept: "customer-success", unit: "score", good: "down",
      value: 24, history: hist(24, -0.005, 0.05, 231), target: 18, targetLabel: "18",
      status: "ready", confidence: 0.83, sources: ["pylon", "posthog", "slack", "googleWorkspace", "stripe"],
      narrative: "Risk index of 24/100. 11 accounts flagged; declining product usage is the leading predictor this quarter.",
    },
  ];
}

// ---- cohort / segment specs: dimensional slices of a metric ----
interface AdditiveGroupSpec { label: string; share: number; growth: number; noise?: number; seed: number }
interface ComparativeGroupSpec { label: string; value: number; growth: number; noise?: number; seed: number }
interface CohortDimSpec {
  id: string;
  label: string;
  type: "additive" | "comparative";
  groups: Array<AdditiveGroupSpec | ComparativeGroupSpec>;
}

const COHORT_SPECS: Record<string, CohortDimSpec[]> = {
  "revenue.arr": [
    { id: "plan", label: "Plan tier", type: "additive", groups: [
      { label: "Enterprise", share: 0.54, growth: 0.078, seed: 301 },
      { label: "Growth", share: 0.33, growth: 0.052, seed: 302 },
      { label: "Starter", share: 0.13, growth: 0.022, seed: 303 } ] },
    { id: "region", label: "Region", type: "additive", groups: [
      { label: "North America", share: 0.61, growth: 0.05, seed: 311 },
      { label: "EMEA", share: 0.27, growth: 0.072, seed: 312 },
      { label: "APAC", share: 0.12, growth: 0.094, seed: 313 } ] },
  ],
  "revenue.mrr": [
    { id: "plan", label: "Plan tier", type: "additive", groups: [
      { label: "Enterprise", share: 0.54, growth: 0.078, seed: 321 },
      { label: "Growth", share: 0.33, growth: 0.052, seed: 322 },
      { label: "Starter", share: 0.13, growth: 0.022, seed: 323 } ] },
  ],
  "revenue.total_revenue": [
    { id: "plan", label: "Plan tier", type: "additive", groups: [
      { label: "Enterprise", share: 0.5, growth: 0.072, seed: 331 },
      { label: "Growth", share: 0.34, growth: 0.05, seed: 332 },
      { label: "Starter", share: 0.16, growth: 0.026, seed: 333 } ] },
  ],
  "revenue.customer_count": [
    { id: "plan", label: "Plan tier", type: "additive", groups: [
      { label: "Enterprise", share: 0.17, growth: 0.055, seed: 341 },
      { label: "Growth", share: 0.46, growth: 0.04, seed: 342 },
      { label: "Starter", share: 0.37, growth: 0.028, seed: 343 } ] },
    { id: "region", label: "Region", type: "additive", groups: [
      { label: "North America", share: 0.58, growth: 0.035, seed: 351 },
      { label: "EMEA", share: 0.29, growth: 0.05, seed: 352 },
      { label: "APAC", share: 0.13, growth: 0.07, seed: 353 } ] },
  ],
  "revenue.active_subscriptions": [
    { id: "plan", label: "Plan tier", type: "additive", groups: [
      { label: "Enterprise", share: 0.18, growth: 0.055, seed: 361 },
      { label: "Growth", share: 0.455, growth: 0.04, seed: 362 },
      { label: "Starter", share: 0.365, growth: 0.03, seed: 363 } ] },
  ],
  "sales.qualified_pipeline": [
    { id: "channel", label: "Source", type: "additive", groups: [
      { label: "Inbound (web)", share: 0.46, growth: 0.045, seed: 371 },
      { label: "Outbound", share: 0.34, growth: 0.03, seed: 372 },
      { label: "Partner / referral", share: 0.2, growth: 0.06, seed: 373 } ] },
  ],
  "sales.demos": [
    { id: "channel", label: "Source", type: "additive", groups: [
      { label: "Inbound (web)", share: 0.48, growth: 0.03, seed: 381 },
      { label: "Outbound", share: 0.34, growth: 0.018, seed: 382 },
      { label: "Partner / referral", share: 0.18, growth: 0.05, seed: 383 } ] },
  ],
  "marketing.website_traffic": [
    { id: "channel", label: "Channel", type: "additive", groups: [
      { label: "Organic search", share: 0.45, growth: 0.028, seed: 391 },
      { label: "Direct", share: 0.26, growth: 0.03, seed: 392 },
      { label: "Paid", share: 0.19, growth: 0.05, seed: 393 },
      { label: "Referral / social", share: 0.1, growth: 0.04, seed: 394 } ] },
  ],
  "marketing.conversion_rate": [
    { id: "channel", label: "Channel", type: "comparative", groups: [
      { label: "Organic search", value: 4.1, growth: 0.012, seed: 401 },
      { label: "Paid", value: 2.6, growth: 0.02, seed: 402 },
      { label: "Direct", value: 3.4, growth: 0.008, seed: 403 },
      { label: "Referral / social", value: 2.1, growth: 0.015, seed: 404 } ] },
  ],
  "product.activation_rate": [
    { id: "plan", label: "Plan tier", type: "comparative", groups: [
      { label: "Enterprise", value: 78.4, growth: 0.01, seed: 411 },
      { label: "Growth", value: 63.2, growth: 0.014, seed: 412 },
      { label: "Starter", value: 49.1, growth: 0.016, seed: 413 } ] },
  ],
  "customer_success.retention_rate": [
    { id: "plan", label: "Plan tier", type: "comparative", groups: [
      { label: "Enterprise", value: 128, growth: 0.004, seed: 421 },
      { label: "Growth", value: 108, growth: 0.003, seed: 422 },
      { label: "Starter", value: 94, growth: -0.002, seed: 423 } ] },
  ],
  "customer_success.churn_rate": [
    { id: "plan", label: "Plan tier", type: "comparative", groups: [
      { label: "Enterprise", value: 0.6, growth: -0.02, noise: 0.12, seed: 431 },
      { label: "Growth", value: 1.7, growth: -0.01, noise: 0.08, seed: 432 },
      { label: "Starter", value: 3.4, growth: 0.004, noise: 0.07, seed: 433 } ] },
  ],
  "customer_success.customer_health": [
    { id: "plan", label: "Plan tier", type: "comparative", groups: [
      { label: "Enterprise", value: 89, growth: 0.003, seed: 441 },
      { label: "Growth", value: 83, growth: 0.004, seed: 442 },
      { label: "Starter", value: 74, growth: 0.002, seed: 443 } ] },
  ],
};

function isAdditive(g: AdditiveGroupSpec | ComparativeGroupSpec): g is AdditiveGroupSpec {
  return "share" in g;
}

type RawGroup =
  | { label: string; kind: "additive"; raw: number[] }
  | { label: string; kind: "comparative"; history: number[] };

function buildCohorts(metric: SeedMetric, dims: CohortDimSpec[]): MetricCohortDimension[] {
  return dims.map((dim) => {
    const rawByGroup: RawGroup[] = dim.groups.map((g) => {
      if (dim.type === "additive" && isAdditive(g)) {
        return { label: g.label, kind: "additive", raw: hist(metric.value * g.share, g.growth, g.noise ?? 0.02, g.seed) };
      }
      const comp = g as ComparativeGroupSpec;
      return { label: g.label, kind: "comparative", history: hist(comp.value, comp.growth, comp.noise ?? 0.03, comp.seed) };
    });

    const groups: MetricCohortDimension["groups"] = rawByGroup.map((g) => ({
      label: g.label,
      history: g.kind === "comparative" ? g.history : new Array<number>(N).fill(0),
    }));

    if (dim.type === "additive") {
      for (let i = 0; i < N; i++) {
        let sum = 0;
        rawByGroup.forEach((g) => { if (g.kind === "additive") sum += g.raw[i]; });
        const f = sum ? metric.history[i] / sum : 0;
        rawByGroup.forEach((g, gi) => {
          if (g.kind === "additive") groups[gi].history[i] = Math.round(g.raw[i] * f * 100) / 100;
        });
      }
    }
    return { id: dim.id, label: dim.label, type: dim.type, groups };
  });
}

const DASHBOARDS: Record<string, DashboardDefinition> = {
  company: {
    id: "company", label: "Company Tracker", eyebrow: "Founder cockpit",
    hero: ["revenue.arr", "revenue.mrr", "finance.net_burn", "finance.cash_runway_months", "finance.cash_balance"],
    groups: [
      { title: "Revenue quality", keys: ["revenue.total_revenue", "revenue.subscription_revenue", "revenue.services_revenue", "finance.gross_margin"] },
      { title: "Growth engine", keys: ["sales.qualified_pipeline", "sales.demos", "marketing.conversion_rate", "product.activation_rate", "marketing.website_traffic", "marketing.pipeline_efficiency"] },
      { title: "Customers & retention", keys: ["revenue.customer_count", "revenue.active_subscriptions", "customer_success.retention_rate", "customer_success.churn_rate", "customer_success.customer_health", "customer_success.retention_risk"] },
    ],
  },
  operating: {
    id: "operating", label: "Operating", eyebrow: "Whole business",
    hero: ["revenue.arr", "finance.net_burn", "finance.cash_runway_months", "sales.qualified_pipeline", "customer_success.retention_rate"],
    groups: [
      { title: "Finance", keys: ["revenue.mrr", "finance.cash_balance", "finance.expenses", "finance.gross_margin"] },
      { title: "Go-to-market", keys: ["sales.demos", "marketing.website_traffic", "marketing.conversion_rate", "marketing.pipeline_efficiency"] },
      { title: "Product & delivery", keys: ["development.delivery_health", "product.activation_rate", "customer_success.customer_activity"] },
      { title: "Customer success", keys: ["revenue.customer_count", "customer_success.customer_health", "customer_success.churn_rate", "customer_success.retention_risk"] },
    ],
  },
  finance: {
    id: "finance", label: "Finance", eyebrow: "Cash, revenue & margin",
    hero: ["finance.cash_runway_months", "finance.net_burn", "finance.cash_balance", "revenue.mrr", "finance.gross_margin"],
    groups: [
      { title: "Revenue", keys: ["revenue.arr", "revenue.total_revenue", "revenue.subscription_revenue", "revenue.services_revenue"] },
      { title: "Spend & efficiency", keys: ["finance.expenses", "revenue.active_subscriptions", "revenue.customer_count"] },
    ],
  },
  sales: {
    id: "sales", label: "Sales", eyebrow: "Pipeline & velocity",
    hero: ["sales.qualified_pipeline", "sales.demos", "revenue.mrr", "revenue.active_subscriptions", "revenue.customer_count"],
    groups: [
      { title: "Revenue context", keys: ["revenue.arr", "marketing.conversion_rate", "marketing.pipeline_efficiency"] },
    ],
  },
  marketing: {
    id: "marketing", label: "Marketing", eyebrow: "Acquisition & funnel",
    hero: ["marketing.website_traffic", "marketing.conversion_rate", "marketing.pipeline_efficiency", "sales.demos", "sales.qualified_pipeline"],
    groups: [
      { title: "Downstream", keys: ["product.activation_rate", "revenue.customer_count"] },
    ],
  },
  development: {
    id: "development", label: "Development", eyebrow: "Delivery & product",
    hero: ["development.delivery_health", "product.activation_rate", "customer_success.customer_activity"],
    groups: [
      { title: "Customer signal", keys: ["customer_success.customer_health", "customer_success.retention_risk"] },
    ],
  },
  "customer-success": {
    id: "customer-success", label: "Customer Success", eyebrow: "Health & retention",
    hero: ["customer_success.retention_rate", "customer_success.churn_rate", "customer_success.customer_health", "customer_success.retention_risk", "customer_success.customer_activity"],
    groups: [
      { title: "Revenue at stake", keys: ["revenue.customer_count", "revenue.active_subscriptions", "product.activation_rate"] },
    ],
  },
};

/**
 * Build a fresh demo/seed model. Returns a deep, independent instance each call
 * so the live adapter can mutate its clone without touching the seed.
 */
export function buildImladrisModel(): ImladrisModel {
  const metrics: NormalizedMetric[] = seedMetrics().map((seed) => {
    const cohorts = COHORT_SPECS[seed.key]
      ? buildCohorts(seed, COHORT_SPECS[seed.key])
      : undefined;
    const metric: NormalizedMetric = {
      key: seed.key,
      label: seed.label,
      dept: seed.dept,
      unit: seed.unit,
      good: seed.good,
      value: seed.value,
      history: seed.history.slice(),
      liveTrend: true,
      status: seed.status,
      confidence: seed.confidence,
      sources: seed.sources.slice(),
      target: seed.target ?? null,
      targetLabel: seed.targetLabel,
      breakdown: seed.breakdown,
      narrative: seed.narrative,
      liveSegments: [],
    };
    if (cohorts) metric.cohorts = cohorts;
    return metric;
  });

  // website traffic: 'channel' cohort supersedes the static breakdown.
  const traffic = metrics.find((m) => m.key === "marketing.website_traffic");
  if (traffic) delete traffic.breakdown;

  return {
    currency: CUR,
    mode: "demo",
    trendsAvailable: true,
    hasLiveCohorts: false,
    months: MONTH_LABELS.slice(),
    currentMonth: MONTH_LABELS[N - 1],
    providers: seedProviders(),
    metrics,
    metricByKey: Object.fromEntries(metrics.map((m) => [m.key, m])),
    dashboards: DASHBOARDS,
  };
}

export const IMLADRIS_MONTH_LABELS = MONTH_LABELS;
