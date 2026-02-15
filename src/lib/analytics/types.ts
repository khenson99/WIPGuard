// ─── Analytics Module Types ───────────────────────────────
// Shared types for the analytics dashboard system

export interface AnalyticsTimestamp {
  fetchedAt: string;
  nextRefresh: string;
  source: "live" | "cached";
}

// ══════════════════════════════════════════════════════════
// HUBSPOT TYPES
// ══════════════════════════════════════════════════════════

export interface DealStage {
  stageId: string;
  label: string;
  count: number;
  value: number;
}

export interface DealsBySource {
  source: string;
  count: number;
  value: number;
}

export interface FunnelMetrics {
  totalDeals: number;
  closedWon: number;
  closedLost: number;
  unlikely: number;
  churn: number;
  activeSubscriptions: number;
  noShows: number;
  demoScheduled: number;
  demoFollowUp: number;
  avgDealSize: number;
  winRate: number;
  effectiveWinRate: number;
  noShowRate: number;
  stages: DealStage[];
  dealsBySource: DealsBySource[];
}

export interface ContactMetrics {
  totalContacts: number;
  recentContacts: number;
  bySource: { source: string; count: number }[];
}

export interface HubSpotData {
  funnel: FunnelMetrics;
  contacts: ContactMetrics;
  _meta: AnalyticsTimestamp;
}

// ══════════════════════════════════════════════════════════
// STRIPE TYPES
// ══════════════════════════════════════════════════════════

export interface RevenueMetrics {
  mrr: number;
  mrrChange: number;
  totalRevenue30d: number;
  totalRevenuePrev30d: number;
  revenueGrowth: number;
  avgRevenuePerCustomer: number;
}

export interface SubscriptionMetrics {
  active: number;
  pastDue: number;
  canceled: number;
  trialing: number;
  churnRate: number;
  recentChurnEvents: { customer: string; canceledAt: string; amount: number }[];
}

export interface PaymentMetrics {
  succeeded: number;
  failed: number;
  successRate: number;
}

export interface RevenueTrend {
  month: string;
  revenue: number;
}

export interface StripeData {
  revenue: RevenueMetrics;
  subscriptions: SubscriptionMetrics;
  payments: PaymentMetrics;
  revenueTrend: RevenueTrend[];
  _meta: AnalyticsTimestamp;
}

// ══════════════════════════════════════════════════════════
// MERCURY TYPES
// ══════════════════════════════════════════════════════════

export interface AccountBalance {
  accountId: string;
  accountName: string;
  balance: number;
  type: string;
}

export interface CashFlowMetrics {
  totalBalance: number;
  inflows30d: number;
  outflows30d: number;
  netCashFlow: number;
  runway: number;
  burnRate: number;
}

export interface MercuryData {
  accounts: AccountBalance[];
  cashFlow: CashFlowMetrics;
  _meta: AnalyticsTimestamp;
}

// ══════════════════════════════════════════════════════════
// GOOGLE ANALYTICS (GA4) TYPES
// ══════════════════════════════════════════════════════════

export interface GATrafficChannel {
  channel: string;
  sessions: number;
  users: number;
  pageviews: number;
}

export interface GATopPage {
  path: string;
  pageviews: number;
  avgDuration: number;
}

export interface GAData {
  sessions30d: number;
  sessionsPrev30d: number;
  users30d: number;
  usersPrev30d: number;
  pageviews30d: number;
  pageviewsPrev30d: number;
  bounceRate: number;
  avgSessionDuration: number;
  trafficByChannel: GATrafficChannel[];
  topPages: GATopPage[];
  dailyTrend: { date: string; sessions: number }[];
  _meta: AnalyticsTimestamp;
}

// ══════════════════════════════════════════════════════════
// GOOGLE ADS TYPES
// ══════════════════════════════════════════════════════════

export interface AdCampaign {
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
}

export interface GoogleAdsData {
  totalSpend30d: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
  campaigns: AdCampaign[];
  _meta: AnalyticsTimestamp;
}

// ══════════════════════════════════════════════════════════
// META ADS TYPES
// ══════════════════════════════════════════════════════════

export interface MetaAdsData {
  totalSpend30d: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  ctr: number;
  cpc: number;
  cpa: number;
  campaigns: AdCampaign[];
  _meta: AnalyticsTimestamp;
}

// ══════════════════════════════════════════════════════════
// META BUSINESS SUITE (PAGE INSIGHTS) TYPES
// ══════════════════════════════════════════════════════════

export interface MetaPageData {
  pageLikes: number;
  pageFollowers: number;
  postReach30d: number;
  postEngagement30d: number;
  topPosts: { message: string; reach: number; engagement: number; createdAt: string }[];
  _meta: AnalyticsTimestamp;
}

// ══════════════════════════════════════════════════════════
// REDDIT ADS TYPES
// ══════════════════════════════════════════════════════════

export interface RedditAdsData {
  totalSpend30d: number;
  totalImpressions: number;
  totalClicks: number;
  ctr: number;
  cpc: number;
  campaigns: AdCampaign[];
  _meta: AnalyticsTimestamp;
}

// ══════════════════════════════════════════════════════════
// WEBFLOW TYPES
// ══════════════════════════════════════════════════════════

export interface WebflowFormEntry {
  formName: string;
  count: number;
}

export interface WebflowData {
  siteName: string;
  lastPublished: string;
  totalPages: number;
  totalCollections: number;
  formSubmissions: WebflowFormEntry[];
  customDomains: string[];
  _meta: AnalyticsTimestamp;
}

// ══════════════════════════════════════════════════════════
// CODA KANBAN TYPES
// ══════════════════════════════════════════════════════════

export interface CodaCard {
  id: string;
  name: string;
  status: string;
  priority?: string;
  assignee?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CodaKanbanData {
  totalCards: number;
  cardsByStatus: { status: string; count: number }[];
  recentCards: CodaCard[];
  _meta: AnalyticsTimestamp;
}

// ══════════════════════════════════════════════════════════
// COMBINED DASHBOARD
// ══════════════════════════════════════════════════════════

export interface AnalyticsDashboardData {
  hubspot: HubSpotData | null;
  stripe: StripeData | null;
  mercury: MercuryData | null;
  googleAnalytics: GAData | null;
  googleAds: GoogleAdsData | null;
  metaAds: MetaAdsData | null;
  metaPage: MetaPageData | null;
  redditAds: RedditAdsData | null;
  webflow: WebflowData | null;
  coda: CodaKanbanData | null;
  lastFullRefresh: string;
  errors: { source: string; message: string }[];
}

// ── Action Plan Types ──
export interface ActionItem {
  id: string;
  title: string;
  stream: "demo-noshows" | "pipeline-leaks" | "churn-retention" | "process-data";
  week: number;
  owner: string;
  priority: "critical" | "high" | "medium";
  completed: boolean;
  description?: string;
}

export interface ActionPlanData {
  items: ActionItem[];
  projectedImpact: {
    additionalDemos: number;
    additionalClosedDeals: number;
    unlikelyWins: number;
    churnReduction: number;
    totalRevenueImpact: number;
  };
}

// ── Dashboard Tab Config ──
export type AnalyticsTab =
  | "overview"
  | "sales"
  | "finance"
  | "marketing"
  | "tasks";

export interface TabConfig {
  id: AnalyticsTab;
  label: string;
  description: string;
}

export const ANALYTICS_TABS: TabConfig[] = [
  { id: "overview", label: "Overview", description: "Key metrics at a glance" },
  { id: "sales", label: "Sales & Pipeline", description: "HubSpot deals & conversions" },
  { id: "finance", label: "Revenue & Finance", description: "Stripe MRR & Mercury cash" },
  { id: "marketing", label: "Ads & Traffic", description: "Google Analytics, Ads, Meta & Reddit" },
  { id: "tasks", label: "Tasks", description: "Coda kanban board" },
];
