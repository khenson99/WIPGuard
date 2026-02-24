// ─── Analytics Module Types ───────────────────────────────
// Shared types for the analytics dashboard system

export interface AnalyticsTimestamp {
  fetchedAt: string;
  nextRefresh: string;
  source: "live" | "cached";
}

export type AnalyticsSnapshotStatus = "SUCCESS" | "ERROR";

export type IntegrationProviderKey =
  | "google_workspace"
  | "googleWorkspace"
  | "hubspot"
  | "slack"
  | "webflow"
  | "coda"
  | "codaKanban"
  | "codaOps"
  | "reddit"
  | "redditAds"
  | "redditOps"
  | "stripe"
  | "mercury"
  | "ga"
  | "googleAnalytics"
  | "googleAds"
  | "metaAds"
  | "metaPage"
  | "semrush"
  | "pylon"
  | "product"
  | "hubspotOps";

export interface ProviderFreshness {
  provider: IntegrationProviderKey;
  source: "connection" | "env" | "none" | "snapshot";
  status: "CONNECTED" | "DISCONNECTED" | "ERROR" | null;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  stale: boolean;
  lastSnapshotAt: string | null;
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
  closedWon?: number;
  followUpNeeded?: number;
  churned?: number;
}

export interface DealsByRep {
  repName: string;
  count: number;
  value: number;
  closedWon: number;
  closedWonValue: number;
}

export interface FunnelMetrics {
  totalDeals: number;
  closedWon: number;
  closedLost: number;
  unlikely: number;
  churn: number;
  notActivated?: number;
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
  dealsByRep?: DealsByRep[];
}

export interface ContactMetrics {
  totalContacts: number;
  recentContacts: number;
  bySource: { source: string; count: number }[];
}

export interface HubSpotData {
  funnel: FunnelMetrics;
  contacts: ContactMetrics;
  deals?: Array<{
    dealId: string;
    dealName: string;
    stageId: string;
    stageLabel: string;
    amount: number;
    source: string;
    ownerId: string | null;
    repName?: string;
    updatedAt: string | null;
    createdAt: string | null;
    stripeCustomerId?: string | null;
  }>;
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
  traffic: number;
  bounceRate: number;
  clicks: number;
  returningVisitors: number;
  topPosts: { message: string; reach: number; engagement: number; createdAt: string }[];
  _meta: AnalyticsTimestamp;
}

// ══════════════════════════════════════════════════════════
// INSTAGRAM PAGE TYPES
// ══════════════════════════════════════════════════════════

export interface InstagramData {
  followers: number;
  reach30d: number;
  engagement30d: number;
  traffic: number;
  bounceRate: number;
  clicks: number;
  returningVisitors: number;
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
  totalConversions: number;
  cpa: number;
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
  traffic: number;
  bounceRate: number;
  clicks: number;
  returningVisitors: number;
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
  creator?: string;
  creatorEmail?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CodaCreatorBreakdown {
  creator: string;
  email: string | null;
  cardCount: number;
  activeDays: number;
  firstCardAt: string | null;
  lastCardAt: string | null;
}

export interface CodaCreatorWindow {
  windowDays: 30 | 60 | 90;
  totalCards: number;
  previousWindowTotalCards: number;
  trendDeltaPct: number | null;
  uniqueCreators: number;
  byCreator: CodaCreatorBreakdown[];
}

export interface CodaNewCreatorFeedEntry {
  creator: string;
  email: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  cardsCreated: number;
  isUnknown: boolean;
}

export interface CodaCreatorTrends {
  newCreators30d: Array<{ date: string; count: number }>;
  cardsCreated90d: Array<{ date: string; count: number }>;
}

export type CodaLeadFunnelStatus = "inFunnel" | "notInFunnel" | "unknown";

export interface CodaEngagedLeadCandidate {
  creator: string;
  email: string;
  cards30d: number;
  activeDays30d: number;
  lastActivityAt: string | null;
  trend30dVsPrevious30d: number | null;
  engagementScore: number;
  reasons: string[];
  funnelStatus: CodaLeadFunnelStatus;
  hubspotSearchUrl: string;
}

export interface CodaDiagnostics {
  creatorResolutionMode: "override" | "auto_detect" | "unknown_heavy";
  unknownCreatorRatio: number;
  unknownCardCount: number;
  hubspotMatchingErrors: number;
}

export interface CodaKanbanData {
  totalCards: number;
  cardsByStatus: { status: string; count: number }[];
  recentCards: CodaCard[];
  creatorWindows?: CodaCreatorWindow[];
  newCreatorFeed?: CodaNewCreatorFeedEntry[];
  trends?: CodaCreatorTrends;
  engagedLeadCandidates?: CodaEngagedLeadCandidate[];
  diagnostics?: CodaDiagnostics;
  _meta: AnalyticsTimestamp;
}

// ══════════════════════════════════════════════════════════
// SEMRUSH TYPES
// ══════════════════════════════════════════════════════════

export interface SemrushKeyword {
  keyword: string;
  position: number;
  volume: number;
  cpc: number;
  traffic: number;
  url: string;
}

export interface SemrushCompetitor {
  domain: string;
  commonKeywords: number;
  organicKeywords: number;
  organicTraffic: number;
}

export interface SemrushData {
  domain: string;
  authorityScore: number;
  backlinks: number;
  organicKeywords: number;
  organicTraffic: number;
  organicTrafficCost: number;
  paidKeywords: number;
  paidTraffic: number;
  paidTrafficCost: number;
  topKeywords: SemrushKeyword[];
  organicCompetitors: SemrushCompetitor[];
  _meta: AnalyticsTimestamp;
}

// ══════════════════════════════════════════════════════════
// CUSTOMER SUCCESS TYPES
// ══════════════════════════════════════════════════════════

export interface PylonData {
  openConversations: number;
  urgentConversations: number;
  waitingOnTeam: number;
  resolvedInRange: number;
  avgFirstResponseMinutes: number | null;
  csat: number | null;
  _meta: AnalyticsTimestamp;
}

export interface ProductSuccessData {
  activeContributors: number;
  createdTasksInRange: number;
  completedTasksInRange: number;
  overdueOpenTasks: number;
  backlogGrowth: number;
  throughputRate: number | null;
  _meta: AnalyticsTimestamp;
}

export interface IntegrationTelemetryData {
  provider: IntegrationProviderKey;
  totalRules: number;
  enabledRules: number;
  erroredRules: number;
  receiptsInRange: number;
  tasksCreatedInRange: number;
  eventsInRange: number;
  failuresInRange: number;
  trend: Array<{ date: string; receipts: number; createdTasks: number; failures: number }>;
  topFailureReasons: Array<{ reason: string; count: number }>;
  coverageStatus?: "active" | "stale" | "not_provisioned" | null;
  configuredRules?: string[];
  expectedRules?: string[];
  _meta: AnalyticsTimestamp;
}

export interface FunnelTouchpoint {
  stageId: string;
  stageLabel: string;
  count: number;
  conversionFromPrevious: number | null;
}

export interface FunnelDropoffRecord {
  id: string;
  fromStageId: string;
  fromStageLabel: string;
  toStageId: string;
  toStageLabel: string;
  droppedCount: number;
  dropoffRate: number;
  entityType: "contact" | "deal";
  entityId: string;
  entityName: string;
  owner: string | null;
  value: number;
  reason: string;
  source: "hubspot" | "stripe" | "pylon" | "inferred";
  lastActivityAt: string | null;
}

export interface CrossFunnelAttribution {
  marketingSources: Array<{
    source: string;
    leads: number;
    deals: number;
    revenue: number;
    conversionRate: number | null;
  }>;
}

export interface FunnelInsight {
  id: string;
  severity: "info" | "warning" | "critical";
  headline: string;
  detail: string;
}

export interface CrossFunnelData {
  stages: FunnelTouchpoint[];
  dropoffs: FunnelDropoffRecord[];
  attribution: CrossFunnelAttribution;
  insights: FunnelInsight[];
  narrative: string[];
}

export type AnalyticsSectionId =
  | "ads-traffic"
  | "finance"
  | "sales-pipeline"
  | "customer-success"
  | "customer-journey"
  | "demo-analytics"
  | "process-analytics";

export type LifecycleStageId =
  | "awareness"
  | "acquisition"
  | "activation"
  | "revenue"
  | "retention"
  | "expansion";

export interface LifecycleSegment {
  source: string;
  domain:
    | "googleAnalytics"
    | "googleAds"
    | "metaAds"
    | "redditAds"
    | "webflow"
    | "semrush"
    | "hubspot"
    | "stripe"
    | "pylon"
    | "product"
    | "coda"
    | "googleWorkspace"
    | "slack";
  contribution: number;
  share: number;
  confidence: number;
  detail: string;
}

export interface LifecycleStage {
  id: LifecycleStageId;
  label: string;
  volume: number;
  conversionFromPrevious: number | null;
  trendDeltaPct: number | null;
  confidence: number;
  section: AnalyticsSectionId;
  evidence: LifecycleSegment[];
}

export interface LifecycleTransition {
  id: string;
  fromStageId: LifecycleStageId;
  toStageId: LifecycleStageId;
  fromVolume: number;
  toVolume: number;
  dropoff: number;
  conversionRate: number | null;
  trendDeltaPct: number | null;
}

export interface LifecycleFunnelData {
  stages: LifecycleStage[];
  transitions: LifecycleTransition[];
  generatedAt: string;
  narrative: string[];
}

export interface AnalyticsRecommendation {
  id: string;
  title: string;
  insight: string;
  suggestedAction: string;
  severity: "info" | "warning" | "critical";
  section: AnalyticsSectionId;
}

export type InsightActionType =
  | "create_task"
  | "assign_owner"
  | "create_automation_from_template"
  | "open_integration_followup";

export interface InsightAction {
  type: InsightActionType;
  label: string;
  payload: Record<string, unknown>;
}

export interface DistilledInsight {
  id: string;
  section: AnalyticsSectionId;
  severity: "info" | "warning" | "critical";
  title: string;
  why: string;
  changeOverTime: string;
  confidence: number;
  actions: InsightAction[];
}

export interface AiInsightEvidence {
  source: string;
  domain: string;
  metric: string;
  value: string;
  delta: string;
  trendValues?: number[];
}

export interface AiInsightAction {
  type: InsightActionType;
  label: string;
  payload: Record<string, unknown>;
}

export interface AiInsight {
  id: string;
  section: AnalyticsSectionId;
  subsectionId?: string;
  severity: "info" | "warning" | "critical";
  title: string;
  why: string;
  confidence: number;
  expectedImpact: string;
  stale: boolean;
  crossDomain?: boolean;
  evidence: AiInsightEvidence[];
  actions: AiInsightAction[];
}

export interface AiInsightsBundle {
  generatedAt: string;
  global: AiInsight[];
  bySection: Record<AnalyticsSectionId, AiInsight[]>;
}

export interface CrossDomainInsights {
  narrative: string;
  overallHealth: Record<AnalyticsSectionId, "green" | "yellow" | "red">;
  topRisks: Array<{
    severity: "warning" | "critical";
    title: string;
    sections: AnalyticsSectionId[];
  }>;
  correlations: Array<{
    correlation: number;
    interpretation: string;
  }>;
}

// ══════════════════════════════════════════════════════════
// CUSTOMER JOURNEY TYPES
// ══════════════════════════════════════════════════════════

export type TouchpointChannel =
  | "hubspot"
  | "stripe"
  | "google-workspace"
  | "slack"
  | "webflow"
  | "coda"
  | "google-analytics"
  | "google-ads"
  | "meta-ads"
  | "reddit-ads"
  | "pylon"
  | "mercury";

export type TouchpointType =
  | "first-touch"
  | "engagement"
  | "conversion"
  | "support"
  | "expansion";

export interface Touchpoint {
  timestamp: string;
  channel: TouchpointChannel;
  type: TouchpointType;
  detail: string;
  value: number | null;
}

export interface CustomerJourneyRecord {
  dealId: string;
  dealName: string;
  contactEmail: string | null;
  currentStage: string;
  value: number;
  touchpoints: Touchpoint[];
  firstTouch: string;
  lastTouch: string;
  daysInPipeline: number;
}

export interface TouchpointSummary {
  channel: TouchpointChannel;
  totalTouchpoints: number;
  avgPerJourney: number;
  firstTouchCount: number;
  conversionCount: number;
}

export interface JourneyPath {
  sequence: TouchpointChannel[];
  count: number;
  avgDaysToClose: number;
  avgValue: number;
}

export interface ChannelAttribution {
  channel: TouchpointChannel;
  firstTouchDeals: number;
  assistedDeals: number;
  lastTouchDeals: number;
  totalRevenue: number;
  avgDealValue: number;
}

export interface CustomerJourneyData {
  journeys: CustomerJourneyRecord[];
  touchpointSummary: TouchpointSummary[];
  avgTouchpoints: number;
  medianDaysToClose: number;
  topPaths: JourneyPath[];
  attribution: ChannelAttribution[];
}

// ══════════════════════════════════════════════════════════
// DEMO ANALYTICS TYPES
// ══════════════════════════════════════════════════════════

export type DemoOutcome = "completed" | "no-show" | "rescheduled" | "pending" | "unknown";

export interface DemoRecord {
  dealId: string;
  dealName: string;
  contactEmail: string | null;
  scheduledAt: string;
  source: string;
  outcome: DemoOutcome;
  followUpSent: boolean;
  daysToNextStage: number | null;
  resultingStage: string | null;
}

export interface DemoSourceBreakdown {
  source: string;
  scheduled: number;
  completed: number;
  noShows: number;
  conversionRate: number;
}

export interface DemoOutcomeBreakdown {
  outcome: DemoOutcome;
  count: number;
  pct: number;
}

export interface DemoConversionStep {
  label: string;
  count: number;
  conversionFromPrevious: number | null;
}

export interface DemoWeeklyTrend {
  week: string;
  scheduled: number;
  completed: number;
  noShows: number;
}

export interface JourneyPathRow {
  source: string;
  totalLeads: number;
  demosBooked: number;
  demosBookedPct: number;
  demoCompleted: number;
  demoCompletedPct: number;
  demoNoShow: number;
  demoNoShowPct: number;
  avgDaysToDecision: number | null;
  closedWon: number;
  closedWonPct: number;
  closedLost: number;
  onboarding: number;
  onboardingPct: number;
  avgContractValue: number | null;
  churned: number;
  churnedPct: number;
  notActivated: number;
  notActivatedPct: number;
}

export interface DemoAnalyticsData {
  totalScheduled: number;
  totalCompleted: number;
  totalNoShows: number;
  noShowRate: number;
  avgLeadTimeDays: number;
  demos: DemoRecord[];
  bySource: DemoSourceBreakdown[];
  byOutcome: DemoOutcomeBreakdown[];
  conversionFunnel: DemoConversionStep[];
  weeklyTrend: DemoWeeklyTrend[];
  journeyPaths: JourneyPathRow[];
}

// ══════════════════════════════════════════════════════════
// PROCESS ANALYTICS TYPES
// ══════════════════════════════════════════════════════════

export interface StageVelocity {
  stageId: string;
  stageLabel: string;
  avgDays: number;
  medianDays: number;
  p90Days: number;
  dealCount: number;
}

export interface ProcessBottleneck {
  stageLabel: string;
  avgDays: number;
  dealCount: number;
  severity: "critical" | "warning" | "info";
  recommendation: string;
}

export interface StageConversion {
  fromStage: string;
  toStage: string;
  conversionRate: number;
  avgDays: number;
  dealCount: number;
}

export interface HealthFactor {
  factor: string;
  score: number;
  weight: number;
  detail: string;
}

export interface WeeklyThroughput {
  week: string;
  entered: number;
  exited: number;
  netChange: number;
}

export interface LeakagePoint {
  stage: string;
  lostCount: number;
  lostValue: number;
  topReasons: string[];
  pctOfTotal: number;
}

export interface ProcessAnalyticsData {
  avgCycleTimeDays: number;
  stageVelocity: StageVelocity[];
  bottlenecks: ProcessBottleneck[];
  conversionByStage: StageConversion[];
  healthScore: number;
  healthFactors: HealthFactor[];
  throughput: WeeklyThroughput[];
  leakagePoints: LeakagePoint[];
}

// ══════════════════════════════════════════════════════════
// FINANCIAL PLANNING
// ══════════════════════════════════════════════════════════

export type BudgetPeriod = "monthly" | "quarterly" | "annual";
export type ExpenseCategory = "payroll" | "marketing" | "infrastructure" | "ops" | "cogs" | "other";

export interface BudgetLineItemData {
  id: string;
  category: ExpenseCategory;
  plannedAmount: number;
  actualAmount: number | null;
  variance: number | null;
  variancePct: number | null;
  notes?: string;
}

export interface BudgetData {
  id: string;
  name: string;
  period: BudgetPeriod;
  startDate: string;
  endDate: string;
  lineItems: BudgetLineItemData[];
  totalPlanned: number;
  totalActual: number | null;
  totalVariance: number | null;
}

export interface ForecastAssumptions {
  revenueGrowthRate: number;
  churnRateDelta: number;
  burnRateDelta: number;
  additionalMonthlyExpense: number;
  additionalMonthlyRevenue: number;
}

export interface ForecastMonth {
  month: string;
  projectedRevenue: number;
  projectedExpenses: number;
  projectedCashBalance: number;
  projectedMrr: number;
  projectedRunway: number | null;
}

export interface ForecastScenarioData {
  id: string;
  name: string;
  assumptions: ForecastAssumptions;
  months: ForecastMonth[];
  runwayMonths: number | null;
}

export type GoalMetric = "mrr" | "arr" | "runway" | "burn_rate" | "net_cash_flow" | "revenue" | "customer_count";
export type GoalStatus = "active" | "achieved" | "missed";

export interface FinancialGoalData {
  id: string;
  metric: GoalMetric;
  targetValue: number;
  currentValue: number;
  progressPct: number;
  deadline: string;
  status: GoalStatus;
}

export interface PnLRow {
  label: string;
  currentPeriod: number;
  previousPeriod: number;
  change: number;
  changePct: number;
}

export interface ProfitAndLoss {
  periodLabel: string;
  revenue: PnLRow;
  cogs: PnLRow;
  grossProfit: PnLRow;
  operatingExpenses: PnLRow[];
  totalOpex: PnLRow;
  operatingIncome: PnLRow;
  netIncome: PnLRow;
}

export interface UnitEconomics {
  ltv: number;
  cac: number;
  ltvCacRatio: number;
  avgRevenuePerAccount: number;
  paybackMonths: number;
  grossMarginPct: number;
}

export interface FinancialPlanningData {
  budgets: BudgetData[];
  activeBudget: BudgetData | null;
  forecasts: ForecastScenarioData[];
  goals: FinancialGoalData[];
  pnl: ProfitAndLoss | null;
  unitEconomics: UnitEconomics | null;
}

// ══════════════════════════════════════════════════════════
// COMBINED DASHBOARD
// ══════════════════════════════════════════════════════════

export interface AnalyticsDashboardData {
  hubspot: HubSpotData | null;
  stripe: StripeData | null;
  mercury: MercuryData | null;
  googleAnalytics: GAData | null;
  ga?: GAData | null;
  googleAds: GoogleAdsData | null;
  metaAds: MetaAdsData | null;
  metaPage: MetaPageData | null;
  instagram: InstagramData | null;
  redditAds: RedditAdsData | null;
  webflow: WebflowData | null;
  coda: CodaKanbanData | null;
  codaKanban?: CodaKanbanData | null;
  semrush: SemrushData | null;
  pylon: PylonData | null;
  product: ProductSuccessData | null;
  googleWorkspace: IntegrationTelemetryData | null;
  slack: IntegrationTelemetryData | null;
  hubspotOps: IntegrationTelemetryData | null;
  codaOps: IntegrationTelemetryData | null;
  redditOps: IntegrationTelemetryData | null;
  funnelJourney: CrossFunnelData | null;
  lifecycleFunnel: LifecycleFunnelData | null;
  customerJourney: CustomerJourneyData | null;
  demoAnalytics: DemoAnalyticsData | null;
  processAnalytics: ProcessAnalyticsData | null;
  recommendations: AnalyticsRecommendation[];
  distilledInsights: DistilledInsight[];
  aiInsights: AiInsightsBundle;
  freshness: Partial<Record<IntegrationProviderKey, ProviderFreshness>>;
  staleDomains: string[];
  timeRange?: {
    preset: string;
    from: string;
    to: string;
    days: number;
    label: string;
  };
  meta?: {
    servedAt: string;
    section: string | null;
    forceRefresh: boolean;
    isPartial: boolean;
    staleDomains: string[];
    erroredDomains: string[];
  };
  lastFullRefresh: string;
  financialPlanning: FinancialPlanningData | null;
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
