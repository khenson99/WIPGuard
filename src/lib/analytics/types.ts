// ─── Analytics Module Types ───────────────────────────────
// Shared types for the analytics dashboard system

export interface AnalyticsTimestamp {
  fetchedAt: string;
  nextRefresh: string;
  source: "live" | "cached";
  diagnostics?: Record<string, unknown>;
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

export interface HubSpotRepScoreboardRow {
  ownerId: string | null;
  ownerName: string;
  totalDeals: number;
  totalPipeline: number;
  avgDealSize: number;
  demos: number;
  noShows: number;
  noShowRate: number;
  wonCount: number;
  wonRevenue: number;
  avgWon: number;
  lostCount: number;
  winRate: number;
  demoToWonRate: number;
  churnedWon: number;
  churnRate: number;
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
  repScoreboard?: HubSpotRepScoreboardRow[];
  pipelineDetected?: { pipelineId: string; dealCount: number };
  subscriptionPipelineDetected?: { pipelineId: string; dealCount: number };
  pipelineStageLabelsSource?: "api" | "fallback";
  pipelineStages?: Array<{ stageId: string; label: string }>;
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
    closedAt?: string | null;
    stripeCustomerId?: string | null;
    pipelineId: string | null;
    contactIds: string[];
    primaryContactId: string | null;
    primaryContactEmail: string | null;
    primaryContactAnalytics?: {
      createdAt?: string | null;
      source: string | null;
      sourceData1: string | null;
      sourceData2: string | null;
      firstSeenAt: string | null;
      lastSeenAt: string | null;
      firstUrl: string | null;
      lastUrl: string | null;
      numVisits: number | null;
      numPageViews: number | null;
      utmSource: string | null;
      utmMedium: string | null;
      utmCampaign: string | null;
    };
    stageHistory?: Array<{ occurredAt: string; stageId: string; stageLabel: string }>;
  }>;
  subscriptionDeals?: Array<{
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
    closedAt?: string | null;
    stripeCustomerId?: string | null;
    pipelineId: string | null;
    contactIds: string[];
    primaryContactId: string | null;
    primaryContactEmail: string | null;
    primaryContactAnalytics?: {
      createdAt?: string | null;
      source: string | null;
      sourceData1: string | null;
      sourceData2: string | null;
      firstSeenAt: string | null;
      lastSeenAt: string | null;
      firstUrl: string | null;
      lastUrl: string | null;
      numVisits: number | null;
      numPageViews: number | null;
      utmSource: string | null;
      utmMedium: string | null;
      utmCampaign: string | null;
    };
    stageHistory?: Array<{ occurredAt: string; stageId: string; stageLabel: string }>;
  }>;
  displayDeals?: Array<{
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
    closedAt?: string | null;
    stripeCustomerId?: string | null;
    pipelineId: string | null;
    contactIds: string[];
    primaryContactId: string | null;
    primaryContactEmail: string | null;
    primaryContactAnalytics?: {
      createdAt?: string | null;
      source: string | null;
      sourceData1: string | null;
      sourceData2: string | null;
      firstSeenAt: string | null;
      lastSeenAt: string | null;
      firstUrl: string | null;
      lastUrl: string | null;
      numVisits: number | null;
      numPageViews: number | null;
      utmSource: string | null;
      utmMedium: string | null;
      utmCampaign: string | null;
    };
    stageHistory?: Array<{ occurredAt: string; stageId: string; stageLabel: string }>;
  }>;
  _meta: AnalyticsTimestamp;
}

export interface HubSpotContactRecord {
  contactId: string;
  createdAt: string | null;
  ownerId: string | null;
  repName: string;
  rawSource: string | null;
}

// ══════════════════════════════════════════════════════════
// SALES PERFORMANCE PACK (HubSpot + Stripe)
// ══════════════════════════════════════════════════════════

export type ChannelGroup = "Inbound" | "Outbound" | "Partner" | "Product-led" | "Unknown";

export type SalesPerformanceChannelMappingRow = {
  rawSource: string;
  channelGroup: ChannelGroup;
};

export type SalesPerformanceRepMonthRow = {
  month: string; // YYYY-MM (UTC)
  repName: string;

  leadsCreatedCount: number;
  opportunitiesCreatedCount: number;
  leadToOpportunityRate: number | null;

  signedDealsCount: number;
  signedDealsBookedValue: number;
  avgSignedDealSizeBooked: number | null;
  medianSignedDealSizeBooked: number | null;

  signedDealsRealizedValue30d: number;
  bookedToRealizedRatio30d: number | null;

  opportunityToClosedRate90d: number | null;
  winRateDecided: number | null;

  signedInboundShare: number | null;
  signedOutboundShare: number | null;
  signedPartnerShare: number | null;
  signedProductLedShare: number | null;
  signedUnknownShare: number | null;

  dataQuality: {
    signedDealsMissingSourcePct: number | null;
    signedDealsMissingCloseDatePct: number | null;
    signedDealsMissingOwnerPct: number | null;
    opportunitiesMissingOwnerPct: number | null;
    leadsMissingOwnerPct: number | null;
  };
};

export type SalesPerformanceRepMonthChannelRow = {
  month: string; // YYYY-MM (UTC)
  repName: string;
  channelGroup: ChannelGroup;
  rawSource: string;

  opportunitiesCreatedCount: number;
  signedDealsCount: number;
  bookedValue: number;
  avgBookedDealSize: number | null;
  realizedValue30d: number;
  winRateDecided: number | null;
  avgDaysToClose: number | null;
};

export type SalesPerformanceDealAuditRow = {
  hubspotDealId: string;
  dealName: string;
  ownerId: string | null;
  repName: string;
  createdAt: string | null;
  closedAt: string | null;
  stageId: string;
  stageLabel: string;
  amount: number;
  rawSource: string;
  channelGroup: ChannelGroup;
  stripeCustomerId: string | null;
  stripeLinked: boolean;
  stripeRealized30d: number;
  flags: string[];
};

export type SalesPerformancePack = {
  from: string; // ISO
  to: string; // ISO
  generatedAt: string; // ISO
  fromSnapshot: boolean;

  channelMapping: SalesPerformanceChannelMappingRow[];
  repMonthRows: SalesPerformanceRepMonthRow[];
  repMonthChannelRows: SalesPerformanceRepMonthChannelRow[];
  dealAuditRows: SalesPerformanceDealAuditRow[];
  errors: string[];
};

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
  activeCustomerRefs?: Array<{
    customerId: string;
    email: string | null;
    emailDomain: string | null;
  }>;
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
  bankCash?: number;
  treasuryCash?: number;
  totalCash?: number;
  inflows30d: number;
  outflows30d: number;
  netCashFlow: number;
  runway: number;
  burnRate: number;
}

export interface MercuryTransactionData {
  id: string;
  postedAt: string | null;
  amount: number;
  kind: string | null;
  mercuryCategory: string | null;
  description: string | null;
  counterpartyName: string | null;
  bankDescription?: string | null;
  note?: string | null;
}

export interface MercuryData {
  accounts: AccountBalance[];
  cashFlow: CashFlowMetrics;
  transactions?: MercuryTransactionData[];
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

export interface InstagramTopPost {
  id: string;
  message: string;
  reach: number;
  engagement: number;
  createdAt: string;
  mediaType: string;
  mediaProductType: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  likeCount: number;
  commentCount: number;
  performanceScore: number;
  engagementRate: number;
  ageInDays: number;
  engagementVelocity: number;
  captionLength: number;
  hashtagCount: number;
  mentionCount: number;
  emojiCount: number;
  hasQuestionHook: boolean;
  hasCallToAction: boolean;
  postedTimeBucket: "morning" | "afternoon" | "evening" | "overnight";
  isVideo: boolean;
  isReel: boolean;
  isCarousel: boolean;
  creativeSummary?: string | null;
  hasPersonVisible?: boolean | null;
  hasTextOverlayVisible?: boolean | null;
  looksLikeShopFloor?: boolean | null;
  looksLikeProductDemo?: boolean | null;
  looksEducational?: boolean | null;
  looksPromotional?: boolean | null;
  performanceDrivers?: Array<{
    key: string;
    label: string;
    source: "metadata" | "ai_visual";
    sampled: boolean;
    confidence: "low" | "medium" | "high";
    liftPct: number;
  }>;
  nextTests?: Array<{
    key: string;
    label: string;
    action: "add" | "reduce";
    source: "metadata" | "ai_visual";
    sampled: boolean;
    confidence: "low" | "medium" | "high";
    estimatedImpactPct: number;
  }>;
}

export interface InstagramAttributeCorrelation {
  key: string;
  label: string;
  source: "metadata" | "ai_visual";
  correlation: number;
  sampleSize: number;
  comparisonSampleSize: number;
  eligiblePostCount: number;
  coveragePct: number;
  trueAvgEngagement: number;
  falseAvgEngagement: number;
  liftPct: number;
  sampled: boolean;
  confidence: "low" | "medium" | "high";
  confidenceScore: number;
  interpretation: string;
}

export interface InstagramData {
  followers: number;
  reach30d: number;
  engagement30d: number;
  traffic: number;
  bounceRate: number;
  clicks: number;
  returningVisitors: number;
  topPosts: InstagramTopPost[];
  topVideos?: InstagramTopPost[];
  videosToImprove?: InstagramTopPost[];
  mediaTypeBreakdown?: {
    image: number;
    video: number;
    reel: number;
    carousel: number;
    other: number;
  };
  creativeAnalysis?: {
    analyzedVideos: number;
    totalVideoCandidates: number;
    sampled: boolean;
  };
  opportunities?: Array<{
    key: string;
    label: string;
    source: "metadata" | "ai_visual";
    sampled: boolean;
    confidence: "low" | "medium" | "high";
    estimatedImpactPct: number;
    adoptionPct: number;
  }>;
  experimentPlan?: Array<{
    key: string;
    title: string;
    brief: string;
    action: "add" | "reduce";
    source: "metadata" | "ai_visual";
    sampled: boolean;
    confidence: "low" | "medium" | "high";
    estimatedImpactPct: number;
    supportingVideos: number;
    exampleVideos: string[];
  }>;
  testBacklog?: Array<{
    key: string;
    label: string;
    action: "add" | "reduce";
    source: "metadata" | "ai_visual";
    sampled: boolean;
    confidence: "low" | "medium" | "high";
    estimatedImpactPct: number;
    supportingVideos: number;
  }>;
  attributeCorrelations?: InstagramAttributeCorrelation[];
  winningPatterns?: Array<{
    title: string;
    detail: string;
    source: "metadata" | "ai_visual";
    sampled: boolean;
    confidence: "low" | "medium" | "high";
  }>;
  losingPatterns?: Array<{
    title: string;
    detail: string;
    source: "metadata" | "ai_visual";
    sampled: boolean;
    confidence: "low" | "medium" | "high";
  }>;
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

export interface WebflowPageDetail {
  id: string;
  title: string;
  slug: string;
  createdOn: string | null;
  updatedOn: string | null;
  draft: boolean;
  archived: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  openGraphImageUrl: string | null;
}

export interface WebflowCollectionDetail {
  id: string;
  displayName: string;
  slug: string;
  itemCount: number;
  createdOn: string | null;
}

export interface WebflowFormTrendEntry {
  date: string;
  submissions: number;
}

export interface WebflowSeoAudit {
  totalPages: number;
  pagesWithSeoTitle: number;
  pagesWithSeoDescription: number;
  pagesWithOgImage: number;
  seoScore: number;
}

export interface WebflowContentFreshness {
  updatedLast7d: number;
  updatedLast30d: number;
  updatedLast90d: number;
  staleOver90d: number;
}

export interface WebflowData {
  siteName: string;
  lastPublished: string;
  totalPages: number;
  totalCollections: number;
  formSubmissions: WebflowFormEntry[];
  customDomains: string[];

  publishedPages: number;
  draftPages: number;
  archivedPages: number;
  pages: WebflowPageDetail[];
  seoAudit: WebflowSeoAudit;
  contentFreshness: WebflowContentFreshness;
  recentlyUpdatedPages: WebflowPageDetail[];

  collections: WebflowCollectionDetail[];
  totalCmsItems: number;
  emptyCollections: number;

  formTrend: WebflowFormTrendEntry[];
  totalFormSubmissions: number;

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
  downloadsDaily: Array<{ date: string; count: number }>;
  downloadersDaily: Array<{ date: string; count: number }>;
}

export interface HubSpotContactSummary {
  id: string;
  recordUrl: string;
  name: string | null;
  jobTitle: string | null;
  company: string | null;
}
export type CodaLeadFunnelStatus = "inFunnel" | "notInFunnel" | "unknown";

export type StripeSubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "paused"
  | "canceled"
  | "none"
  | "unknown";

export interface StripeEmailEnrichment {
  matched: boolean;
  customerId: string | null;
  customerCount: number;
  customerUrl: string | null;
  subscriptionStatus: StripeSubscriptionStatus;
  mrr: number | null;
  paid12mo: number | null;
  lastPaymentAt: string | null;
}

export interface CodaEngagedLeadCandidate {
  creator: string;
  email: string;
  cards30d: number;
  activeDays30d: number;
  lastActivityAt: string | null;
  trend30dVsPrevious30d: number | null;
  engagementScore: number;
  reasons: string[];
  funnelStatus: string;
  hubspotSearchUrl: string;
  hubspotContact?: HubSpotContactSummary | null;
}

export interface CodaRecentSubmitter {
  creator: string;
  email: string;
  cardsCreated: number;
  firstSubmittedAt: string | null;
  lastSubmittedAt: string | null;
  hubspotContact: HubSpotContactSummary | null;
  hubspotStatus: CodaLeadFunnelStatus;
  hubspotSearchUrl: string;
  stripe?: StripeEmailEnrichment | null;
}

export interface CodaDiagnostics {
  creatorResolutionMode: "override" | "auto_detect" | "unknown_heavy";
  unknownCreatorRatio: number;
  unknownCardCount: number;
  hubspotMatchingErrors: number;
}

export interface CodaKanbanFunnelStage {
  key: "submissions" | "cardsCreated" | "cardsCompleted";
  label: string;
  count: number;
}

export interface CodaKanbanFunnelConversion {
  from: CodaKanbanFunnelStage["key"];
  to: CodaKanbanFunnelStage["key"];
  ratePct: number | null;
}

export interface CodaKanbanDropoffStatus {
  status: string;
  count: number;
  sharePct: number;
}

export interface CodaKanbanFunnel {
  stages: CodaKanbanFunnelStage[];
  conversions: CodaKanbanFunnelConversion[];
  topDropOffStatuses: CodaKanbanDropoffStatus[];
}

export interface CodaKanbanData {
  totalCards: number;
  cardsByStatus: { status: string; count: number }[];
  recentCards: CodaCard[];
  creatorWindows?: CodaCreatorWindow[];
  newCreatorFeed?: CodaNewCreatorFeedEntry[];
  trends?: CodaCreatorTrends;
  funnel?: CodaKanbanFunnel;
  engagedLeadCandidates?: CodaEngagedLeadCandidate[];
  rangeSummary?: {
    from: string;
    to: string;
    cardsCreated: number;
    submissions: number;
    unknownEmailCards: number;
    downloadsPrev?: number;
    downloadersPrev?: number;
    downloadsDeltaPct?: number | null;
    downloadersDeltaPct?: number | null;
  };
  recentSubmitters?: CodaRecentSubmitter[];
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
  | "website-traffic"
  | "social-media"
  | "finance"
  | "sales-pipeline"
  | "retention"
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
  | "mercury"
  // Synthetic channels derived from HubSpot contact analytics (pre-HubSpot).
  | "paid-search"
  | "paid-social"
  | "organic-search"
  | "referral"
  | "direct"
  | "email"
  | "partner"
  | "outbound";

export type TouchpointType =
  | "first-touch"
  | "engagement"
  | "conversion"
  | "support"
  | "expansion";

export type BuyerJourneyPhase =
  | "awareness"
  | "website"
  | "crm"
  | "revenue"
  | "retention";

export interface Touchpoint {
  timestamp: string;
  phase?: BuyerJourneyPhase;
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
  stageHistory?: Array<{ occurredAt: string; stageId: string; stageLabel: string }>;
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
  kanbanCards: number;
  freeTrials: number;
  demos: number;
  avgDaysToClose: number;
  avgValue: number;
}

export interface ChannelAttribution {
  channel: TouchpointChannel;
  traffic: number | null;
  cost: number | null;
  firstTouchDeals: number;
  assistedDeals: number;
  lastTouchDeals: number;
  kanbanCards: number;
  freeTrials: number;
  demos: number;
  totalRevenue: number;
  avgDealValue: number;
  roi: number | null;
}

export interface CustomerJourneyData {
  journeys: CustomerJourneyRecord[];
  touchpointSummary: TouchpointSummary[];
  avgTouchpoints: number;
  medianDaysToClose: number;
  topPaths: JourneyPath[];
  attribution: ChannelAttribution[];
  stageOrder?: string[];
  stageOrderSource?: "pipeline" | "fallback";
}

// ══════════════════════════════════════════════════════════
// VISITOR FUNNEL TYPES
// ══════════════════════════════════════════════════════════

export type EnrichmentProvider = "unify" | "clay" | "rb2b";

export type VisitorFunnelStageId =
  | "visitors"
  | "identified"
  | "demo_booked"
  | "kanban_card_created"
  | "trial_started"
  | "paid_customer";

export type VisitorLinkProvenance = "exact" | "inferred" | "backfilled";

export interface VisitorMilestone {
  stage: Exclude<VisitorFunnelStageId, "visitors">;
  occurredAt: string | null;
}

export interface VisitorFunnelStageCount {
  stage: VisitorFunnelStageId;
  label: string;
  count: number;
  conversionFromVisitors: number | null;
  conversionFromPrevious: number | null;
}

export interface VisitorFunnelTrendPoint {
  week: string;
  visitors: number;
  identified: number;
  demo_booked: number;
  kanban_card_created: number;
  trial_started: number;
  paid_customer: number;
}

export interface VisitorFunnelBreakdownRow {
  key: string;
  visitors: number;
  identified: number;
  demoBooked: number;
  kanbanCards: number;
  trialsStarted: number;
  paidCustomers: number;
}

export interface VisitorFunnelOverlap {
  key: string;
  count: number;
}

export interface VisitorFunnelIdentitySummary {
  type: string;
  value: string;
  provider: string;
  provenance: VisitorLinkProvenance;
  confidence: number;
}

export interface VisitorFunnelProviderEvidence {
  provider: string;
  accepted: boolean;
  signalCount: number;
}

export interface VisitorFunnelEnrichmentProviderStatus {
  provider: EnrichmentProvider;
  label: string;
  deliveryMode: "cron_pull" | "webhook_push";
  endpointPath: string;
  authConfigured: boolean;
  syncConfigured: boolean;
  syncEnabled: boolean;
  totalSignals: number;
  acceptedSignals: number;
  acceptedRate: number | null;
  lastSignalAt: string | null;
  lastAcceptedAt: string | null;
  stale: boolean;
  note: string;
}

export interface VisitorFunnelEnrichmentAlert {
  id: string;
  provider: EnrichmentProvider;
  providerLabel: string;
  severity: "warning" | "critical";
  kind: "stale" | "misconfigured";
  title: string;
  message: string;
  lastSignalAt: string | null;
}

export interface VisitorFunnelRecord {
  visitorId: string;
  anonymousId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  firstTouchSource: string | null;
  firstTouchChannel: string | null;
  firstTouchCampaign: string | null;
  firstTouchReferrer: string | null;
  landingPath: string | null;
  identified: boolean;
  deepestStage: VisitorFunnelStageId;
  milestones: VisitorMilestone[];
  identities?: VisitorFunnelIdentitySummary[];
  providers?: VisitorFunnelProviderEvidence[];
}

export interface VisitorFunnelFilters {
  channel: string;
  source: string | null;
  campaign: string | null;
  stage: VisitorFunnelStageId | "all";
  knownOnly: boolean;
  quickFilter: "all" | "reddit";
}

export interface VisitorFunnelData {
  filters: VisitorFunnelFilters;
  stages: VisitorFunnelStageCount[];
  trends: VisitorFunnelTrendPoint[];
  channelBreakdown: VisitorFunnelBreakdownRow[];
  sourceBreakdown: VisitorFunnelBreakdownRow[];
  campaignBreakdown: VisitorFunnelBreakdownRow[];
  overlaps: VisitorFunnelOverlap[];
  availableChannels: string[];
  availableSources: string[];
  availableCampaigns: string[];
  totals: {
    visitors: number;
    identified: number;
    demoBooked: number;
    kanbanCards: number;
    trialsStarted: number;
    paidCustomers: number;
  };
  recordsApi: {
    href: string;
    adminOnly: boolean;
  };
  secondaryMetrics: {
    closedWonCount: number;
  };
  enrichmentStatus: {
    adminOnly: boolean;
    providers: VisitorFunnelEnrichmentProviderStatus[];
    alerts: VisitorFunnelEnrichmentAlert[];
  };
}

// ══════════════════════════════════════════════════════════
// DEMO ANALYTICS TYPES
// ══════════════════════════════════════════════════════════

export type DemoOutcome = "completed" | "no-show" | "rescheduled" | "pending" | "unknown";
export type DemoTranscriptStatus = "matched" | "unmatched" | "missing";
export type DemoAnalysisStatus = "ready" | "pending" | "missing";
export type DemoOutcomeConfidence = "low" | "medium" | "high";

export interface DemoRecord {
  dealId: string;
  dealName: string;
  ownerName: string | null;
  contactEmail: string | null;
  scheduledAt: string;
  meetingId: string | null;
  meetingTitle: string | null;
  meetingEndAt: string | null;
  meetingStatus: string | null;
  isUpcoming: boolean;
  isUnscheduledFallback: boolean;
  source: string;
  outcome: DemoOutcome;
  followUpSent: boolean;
  daysToNextStage: number | null;
  resultingStage: string | null;
  transcriptStatus: DemoTranscriptStatus;
  transcriptMatchConfidence: number | null;
  transcriptSourceUrl: string | null;
  transcriptSourceTitle: string | null;
  transcriptSourceDocumentId: string | null;
  transcriptText: string | null;
  analysisStatus: DemoAnalysisStatus;
  qualityScore: number | null;
  qualitySummary: string | null;
  strengths: string[];
  gaps: string[];
  nextSteps: string[];
  customerSignals: string[];
  outcomeConfidence: DemoOutcomeConfidence | null;
  coachingMemo: string | null;
  nextStepMemo: string | null;
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
  upcomingCount: number;
  meetingBackedUpcomingCount: number;
  unscheduledDemoCount: number;
  analyzedDemoCount: number;
  avgDemoQualityScore: number;
  transcriptCoveragePct: number;
  topStrengthThemes: Array<{ label: string; count: number }>;
  topGapThemes: Array<{ label: string; count: number }>;
  demos: DemoRecord[];
  upcomingDemos: DemoRecord[];
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

export interface FinanceBudgetActualMetric {
  category: string;
  budgeted: number;
  actual: number;
  variance: number;
  variancePct: number;
  status: "under" | "on_track" | "over";
}

export interface FinanceBudgetActualsMetric {
  budgetId: string;
  budgetName: string;
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
  totalVariancePct: number;
  overspendCategories: string[];
  items: FinanceBudgetActualMetric[];
}

export interface AnalyticsKpis {
  traffic: {
    bounceRatePct: number;
    pagesPerSession: number;
    engagementScore: number;
    pageDepthScore: number;
  };
  finance: {
    mrr: number;
    paymentSuccessPct: number;
  };
}

export interface AnalyticsMetricsLayer {
  kpis: AnalyticsKpis;
  finance: {
    budgetActuals: FinanceBudgetActualsMetric | null;
  };
}

export interface FinancialPlanningData {
  budgets: BudgetData[];
  activeBudget: BudgetData | null;
  forecasts: ForecastScenarioData[];
  goals: FinancialGoalData[];
  pnl: ProfitAndLoss | null;
  unitEconomics: UnitEconomics | null;
  subscriptionOverview: {
    mergedActiveSubscriptions: number;
    stripeActiveSubscriptions: number;
    hubspotActiveSubscriptions: number;
    stripeMrr: number;
    hubspotSubscriptionMrr: number;
    hubspotOnlySubscriptionMrr: number;
    excludedLinkedHubspotSubscriptionMrr: number;
    totalMrr: number;
    totalArr: number;
  } | null;
}

// ══════════════════════════════════════════════════════════
// COMBINED DASHBOARD
// ══════════════════════════════════════════════════════════

export type KpiDeltaDirection = "up" | "down" | "flat";

export interface KpiDelta {
  current: number | null;
  previous: number | null;
  delta: number | null;
  deltaPct: number | null;
  direction: KpiDeltaDirection;
  dataRecency: {
    currentCapturedAt: string | null;
    previousCapturedAt: string | null;
  };
}

export interface AnalyticsKpiDeltas {
  traffic: {
    bounceRatePct: KpiDelta;
    pagesPerSession: KpiDelta;
  };
  finance: {
    mrr: KpiDelta;
    paymentSuccessPct: KpiDelta;
  };
}

export interface AnalyticsDashboardData {
  hubspot: HubSpotData | null;
  salesPerformance: SalesPerformancePack | null;
  stripe: StripeData | null;
  mercury: MercuryData | null;
  googleAnalytics: GAData | null;
  ga?: GAData | null;
  googleAds: GoogleAdsData | null;
  metaAds: MetaAdsData | null;
  metaPage: MetaPageData | null;
  instagram?: InstagramData | null;
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
  visitorFunnel: VisitorFunnelData | null;
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
  metrics?: AnalyticsMetricsLayer | null;
  kpis?: AnalyticsKpis;
  deltas?: AnalyticsKpiDeltas;
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
  | "marketing";

export interface TabConfig {
  id: AnalyticsTab;
  label: string;
  description: string;
}

export const ANALYTICS_TABS: TabConfig[] = [
  { id: "overview", label: "Overview", description: "Key metrics at a glance" },
  { id: "sales", label: "Sales & Pipeline", description: "HubSpot deals & conversions" },
  { id: "finance", label: "Revenue & Finance", description: "Stripe MRR & Mercury cash" },
  { id: "marketing", label: "Website Traffic", description: "Legacy alias that redirects to website traffic analytics" },
];
