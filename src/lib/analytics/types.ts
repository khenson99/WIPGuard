// ─── Analytics Module Types ───────────────────────────────
// Shared types for the analytics dashboard system

export interface AnalyticsTimestamp {
  fetchedAt: string;
  nextRefresh: string;
  source: "live" | "cached";
}

// ── HubSpot Types ──
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

// ── Stripe Types ──
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

// ── Mercury Types ──
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
  runway: number; // months
  burnRate: number;
}

export interface MercuryData {
  accounts: AccountBalance[];
  cashFlow: CashFlowMetrics;
  _meta: AnalyticsTimestamp;
}

// ── Combined Dashboard ──
export interface AnalyticsDashboardData {
  hubspot: HubSpotData | null;
  stripe: StripeData | null;
  mercury: MercuryData | null;
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
  | "marketing"
  | "sales-funnel"
  | "action-plan";

export interface TabConfig {
  id: AnalyticsTab;
  label: string;
  description: string;
}

export const ANALYTICS_TABS: TabConfig[] = [
  { id: "overview", label: "Overview", description: "Key metrics across all channels" },
  { id: "marketing", label: "Marketing", description: "Traffic, social, revenue & subscriptions" },
  { id: "sales-funnel", label: "Sales Funnel", description: "Pipeline analysis & bottlenecks" },
  { id: "action-plan", label: "Action Plan", description: "4-week improvement sprint" },
];
