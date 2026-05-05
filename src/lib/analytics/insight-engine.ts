import type {
  AiInsight,
  AiInsightsBundle,
  AnalyticsDashboardData,
  AnalyticsSectionId,
  DistilledInsight,
} from "@/lib/analytics/types";
import { computeBudgetActuals, computeBudgetSummary } from "./budget-variance";
import { buildDefaultScenarios } from "./forecast-engine";
import { normalizePercentValue } from "./percentage-utils";
import { buildProfitAndLoss } from "./pnl-builder";
import { computeUnitEconomics } from "./unit-economics";

const SECTION_ORDER: AnalyticsSectionId[] = [
  "website-traffic",
  "social-media",
  "finance",
  "sales-pipeline",
  "customer-success",
  "customer-journey",
  "demo-analytics",
  "process-analytics",
];

const SEVERITY_RANK: Record<AiInsight["severity"], number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

function clampConfidence(value: number): number {
  return Math.max(0.1, Math.min(0.99, Math.round(value * 100) / 100));
}

function toPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function toDelta(current: number, previous: number): string {
  if (previous <= 0) return "n/a";
  const delta = ((current - previous) / previous) * 100;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

function sortInsights(items: AiInsight[]): AiInsight[] {
  return [...items].sort((a, b) => {
    if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
      return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    }
    return b.confidence - a.confidence;
  });
}

// ── Website Traffic + Social Media ───────────────────────

function buildAdsInsights(data: AnalyticsDashboardData): AiInsight[] {
  const insights: AiInsight[] = [];
  const bounce = data.googleAnalytics?.bounceRate ?? 0;
  const sessionsCurrent = data.googleAnalytics?.sessions30d ?? 0;
  const sessionsPrev = data.googleAnalytics?.sessionsPrev30d ?? 0;
  const gClicks = data.googleAds?.totalClicks ?? 0;
  const mClicks = data.metaAds?.totalClicks ?? 0;
  const rClicks = data.redditAds?.totalClicks ?? 0;
  const totalClicks = gClicks + mClicks + rClicks;
  const totalConversions = (data.googleAds?.totalConversions ?? 0) + (data.metaAds?.totalConversions ?? 0);
  const clickToConv = totalClicks > 0 ? totalConversions / totalClicks : 0;
  const hasAdsSignals = Boolean(data.googleAnalytics) || totalClicks > 0 || totalConversions > 0;
  const dailyTrend = data.googleAnalytics?.dailyTrend ?? [];
  const sessionTrendValues = dailyTrend.map((d) => d.sessions);
  const adsStale = data.staleDomains.includes("googleAnalytics") || data.staleDomains.includes("googleAds") || data.staleDomains.includes("metaAds");

  if (!hasAdsSignals) return insights;

  // 1. Bounce rate alarm
  if (bounce > 0.55) {
    insights.push({
      id: "ai-ads-bounce-rate",
      section: "website-traffic",
      subsectionId: "ads-google-analytics",
      severity: bounce > 0.65 ? "critical" : "warning",
      title: "High bounce rate signals landing page mismatch",
      why: `Bounce rate is ${toPct(bounce)}, suggesting visitors don't find what they expect from ad creatives.`,
      confidence: clampConfidence(0.87),
      expectedImpact: "Reducing bounce rate by 10pp can improve conversion volume 15-25%.",
      stale: adsStale,
      evidence: [
        {
          source: "Google Analytics",
          domain: "googleAnalytics",
          metric: "Bounce Rate",
          value: toPct(bounce),
          delta: toDelta(sessionsCurrent, sessionsPrev),
          trendValues: sessionTrendValues.length > 0 ? sessionTrendValues : undefined,
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Audit top 5 landing pages for message match",
          payload: { title: "Landing page message-match audit", priority: "P1", status: "QUEUED" },
        },
      ],
    });
  }

  // 2. Click-to-conversion degradation
  if (totalClicks > 100 && clickToConv < 0.02) {
    insights.push({
      id: "ai-ads-click-conv",
      section: "social-media",
      severity: clickToConv < 0.015 ? "critical" : "warning",
      title: "Click-to-conversion rate below efficient threshold",
      why: `Across all paid channels: ${(clickToConv * 100).toFixed(2)}% conversion rate on ${totalClicks.toLocaleString()} clicks.`,
      confidence: clampConfidence(0.85),
      expectedImpact: "Improving conversion rate to 2%+ recovers wasted ad spend within 2-4 weeks.",
      stale: adsStale,
      evidence: [
        {
          source: "Google Ads + Meta Ads",
          domain: "googleAds/metaAds",
          metric: "Click-to-Conversion",
          value: `${(clickToConv * 100).toFixed(2)}%`,
          delta: `${totalConversions} conversions / ${totalClicks} clicks`,
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Create paid-landing relevance sprint",
          payload: { title: "Tighten ad to landing message match", priority: "P1", status: "QUEUED" },
        },
        {
          type: "assign_owner",
          label: "Assign demand gen owner for channel triage",
          payload: { role: "demand-gen" },
        },
      ],
    });
  }

  // 3. Declining sessions
  if (sessionsPrev > 0 && sessionsCurrent < sessionsPrev * 0.85) {
    const dropPct = ((sessionsPrev - sessionsCurrent) / sessionsPrev * 100).toFixed(1);
    insights.push({
      id: "ai-ads-session-decline",
      section: "website-traffic",
      subsectionId: "ads-google-analytics",
      severity: sessionsCurrent < sessionsPrev * 0.7 ? "critical" : "warning",
      title: "Session volume declining period-over-period",
      why: `Sessions dropped ${dropPct}% from ${sessionsPrev.toLocaleString()} to ${sessionsCurrent.toLocaleString()}.`,
      confidence: clampConfidence(0.82),
      expectedImpact: "Reversing traffic decline prevents pipeline starvation in the next cycle.",
      stale: data.staleDomains.includes("googleAnalytics"),
      evidence: [
        {
          source: "Google Analytics",
          domain: "googleAnalytics",
          metric: "Sessions (30d)",
          value: sessionsCurrent.toLocaleString(),
          delta: toDelta(sessionsCurrent, sessionsPrev),
          trendValues: sessionTrendValues.length > 0 ? sessionTrendValues : undefined,
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Investigate traffic decline root cause",
          payload: { title: "Traffic decline investigation", priority: "P1", status: "QUEUED" },
        },
      ],
    });
  }

  // 4. Per-platform CPA comparison (flag when one platform's CPA is 2x+ another)
  const gSpend = data.googleAds?.totalSpend30d ?? 0;
  const mSpend = data.metaAds?.totalSpend30d ?? 0;
  const gConv = data.googleAds?.totalConversions ?? 0;
  const mConv = data.metaAds?.totalConversions ?? 0;
  const gCPA = gConv > 0 ? gSpend / gConv : 0;
  const mCPA = mConv > 0 ? mSpend / mConv : 0;
  if (gCPA > 0 && mCPA > 0 && (gCPA > mCPA * 2 || mCPA > gCPA * 2)) {
    const expensive = gCPA > mCPA ? "Google Ads" : "Meta Ads";
    const cheap = gCPA > mCPA ? "Meta Ads" : "Google Ads";
    const expCPA = gCPA > mCPA ? gCPA : mCPA;
    const cheapCPA = gCPA > mCPA ? mCPA : gCPA;
    insights.push({
      id: "ai-ads-cpa-disparity",
      section: "social-media",
      severity: "warning",
      title: `${expensive} CPA is ${(expCPA / cheapCPA).toFixed(1)}x higher than ${cheap}`,
      why: `${expensive} CPA: $${expCPA.toFixed(0)} vs ${cheap} CPA: $${cheapCPA.toFixed(0)}. Budget reallocation could improve overall efficiency.`,
      confidence: clampConfidence(0.79),
      expectedImpact: "Rebalancing budget toward efficient channels can reduce blended CPA 20-30%.",
      stale: adsStale,
      evidence: [
        {
          source: expensive,
          domain: gCPA > mCPA ? "googleAds" : "metaAds",
          metric: "CPA",
          value: `$${expCPA.toFixed(0)}`,
          delta: `${gCPA > mCPA ? gConv : mConv} conversions`,
        },
        {
          source: cheap,
          domain: gCPA > mCPA ? "metaAds" : "googleAds",
          metric: "CPA",
          value: `$${cheapCPA.toFixed(0)}`,
          delta: `${gCPA > mCPA ? mConv : gConv} conversions`,
        },
      ],
      actions: [
        {
          type: "create_task",
          label: `Review ${expensive} campaign targeting`,
          payload: { title: `${expensive} CPA audit and budget rebalance`, priority: "P2", status: "QUEUED" },
        },
      ],
    });
  }

  // 5. SEO Dependency (Semrush)
  const organicTraffic = data.semrush?.organicTraffic ?? 0;
  const organicKw = data.semrush?.organicKeywords ?? 0;
  const paidKw = data.semrush?.paidKeywords ?? 0;

  if (organicTraffic > 100 && organicTraffic < sessionsCurrent * 0.1) {
    insights.push({
      id: "ai-ads-seo-underperforming",
      section: "website-traffic",
      severity: "warning",
      title: "Organic search heavily underperforming relative to overall traffic",
      why: `Organic traffic is only ${toPct(organicTraffic / sessionsCurrent)} of total sessions (${organicTraffic} out of ${sessionsCurrent}). High paid dependency.`,
      confidence: clampConfidence(0.85),
      expectedImpact: "Scaling SEO can significantly reduce blended customer acquisition cost over 6-12 months.",
      stale: data.staleDomains.includes("semrush") || data.staleDomains.includes("googleAnalytics"),
      evidence: [
        {
          source: "Semrush",
          domain: "semrush",
          metric: "Organic Share",
          value: toPct(organicTraffic / sessionsCurrent),
          delta: `${organicKw} ranking keywords`,
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Audit technical SEO and content gaps",
          payload: { title: "Technical SEO and Content Gap Audit", priority: "P2", status: "QUEUED" },
        },
      ],
    });
  } else if (organicKw > 0 && paidKw > organicKw * 2) {
    insights.push({
      id: "ai-ads-paid-heavy",
      section: "website-traffic",
      severity: "warning",
      title: "Over-reliance on Paid Keywords vs Organic",
      why: `Bidding on ${paidKw} keywords but only ranking organically for ${organicKw}. Missing opportunity to capture free traffic for proven terms.`,
      confidence: clampConfidence(0.82),
      expectedImpact: "Building content for top-converting paid keywords can eliminate those ad costs permanently.",
      stale: data.staleDomains.includes("semrush"),
      evidence: [
        {
          source: "Semrush",
          domain: "semrush",
          metric: "Keywords",
          value: `${paidKw} paid / ${organicKw} org`,
          delta: "Paid terms outnumber organic 2:1",
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Map converting paid keywords to content plan",
          payload: { title: "Paid-to-Organic Content Strategy", priority: "P2", status: "QUEUED" },
        },
      ],
    });
  }

  // 6. Webflow Conversion (Webflow)
  const submissions = data.webflow?.formSubmissions?.length ?? 0;
  const pages = data.webflow?.totalPages ?? 0;
  if (sessionsCurrent > 500 && submissions === 0 && pages > 0) {
    insights.push({
      id: "ai-ads-webflow-zero-conv",
      section: "website-traffic",
      severity: "critical",
      title: "0 form submissions despite meaningful traffic",
      why: `The site generated ${sessionsCurrent} sessions but recorded 0 form submissions in Webflow.`,
      confidence: clampConfidence(0.9),
      expectedImpact: "Fixing broken forms immediately restores inbound lead flow.",
      stale: data.staleDomains.includes("webflow") || data.staleDomains.includes("googleAnalytics"),
      evidence: [
        {
          source: "Webflow",
          domain: "webflow",
          metric: "Form Submissions",
          value: "0",
          delta: `${sessionsCurrent} sessions`,
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Test all Webflow forms for functionality",
          payload: { title: "Urgent: Webflow form QA", priority: "P0", status: "WORKING_ON_TODAY" },
        },
      ],
    });
  }

  return insights;
}

// ── Finance ──────────────────────────────────────────────

function buildFinanceInsights(data: AnalyticsDashboardData): AiInsight[] {
  const insights: AiInsight[] = [];
  const runway = data.mercury?.cashFlow?.runway ?? 0;
  const revenueGrowth = data.stripe?.revenue?.revenueGrowth ?? 0;
  const burnRate = data.mercury?.cashFlow?.burnRate ?? 0;
  const churnRate = normalizePercentValue(data.stripe?.subscriptions?.churnRate ?? 0);
  const paymentSuccessRate = normalizePercentValue(data.stripe?.payments?.successRate ?? 1);
  const mrrChange = data.stripe?.revenue?.mrrChange ?? 0;
  const revenueTrend = data.stripe?.revenueTrend ?? [];
  const revenueTrendValues = revenueTrend.map((t) => t.revenue);
  const financeStale = data.staleDomains.includes("mercury") || data.staleDomains.includes("stripe");

  // 1. Runway risk
  if (runway > 0 && runway < 6) {
    insights.push({
      id: "ai-finance-runway",
      section: "finance",
      subsectionId: "finance-mercury",
      severity: runway < 4 ? "critical" : "warning",
      title: "Runway risk requires near-term correction",
      why: `Estimated runway is ${runway.toFixed(1)} months with burn rate ${burnRate.toFixed(0)} and revenue growth ${revenueGrowth.toFixed(1)}%.`,
      confidence: clampConfidence(0.92),
      expectedImpact: "Extending runway by 1-2 months through spend reprioritization and revenue acceleration.",
      stale: financeStale,
      evidence: [
        {
          source: "Mercury",
          domain: "mercury",
          metric: "Runway",
          value: `${runway.toFixed(1)} months`,
          delta: `Burn ${burnRate.toFixed(0)}/month`,
        },
        {
          source: "Stripe",
          domain: "stripe",
          metric: "Revenue Growth",
          value: `${revenueGrowth.toFixed(1)}%`,
          delta: `${(data.stripe?.revenue?.totalRevenue30d ?? 0).toFixed(0)} current period`,
          trendValues: revenueTrendValues.length > 0 ? revenueTrendValues : undefined,
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Create 30-day runway protection plan",
          payload: { title: "Runway protection and collections plan", priority: "P0", status: "WORKING_ON_TODAY" },
        },
        {
          type: "create_automation_from_template",
          label: "Enable HubSpot stage checklist automation",
          payload: { templateKey: "hubspot-stage-checklist" },
        },
      ],
    });
  }

  // 2. Churn rate alarm
  if (churnRate > 8) {
    insights.push({
      id: "ai-finance-churn",
      section: "finance",
      subsectionId: "finance-stripe",
      severity: churnRate > 12 ? "critical" : "warning",
      title: "Subscription churn rate exceeds healthy threshold",
      why: `Churn rate is ${churnRate.toFixed(1)}% — above the 8% warning threshold. ${data.stripe?.subscriptions?.canceled ?? 0} cancellations in period.`,
      confidence: clampConfidence(0.88),
      expectedImpact: "Reducing churn by 2-3pp directly improves MRR retention and LTV.",
      stale: data.staleDomains.includes("stripe"),
      evidence: [
        {
          source: "Stripe",
          domain: "stripe",
          metric: "Churn Rate",
          value: `${churnRate.toFixed(1)}%`,
          delta: `${data.stripe?.subscriptions?.canceled ?? 0} canceled`,
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Build churn cohort analysis",
          payload: { title: "Churn analysis and retention playbook", priority: "P1", status: "QUEUED" },
        },
      ],
    });
  }

  // 3. Payment failure warning
  if (paymentSuccessRate < 90) {
    insights.push({
      id: "ai-finance-payment-failures",
      section: "finance",
      subsectionId: "finance-stripe",
      severity: paymentSuccessRate < 80 ? "critical" : "warning",
      title: "Payment failure rate is eroding collected revenue",
      why: `Payment success rate is ${paymentSuccessRate.toFixed(1)}% — ${data.stripe?.payments?.failed ?? 0} failed of ${(data.stripe?.payments?.succeeded ?? 0) + (data.stripe?.payments?.failed ?? 0)} attempts.`,
      confidence: clampConfidence(0.90),
      expectedImpact: "Smart retries and card updater can recover 30-50% of failed payments.",
      stale: data.staleDomains.includes("stripe"),
      evidence: [
        {
          source: "Stripe",
          domain: "stripe",
          metric: "Payment Success Rate",
          value: `${paymentSuccessRate.toFixed(1)}%`,
          delta: `${data.stripe?.payments?.failed ?? 0} failed`,
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Enable smart retry and dunning",
          payload: { title: "Payment recovery automation", priority: "P1", status: "QUEUED" },
        },
      ],
    });
  }

  // 4. MRR decline alert
  if (mrrChange < -5) {
    insights.push({
      id: "ai-finance-mrr-decline",
      section: "finance",
      subsectionId: "finance-stripe",
      severity: mrrChange < -10 ? "critical" : "warning",
      title: "MRR is contracting month-over-month",
      why: `MRR changed ${mrrChange.toFixed(1)}% — current MRR is $${(data.stripe?.revenue?.mrr ?? 0).toLocaleString()}.`,
      confidence: clampConfidence(0.86),
      expectedImpact: "Stabilizing MRR protects cash runway and signals product-market fit health.",
      stale: data.staleDomains.includes("stripe"),
      evidence: [
        {
          source: "Stripe",
          domain: "stripe",
          metric: "MRR Change",
          value: `${mrrChange.toFixed(1)}%`,
          delta: `$${(data.stripe?.revenue?.mrr ?? 0).toLocaleString()} current MRR`,
          trendValues: revenueTrendValues.length > 0 ? revenueTrendValues : undefined,
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Investigate MRR contraction drivers",
          payload: { title: "MRR contraction root cause analysis", priority: "P1", status: "QUEUED" },
        },
      ],
    });
  }

  // 5. Budget variance — flag overspend categories
  insights.push(...buildBudgetVarianceInsights(data, financeStale));

  // 6. Runway vs. forecast — conservative scenario warns early
  insights.push(...buildRunwayForecastInsights(data, financeStale));

  // 7. P&L margin erosion detection
  insights.push(...buildPnlMarginInsights(data, financeStale));

  // 8. Unit economics health check
  insights.push(...buildUnitEconomicsInsights(data, financeStale));

  // 9. Burn rate trend (rising burn outpacing revenue growth)
  insights.push(...buildBurnRateTrendInsights(data, financeStale));

  // 10. Revenue vs. forecast gap
  insights.push(...buildRevenueVsForecastInsights(data, financeStale));

  // 11. Expense growth outpacing revenue growth
  insights.push(...buildExpenseRevenueGrowthDivergenceInsights(data, financeStale));

  // 12. Multi-month revenue trend pattern detection
  insights.push(...buildRevenueTrendPatternInsights(data, financeStale));

  return insights;
}

// ── Financial Planning Sub-Insights ──────────────────────

function buildBudgetVarianceInsights(
  data: AnalyticsDashboardData,
  stale: boolean,
): AiInsight[] {
  const mercury = data.mercury;
  if (!mercury) return [];

  const items = computeBudgetActuals(mercury);
  const summary = computeBudgetSummary(items);

  if (summary.overspendCategories.length === 0) return [];

  const worstItem = items.reduce((a, b) =>
    b.variancePct > a.variancePct ? b : a,
  );
  const overCount = summary.overspendCategories.length;

  return [
    {
      id: "ai-finance-budget-variance",
      section: "finance",
      subsectionId: "finance-planning",
      severity: worstItem.variancePct > 25 || overCount >= 3 ? "critical" : "warning",
      title: `${overCount} expense ${overCount === 1 ? "category" : "categories"} over budget`,
      why: `${worstItem.category} is ${worstItem.variancePct.toFixed(1)}% over budget ($${worstItem.actual.toLocaleString()} vs $${worstItem.budgeted.toLocaleString()}). Total spend variance: ${summary.totalVariancePct.toFixed(1)}%.`,
      confidence: clampConfidence(0.84),
      expectedImpact: "Correcting overspend categories can save 10-20% on monthly operating expenses.",
      stale,
      evidence: [
        {
          source: "Budget Analysis",
          domain: "financePlanning",
          metric: "Worst Overspend",
          value: `${worstItem.category}: +${worstItem.variancePct.toFixed(1)}%`,
          delta: `$${Math.abs(worstItem.variance).toLocaleString()} over`,
        },
        {
          source: "Budget Analysis",
          domain: "financePlanning",
          metric: "Total Variance",
          value: `${summary.totalVariancePct.toFixed(1)}%`,
          delta: `${overCount} categories over budget`,
        },
      ],
      actions: [
        {
          type: "create_task",
          label: `Review ${worstItem.category} spend`,
          payload: {
            title: `Budget variance audit: ${worstItem.category}`,
            priority: "P1",
            status: "QUEUED",
          },
        },
      ],
    },
  ];
}

function buildRunwayForecastInsights(
  data: AnalyticsDashboardData,
  stale: boolean,
  ): AiInsight[] {
    if (!data.stripe && !data.mercury) return [];

    const scenarios = buildDefaultScenarios(data.stripe ?? null, data.mercury ?? null);
    const conservative = scenarios.find((s) => s.id === "default-conservative");
    const base = scenarios.find((s) => s.id === "default-base");

    if (!conservative || !base) return [];

    // Only alert when conservative scenario shows significantly shorter runway
    if (conservative.runwayMonths === null || base.runwayMonths === null) return [];
    const runwayGap = base.runwayMonths - conservative.runwayMonths;
    if (conservative.runwayMonths >= 12 || runwayGap < 3) return [];

    return [
      {
        id: "ai-finance-forecast-runway",
        section: "finance",
        subsectionId: "finance-forecast",
        severity: conservative.runwayMonths < 6 ? "critical" : "warning",
        title: "Conservative forecast shows shortened runway",
        why: `Under conservative assumptions (growth Δ ${conservative.assumptions.revenueGrowthRate.toFixed(0)}%, churn Δ ${conservative.assumptions.churnRateDelta.toFixed(0)}pp), runway drops to ${conservative.runwayMonths.toFixed(1)} months — ${runwayGap.toFixed(1)} months shorter than base case.`,
        confidence: clampConfidence(0.80),
        expectedImpact: "Scenario planning enables proactive cost cuts before runway becomes critical.",
        stale,
        evidence: [
          {
            source: "Forecast Engine",
            domain: "financeForecast",
            metric: "Conservative Runway",
            value: `${conservative.runwayMonths.toFixed(1)} months`,
            delta: `${runwayGap.toFixed(1)}mo shorter than base`,
          },
          {
            source: "Forecast Engine",
            domain: "financeForecast",
            metric: "Base Runway",
            value: `${base.runwayMonths.toFixed(1)} months`,
            delta: `growth Δ ${base.assumptions.revenueGrowthRate.toFixed(0)}%`,
          },
        ],
        actions: [
          {
            type: "create_task",
          label: "Create contingency cost-reduction plan",
          payload: {
            title: "Contingency plan for conservative runway scenario",
            priority: "P1",
            status: "QUEUED",
          },
        },
      ],
    },
  ];
}

function buildPnlMarginInsights(
  data: AnalyticsDashboardData,
  stale: boolean,
): AiInsight[] {
  if (!data.stripe && !data.mercury) return [];

  const pnl = buildProfitAndLoss(data.stripe ?? null, data.mercury ?? null);

  // Flag when operating margin is negative or gross margin is deteriorating
  if (pnl.operatingMargin >= 0 && pnl.grossMargin >= 60) return [];

  const insights: AiInsight[] = [];

  if (pnl.operatingMargin < -20) {
    insights.push({
      id: "ai-finance-pnl-operating-loss",
      section: "finance",
      subsectionId: "finance-pnl",
      severity: pnl.operatingMargin < -40 ? "critical" : "warning",
      title: "Operating margin deeply negative",
      why: `Operating margin is ${pnl.operatingMargin.toFixed(1)}% — expenses of $${Math.abs(pnl.netIncome).toLocaleString()} exceed revenue. Net loss: $${Math.abs(pnl.netIncome).toLocaleString()}.`,
      confidence: clampConfidence(0.88),
      expectedImpact: "Reaching breakeven or reducing losses extends runway and improves fundraising position.",
      stale,
      evidence: [
        {
          source: "P&L Statement",
          domain: "financePnl",
          metric: "Operating Margin",
          value: `${pnl.operatingMargin.toFixed(1)}%`,
          delta: `Net income: $${pnl.netIncome.toLocaleString()}`,
        },
        {
          source: "P&L Statement",
          domain: "financePnl",
          metric: "Gross Margin",
          value: `${pnl.grossMargin.toFixed(1)}%`,
          delta: `Previous net: $${pnl.previousNetIncome.toLocaleString()}`,
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Build path-to-breakeven model",
          payload: {
            title: "Operating margin improvement roadmap",
            priority: "P1",
            status: "QUEUED",
          },
        },
      ],
    });
  }

  if (pnl.grossMargin < 60 && pnl.grossMargin > 0) {
    insights.push({
      id: "ai-finance-pnl-gross-margin",
      section: "finance",
      subsectionId: "finance-pnl",
      severity: pnl.grossMargin < 40 ? "critical" : "warning",
      title: "Gross margin below SaaS benchmarks",
      why: `Gross margin is ${pnl.grossMargin.toFixed(1)}% — healthy SaaS companies target 60-80%. Low margin limits reinvestment capacity.`,
      confidence: clampConfidence(0.82),
      expectedImpact: "Improving gross margin by 10pp unlocks significant capital for growth investment.",
      stale,
      evidence: [
        {
          source: "P&L Statement",
          domain: "financePnl",
          metric: "Gross Margin",
          value: `${pnl.grossMargin.toFixed(1)}%`,
          delta: "Target: 60-80%",
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Audit COGS and hosting costs",
          payload: {
            title: "Gross margin optimization: reduce COGS",
            priority: "P2",
            status: "QUEUED",
          },
        },
      ],
    });
  }

  return insights;
}

function buildUnitEconomicsInsights(
  data: AnalyticsDashboardData,
  stale: boolean,
): AiInsight[] {
  if (!data.stripe) return [];

  const ue = computeUnitEconomics(
    data.stripe,
    data.mercury ?? null,
    data.hubspot ?? null,
  );

  const insights: AiInsight[] = [];

  // LTV:CAC ratio check — healthy is 3:1+, warning below 2:1
  if (ue.cac > 0 && ue.ltvCacRatio < 2) {
    insights.push({
      id: "ai-finance-ltv-cac",
      section: "finance",
      subsectionId: "finance-unit-economics",
      severity: ue.ltvCacRatio < 1 ? "critical" : "warning",
      title: "LTV:CAC ratio below efficient threshold",
      why: `LTV:CAC is ${ue.ltvCacRatio.toFixed(1)}x (LTV: $${ue.ltv.toLocaleString()}, CAC: $${ue.cac.toLocaleString()}). Healthy SaaS targets 3:1+. Payback: ${ue.paybackMonths.toFixed(1)} months.`,
      confidence: clampConfidence(0.83),
      expectedImpact: "Improving LTV:CAC to 3:1 through lower CAC or higher retention makes unit economics sustainable.",
      stale,
      evidence: [
        {
          source: "Unit Economics",
          domain: "financeUnitEconomics",
          metric: "LTV:CAC",
          value: `${ue.ltvCacRatio.toFixed(1)}x`,
          delta: `LTV $${ue.ltv.toLocaleString()} / CAC $${ue.cac.toLocaleString()}`,
        },
        {
          source: "Unit Economics",
          domain: "financeUnitEconomics",
          metric: "Payback Period",
          value: `${ue.paybackMonths.toFixed(1)} months`,
          delta: `ARPA: $${ue.arpa.toLocaleString()}`,
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Create unit economics improvement plan",
          payload: {
            title: "LTV:CAC optimization — reduce CAC or improve retention",
            priority: "P1",
            status: "QUEUED",
          },
        },
      ],
    });
  }

  // Long payback period — flag when > 18 months
  if (ue.paybackMonths > 18 && ue.cac > 0) {
    insights.push({
      id: "ai-finance-payback-long",
      section: "finance",
      subsectionId: "finance-unit-economics",
      severity: ue.paybackMonths > 24 ? "critical" : "warning",
      title: "CAC payback period exceeds healthy range",
      why: `Payback period is ${ue.paybackMonths.toFixed(1)} months — sustainable SaaS targets under 12-18 months. Long payback strains cash and limits growth investment.`,
      confidence: clampConfidence(0.79),
      expectedImpact: "Shortening payback by 6 months frees working capital for faster growth.",
      stale,
      evidence: [
        {
          source: "Unit Economics",
          domain: "financeUnitEconomics",
          metric: "Payback Period",
          value: `${ue.paybackMonths.toFixed(1)} months`,
          delta: "Target: <18 months",
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Review pricing and onboarding efficiency",
          payload: {
            title: "Payback period reduction sprint",
            priority: "P2",
            status: "QUEUED",
          },
        },
      ],
    });
  }

  return insights;
}

function buildBurnRateTrendInsights(
  data: AnalyticsDashboardData,
  stale: boolean,
): AiInsight[] {
  const burnRate = data.mercury?.cashFlow?.burnRate ?? 0;
  const revenueGrowth = data.stripe?.revenue?.revenueGrowth ?? 0;
  const mrr = data.stripe?.revenue?.mrr ?? 0;

  if (burnRate <= 0 || mrr <= 0) return [];

  // Burn-to-revenue ratio — unhealthy when burn > 2x revenue
  const burnRevenueRatio = burnRate / mrr;
  if (burnRevenueRatio <= 2) return [];

  return [
    {
      id: "ai-finance-burn-rate-trend",
      section: "finance",
      subsectionId: "finance-mercury",
      severity: burnRevenueRatio > 3 ? "critical" : "warning",
      title: "Burn rate significantly outpacing revenue",
      why: `Monthly burn ($${burnRate.toLocaleString()}) is ${burnRevenueRatio.toFixed(1)}x MRR ($${mrr.toLocaleString()}). Revenue growth at ${revenueGrowth.toFixed(1)}% may not close the gap fast enough.`,
      confidence: clampConfidence(0.86),
      expectedImpact: "Reducing burn-to-revenue ratio below 2x is critical for sustainable growth.",
      stale,
      evidence: [
        {
          source: "Mercury",
          domain: "mercury",
          metric: "Burn Rate",
          value: `$${burnRate.toLocaleString()}/mo`,
          delta: `${burnRevenueRatio.toFixed(1)}x MRR`,
        },
        {
          source: "Stripe",
          domain: "stripe",
          metric: "MRR",
          value: `$${mrr.toLocaleString()}`,
          delta: `Growth: ${revenueGrowth.toFixed(1)}%`,
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Create burn-reduction roadmap",
          payload: {
            title: "Burn rate reduction and efficiency plan",
            priority: "P0",
            status: "WORKING_ON_TODAY",
          },
        },
      ],
    },
  ];
}

function buildRevenueVsForecastInsights(
  data: AnalyticsDashboardData,
  stale: boolean,
  ): AiInsight[] {
    if (!data.stripe) return [];

    const scenarios = buildDefaultScenarios(data.stripe ?? null, data.mercury ?? null);
    const base = scenarios.find((s) => s.id === "default-base");
    if (!base || base.months.length < 1) return [];

    // Compare current MRR to month-0 of forecast — detect if already behind
    const currentMrr = data.stripe?.revenue?.mrr ?? 0;
    const forecastMonth1 = base.months[0]?.projectedMrr ?? 0;

  if (forecastMonth1 <= 0 || currentMrr <= 0) return [];

  // If current MRR is >15% below what the forecast projects for next month
  const gap = ((forecastMonth1 - currentMrr) / currentMrr) * 100;
  if (gap < 15) return [];

  return [
    {
      id: "ai-finance-revenue-vs-forecast",
      section: "finance",
      subsectionId: "finance-forecast",
      severity: gap > 30 ? "critical" : "warning",
      title: "Revenue tracking below forecast trajectory",
      why: `Current MRR ($${currentMrr.toLocaleString()}) needs to grow ${gap.toFixed(1)}% to meet base forecast of $${forecastMonth1.toLocaleString()} next month. Growth assumptions may be too aggressive.`,
      confidence: clampConfidence(0.77),
      expectedImpact: "Adjusting forecast expectations or accelerating growth initiatives keeps planning grounded in reality.",
      stale,
      evidence: [
        {
          source: "Forecast Engine",
          domain: "financeForecast",
          metric: "Forecast Gap",
          value: `${gap.toFixed(1)}% below`,
          delta: `$${currentMrr.toLocaleString()} vs $${forecastMonth1.toLocaleString()}`,
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Recalibrate revenue forecast assumptions",
          payload: {
            title: "Forecast recalibration with updated growth inputs",
            priority: "P2",
            status: "QUEUED",
          },
        },
      ],
    },
  ];
}

// ── Expense vs Revenue Growth Divergence ────────────────

function buildExpenseRevenueGrowthDivergenceInsights(
  data: AnalyticsDashboardData,
  stale: boolean,
): AiInsight[] {
  const revenueGrowth = data.stripe?.revenue?.revenueGrowth ?? 0;
  const outflows = data.mercury?.cashFlow?.outflows30d ?? 0;
  const revenue = data.stripe?.revenue?.totalRevenue30d ?? 0;

  // If expenses are growing faster than revenue (expense ratio worsening)
  // We detect this when burn rate exceeds 80% of revenue while revenue growth is below 10%
  if (revenue > 0 && outflows > 0 && outflows > revenue * 0.8 && revenueGrowth < 10) {
    const expenseRatio = (outflows / revenue) * 100;
    return [
      {
        id: "ai-finance-expense-revenue-divergence",
        section: "finance" as const,
        subsectionId: "finance-pnl",
        severity: expenseRatio > 100 ? ("critical" as const) : ("warning" as const),
        title: "Expenses growing faster than revenue",
        why: `Expense-to-revenue ratio is ${expenseRatio.toFixed(0)}% with revenue growth at only ${revenueGrowth.toFixed(1)}%. Operating expenses of $${outflows.toLocaleString()} are ${expenseRatio > 100 ? "exceeding" : "approaching"} revenue of $${revenue.toLocaleString()}.`,
        confidence: clampConfidence(0.83),
        expectedImpact: "Correcting the divergence by 10% extends runway and improves path to profitability.",
        stale,
        evidence: [
          {
            source: "Stripe + Mercury",
            domain: "stripe" as const,
            metric: "Expense/Revenue Ratio",
            value: `${expenseRatio.toFixed(0)}%`,
            delta: `Revenue growth: ${revenueGrowth.toFixed(1)}%`,
          },
        ],
        actions: [
          {
            type: "create_task",
            label: "Conduct expense audit and identify reduction targets",
            payload: {
              title: "Expense-to-revenue ratio audit",
              priority: "P1",
              status: "QUEUED",
            },
          },
        ],
      },
    ];
  }

  return [];
}

// ── Revenue Trend Pattern Detection ─────────────────────

function buildRevenueTrendPatternInsights(
  data: AnalyticsDashboardData,
  stale: boolean,
): AiInsight[] {
  const trend = data.stripe?.revenueTrend ?? [];
  if (trend.length < 3) return [];

  const insights: AiInsight[] = [];
  const values = trend.map((t) => t.revenue);

  // Detect consecutive decline (3+ months)
  let consecutiveDeclines = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] < values[i - 1]) {
      consecutiveDeclines++;
    } else {
      consecutiveDeclines = 0;
    }
  }

  if (consecutiveDeclines >= 3) {
    const firstDecline = values[values.length - consecutiveDeclines - 1];
    const latest = values[values.length - 1];
    const totalDrop = firstDecline > 0 ? ((firstDecline - latest) / firstDecline * 100).toFixed(1) : "N/A";

    insights.push({
      id: "ai-finance-consecutive-revenue-decline",
      section: "finance" as const,
      subsectionId: "finance-stripe",
      severity: consecutiveDeclines >= 4 ? ("critical" as const) : ("warning" as const),
      title: `Revenue declining for ${consecutiveDeclines} consecutive months`,
      why: `Revenue has declined each month for ${consecutiveDeclines} months, a total drop of ${totalDrop}%. This pattern suggests a structural issue rather than seasonal variation.`,
      confidence: clampConfidence(0.88),
      expectedImpact: "Identifying and addressing the root cause (churn, pricing, acquisition) is critical to stabilize MRR.",
      stale,
      evidence: [
        {
          source: "Stripe",
          domain: "stripe" as const,
          metric: "Revenue Trend",
          value: `${consecutiveDeclines}-month decline`,
          delta: `-${totalDrop}% total`,
          trendValues: values,
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Investigate revenue decline root cause",
          payload: {
            title: "Multi-month revenue decline investigation",
            priority: "P0",
            status: "WORKING_ON_TODAY",
          },
        },
      ],
    });
  }

  // Detect accelerating growth (3+ months of increasing MoM growth rate)
  if (values.length >= 4) {
    const growthRates: number[] = [];
    for (let i = 1; i < values.length; i++) {
      growthRates.push(values[i - 1] > 0 ? ((values[i] - values[i - 1]) / values[i - 1]) * 100 : 0);
    }

    let accelerating = 0;
    for (let i = 1; i < growthRates.length; i++) {
      if (growthRates[i] > growthRates[i - 1] && growthRates[i] > 0) {
        accelerating++;
      } else {
        accelerating = 0;
      }
    }

    if (accelerating >= 3) {
      const latestGrowth = growthRates[growthRates.length - 1];
      insights.push({
        id: "ai-finance-accelerating-growth",
        section: "finance" as const,
        subsectionId: "finance-stripe",
        severity: "info" as const,
        title: "Revenue growth accelerating — consider scaling investment",
        why: `MoM revenue growth has accelerated for ${accelerating} consecutive months, reaching ${latestGrowth.toFixed(1)}%. This signals strong product-market fit momentum.`,
        confidence: clampConfidence(0.80),
        expectedImpact: "Scaling acquisition spend during acceleration can compound growth before the inflection point.",
        stale,
        evidence: [
          {
            source: "Stripe",
            domain: "stripe" as const,
            metric: "MoM Growth Rate",
            value: `${latestGrowth.toFixed(1)}%`,
            delta: `Accelerating for ${accelerating} months`,
            trendValues: values,
          },
        ],
        actions: [
          {
            type: "create_task",
            label: "Evaluate scaling acquisition spend",
            payload: {
              title: "Growth acceleration opportunity assessment",
              priority: "P1",
              status: "QUEUED",
            },
          },
        ],
      });
    }
  }

  return insights;
}

// ── Sales & Pipeline ─────────────────────────────────────

function buildSalesInsights(data: AnalyticsDashboardData): AiInsight[] {
  const insights: AiInsight[] = [];
  const funnel = data.hubspot?.funnel;
  if (!funnel) return insights;

  const noShowRate = funnel.noShowRate ?? 0;
  const demoScheduled = funnel.demoScheduled ?? 0;
  const demoFollowUp = funnel.demoFollowUp ?? 0;
  const closedWon = funnel.closedWon ?? 0;
  const salesStale = data.staleDomains.includes("hubspot") || data.staleDomains.includes("googleWorkspace");

  // 1. No-show / follow-up conversion leak
  if (noShowRate > 15 || demoFollowUp > closedWon) {
    insights.push({
      id: "ai-sales-conversion-leak",
      section: "sales-pipeline",
      subsectionId: "sales-hubspot",
      severity: noShowRate > 25 ? "critical" : "warning",
      title: "Sales conversion leakage concentrated around demo flow",
      why: `No-show rate is ${noShowRate.toFixed(1)}% and follow-up backlog is ${demoFollowUp} versus ${closedWon} closed won.`,
      confidence: clampConfidence(0.88),
      expectedImpact: "Recovering demo attendance and follow-up speed should lift win-rate in the next cycle.",
      stale: salesStale,
      evidence: [
        {
          source: "HubSpot",
          domain: "hubspot",
          metric: "No-show Rate",
          value: `${noShowRate.toFixed(1)}%`,
          delta: `${funnel.noShows ?? 0} no-shows`,
        },
        {
          source: "HubSpot",
          domain: "hubspot",
          metric: "Demo Throughput",
          value: `${demoFollowUp}/${demoScheduled} follow-up/scheduled`,
          delta: `${closedWon} closed won`,
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Create no-show recovery playbook",
          payload: { title: "No-show recovery + fast follow-up runbook", priority: "P1", status: "QUEUED" },
        },
        {
          type: "assign_owner",
          label: "Assign pipeline owner for SLA monitoring",
          payload: { role: "sales-ops" },
        },
      ],
    });
  }

  // 2. Deal-stage bottleneck (highest drop-off between consecutive stages)
  const stages = funnel.stages ?? [];
  if (stages.length >= 3) {
    let maxDrop = 0;
    let bottleneckFrom = "";
    let bottleneckTo = "";
    let fromCount = 0;
    let toCount = 0;
    for (let i = 0; i < stages.length - 1; i++) {
      const drop = stages[i].count - stages[i + 1].count;
      if (drop > maxDrop && stages[i].count > 5) {
        maxDrop = drop;
        bottleneckFrom = stages[i].label;
        bottleneckTo = stages[i + 1].label;
        fromCount = stages[i].count;
        toCount = stages[i + 1].count;
      }
    }
    if (maxDrop > 5 && fromCount > 0) {
      const dropPct = ((maxDrop / fromCount) * 100).toFixed(0);
      insights.push({
        id: "ai-sales-stage-bottleneck",
        section: "sales-pipeline",
        subsectionId: "sales-hubspot",
        severity: Number(dropPct) > 60 ? "critical" : "warning",
        title: `Stage bottleneck: ${bottleneckFrom} → ${bottleneckTo}`,
        why: `${dropPct}% drop (${fromCount} → ${toCount}) between "${bottleneckFrom}" and "${bottleneckTo}" — largest falloff in the pipeline.`,
        confidence: clampConfidence(0.80),
        expectedImpact: "Addressing the largest stage drop-off directly improves pipeline throughput.",
        stale: salesStale,
        evidence: [
          {
            source: "HubSpot",
            domain: "hubspot",
            metric: "Stage Drop-off",
            value: `${dropPct}%`,
            delta: `${fromCount} → ${toCount}`,
          },
        ],
        actions: [
          {
            type: "create_task",
            label: `Investigate ${bottleneckFrom} → ${bottleneckTo} drop-off`,
            payload: { title: `Pipeline bottleneck: ${bottleneckFrom}`, priority: "P1", status: "QUEUED" },
          },
        ],
      });
    }
  }

  // 3. Source concentration risk (one source > 60% of pipeline)
  const dealsBySource = funnel.dealsBySource ?? [];
  const totalDeals = funnel.totalDeals ?? 0;
  if (totalDeals > 10 && dealsBySource.length > 1) {
    const topSource = dealsBySource.reduce((a, b) => (a.count > b.count ? a : b), dealsBySource[0]);
    const concentration = topSource.count / totalDeals;
    if (concentration > 0.6) {
      insights.push({
        id: "ai-sales-source-concentration",
        section: "sales-pipeline",
        subsectionId: "sales-hubspot",
        severity: concentration > 0.8 ? "critical" : "warning",
        title: `Pipeline over-reliant on "${topSource.source}"`,
        why: `"${topSource.source}" accounts for ${(concentration * 100).toFixed(0)}% of deals (${topSource.count}/${totalDeals}). Loss of this channel would devastate pipeline.`,
        confidence: clampConfidence(0.77),
        expectedImpact: "Diversifying pipeline sources reduces single-channel dependency risk.",
        stale: salesStale,
        evidence: [
          {
            source: "HubSpot",
            domain: "hubspot",
            metric: "Source Concentration",
            value: `${(concentration * 100).toFixed(0)}%`,
            delta: `${topSource.count} of ${totalDeals} deals`,
          },
        ],
        actions: [
          {
            type: "create_task",
            label: "Develop secondary pipeline source strategy",
            payload: { title: "Pipeline source diversification plan", priority: "P2", status: "QUEUED" },
          },
        ],
      });
    }
  }

  return insights;
}

// ── Customer Success ─────────────────────────────────────

function buildCustomerSuccessInsights(data: AnalyticsDashboardData): AiInsight[] {
  const insights: AiInsight[] = [];
  const urgent = data.pylon?.urgentConversations ?? 0;
  const backlogGrowth = data.product?.backlogGrowth ?? 0;
  const throughputRate = data.product?.throughputRate ?? 0;
  const csStale = data.staleDomains.includes("pylon") || data.staleDomains.includes("codaOps") || data.staleDomains.includes("slack");

  // 1. Escalation pressure
  if (urgent > 10 || backlogGrowth > 0) {
    insights.push({
      id: "ai-cs-escalation-risk",
      section: "customer-success",
      subsectionId: "cs-pylon",
      severity: urgent > 20 || backlogGrowth > 10 ? "critical" : "warning",
      title: "Customer-success execution pressure is rising",
      why: `Urgent conversations: ${urgent}; backlog growth: ${backlogGrowth}; throughput: ${throughputRate?.toFixed(1) ?? "n/a"}%.`,
      confidence: clampConfidence(0.83),
      expectedImpact: "Rebalancing support and execution queues should reduce urgent backlog and churn precursors.",
      stale: csStale,
      evidence: [
        {
          source: "Pylon",
          domain: "pylon",
          metric: "Urgent Conversations",
          value: String(urgent),
          delta: `${data.pylon?.resolvedInRange ?? 0} resolved`,
        },
        {
          source: "Product Signals",
          domain: "product",
          metric: "Backlog Growth",
          value: String(backlogGrowth),
          delta: `${throughputRate?.toFixed(1) ?? "n/a"}% throughput`,
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Create urgent CS triage queue",
          payload: { title: "Urgent CS triage and owner rebalance", priority: "P1", status: "WORKING_ON_TODAY" },
        },
        {
          type: "open_integration_followup",
          label: "Review Slack/Coda automation health",
          payload: { providers: ["slack", "coda"] },
        },
      ],
    });
  }

  // 2. Throughput stall warning
  if (throughputRate > 0 && throughputRate < 0.70) {
    insights.push({
      id: "ai-cs-throughput-stall",
      section: "customer-success",
      subsectionId: "cs-product",
      severity: throughputRate < 0.50 ? "critical" : "warning",
      title: "Execution throughput has stalled below target",
      why: `Throughput rate is ${(throughputRate * 100).toFixed(1)}% — below the 70% healthy threshold. Backlog is growing at ${backlogGrowth}/period.`,
      confidence: clampConfidence(0.81),
      expectedImpact: "Restoring throughput above 70% prevents backlog snowball and customer frustration.",
      stale: csStale,
      evidence: [
        {
          source: "Product Signals",
          domain: "product",
          metric: "Throughput Rate",
          value: `${(throughputRate * 100).toFixed(1)}%`,
          delta: `Backlog growth: ${backlogGrowth}`,
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Identify throughput blockers",
          payload: { title: "Execution throughput recovery plan", priority: "P1", status: "QUEUED" },
        },
      ],
    });
  }

  return insights;
}

// ── Cross-Domain Correlation ─────────────────────────────

function buildCrossdomainInsights(data: AnalyticsDashboardData): AiInsight[] {
  const insights: AiInsight[] = [];

  // 1. Ad spend rising but pipeline value flat/declining
  const totalAdSpend = (data.googleAds?.totalSpend30d ?? 0) + (data.metaAds?.totalSpend30d ?? 0) + (data.redditAds?.totalSpend30d ?? 0);
  const pipelineValue = data.hubspot?.funnel?.stages?.reduce((sum, s) => sum + s.value, 0) ?? 0;
  const closedWonValue = data.hubspot?.funnel?.stages?.find((s) => s.label === "Closed Won")?.value ?? 0;
  if (totalAdSpend > 1000 && pipelineValue > 0 && closedWonValue < totalAdSpend * 0.5) {
    insights.push({
      id: "ai-xd-spend-vs-pipeline",
      section: "social-media",
      severity: closedWonValue < totalAdSpend * 0.25 ? "critical" : "warning",
      title: "Ad spend not translating to pipeline value",
      why: `$${totalAdSpend.toLocaleString()} ad spend but only $${closedWonValue.toLocaleString()} closed won — pipeline ROI is ${pipelineValue > 0 ? (closedWonValue / totalAdSpend * 100).toFixed(0) : 0}%.`,
      confidence: clampConfidence(0.78),
      expectedImpact: "Aligning ad targeting with pipeline qualification criteria improves spend-to-revenue ratio.",
      stale: data.staleDomains.includes("googleAds") || data.staleDomains.includes("hubspot"),
      crossDomain: true,
      evidence: [
        {
          source: "Google Ads + Meta Ads + Reddit Ads",
          domain: "googleAds/metaAds/redditAds",
          metric: "Total Ad Spend",
          value: `$${totalAdSpend.toLocaleString()}`,
          delta: "30d period",
        },
        {
          source: "HubSpot",
          domain: "hubspot",
          metric: "Closed Won Value",
          value: `$${closedWonValue.toLocaleString()}`,
          delta: `Pipeline: $${pipelineValue.toLocaleString()}`,
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Audit ad-to-pipeline attribution",
          payload: { title: "Cross-channel attribution audit", priority: "P1", status: "QUEUED" },
        },
      ],
    });
  }

  // 2. Revenue growing but urgent support conversations also rising
  const revenueGrowth = data.stripe?.revenue?.revenueGrowth ?? 0;
  const urgentConversations = data.pylon?.urgentConversations ?? 0;
  if (revenueGrowth > 5 && urgentConversations > 15) {
    insights.push({
      id: "ai-xd-growth-vs-support",
      section: "customer-success",
      severity: urgentConversations > 25 ? "critical" : "warning",
      title: "Revenue growth is outpacing support capacity",
      why: `Revenue growing ${revenueGrowth.toFixed(1)}% but urgent support conversations at ${urgentConversations} — growth is straining the support team.`,
      confidence: clampConfidence(0.76),
      expectedImpact: "Scaling support capacity with growth prevents churn among new customers.",
      stale: data.staleDomains.includes("stripe") || data.staleDomains.includes("pylon"),
      crossDomain: true,
      evidence: [
        {
          source: "Stripe",
          domain: "stripe",
          metric: "Revenue Growth",
          value: `${revenueGrowth.toFixed(1)}%`,
          delta: `$${(data.stripe?.revenue?.mrr ?? 0).toLocaleString()} MRR`,
        },
        {
          source: "Pylon",
          domain: "pylon",
          metric: "Urgent Conversations",
          value: String(urgentConversations),
          delta: `${data.pylon?.resolvedInRange ?? 0} resolved`,
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Scale support capacity plan",
          payload: { title: "Support scaling roadmap aligned to growth", priority: "P1", status: "QUEUED" },
        },
      ],
    });
  }

  // 3. Low runway + small average deal size despite wins
  const runway = data.mercury?.cashFlow?.runway ?? 0;
  const avgDealSize = data.hubspot?.funnel?.avgDealSize ?? 0;
  const closedWon = data.hubspot?.funnel?.closedWon ?? 0;
  if (runway > 0 && runway < 6 && avgDealSize > 0 && avgDealSize < 500 && closedWon > 5) {
    insights.push({
      id: "ai-xd-runway-vs-deal-size",
      section: "finance",
      severity: runway < 4 ? "critical" : "warning",
      title: "Low runway compounded by small average deal size",
      why: `Runway is ${runway.toFixed(1)} months but avg deal size is only $${avgDealSize.toFixed(0)} across ${closedWon} wins — insufficient deal velocity to extend runway.`,
      confidence: clampConfidence(0.75),
      expectedImpact: "Upselling or moving upmarket by 50% on deal size can materially extend runway.",
      stale: data.staleDomains.includes("mercury") || data.staleDomains.includes("hubspot"),
      crossDomain: true,
      evidence: [
        {
          source: "Mercury",
          domain: "mercury",
          metric: "Runway",
          value: `${runway.toFixed(1)} months`,
          delta: `Burn ${(data.mercury?.cashFlow?.burnRate ?? 0).toFixed(0)}/month`,
        },
        {
          source: "HubSpot",
          domain: "hubspot",
          metric: "Avg Deal Size",
          value: `$${avgDealSize.toFixed(0)}`,
          delta: `${closedWon} closed won`,
        },
      ],
      actions: [
        {
          type: "create_task",
          label: "Review pricing and upsell strategy",
          payload: { title: "Deal size optimization initiative", priority: "P1", status: "QUEUED" },
        },
      ],
    });
  }

  // 4. Marketing intent mismatch: High traffic/demos but critical no-show rate
  const gaSessions = data.googleAnalytics?.sessions30d ?? 0;
  const demoScheduled = data.demoAnalytics?.totalScheduled ?? 0;
  const noShowRate = data.demoAnalytics?.noShowRate ?? 0;
  if (gaSessions > 2000 && demoScheduled > 10 && noShowRate > 35) {
    insights.push({
      id: "ai-xd-traffic-vs-noshow",
      section: "demo-analytics",
      severity: "critical",
      title: "Marketing traffic is generating low-intent demos",
      why: `${gaSessions.toLocaleString()} sessions drove ${demoScheduled} demos, but the no-show rate is ${noShowRate.toFixed(1)}%. Traffic quality or booking friction is an issue.`,
      confidence: clampConfidence(0.89),
      expectedImpact: "Adding qualification friction to the booking form can improve sales efficiency and demo attendance.",
      stale: data.staleDomains.includes("googleAnalytics") || data.staleDomains.includes("demoAnalytics"),
      crossDomain: true,
      evidence: [
        {
          source: "Google Analytics",
          domain: "googleAnalytics",
          metric: "Traffic",
          value: `${gaSessions.toLocaleString()} sessions`,
          delta: "30d period",
        },
        {
          source: "Demo Analytics",
          domain: "demoAnalytics",
          metric: "No-Show Rate",
          value: `${noShowRate.toFixed(1)}%`,
          delta: `${demoScheduled} booked`,
        }
      ],
      actions: [
        {
          type: "create_task",
          label: "Add qualification questions to demo form",
          payload: { title: "Demo booking form qualification step", priority: "P1", status: "QUEUED" }
        }
      ]
    });
  }

  // 5. Product delivery risk vs Runway
  const runwayNew = data.mercury?.cashFlow?.runway ?? 0;
  const backlogGrowth = data.product?.backlogGrowth ?? 0;
  const throughputRate = data.product?.throughputRate ?? 0;

  if (runwayNew > 0 && runwayNew < 6 && backlogGrowth > 10 && throughputRate < 0.5) {
    insights.push({
      id: "ai-xd-runway-vs-product",
      section: "finance",
      severity: runwayNew < 4 ? "critical" : "warning",
      title: "Product delivery stalled while runway is critically low",
      why: `Runway is ${runwayNew.toFixed(1)} months but product throughput is only ${(throughputRate * 100).toFixed(0)}% with a growing backlog. Risk of missing key milestones before next fundraise.`,
      confidence: clampConfidence(0.85),
      expectedImpact: "Scoping down near-term roadmap to strictly revenue-unlocking features extends runway.",
      stale: data.staleDomains.includes("mercury") || data.staleDomains.includes("codaOps"),
      crossDomain: true,
      evidence: [
        {
          source: "Mercury",
          domain: "mercury",
          metric: "Runway",
          value: `${runwayNew.toFixed(1)} months`,
          delta: "Critical window",
        },
        {
          source: "Product Signals",
          domain: "product",
          metric: "Throughput",
          value: `${(throughputRate * 100).toFixed(0)}%`,
          delta: `${backlogGrowth} tickets added`,
        }
      ],
      actions: [
        {
          type: "create_task",
          label: "Urgent roadmap reprioritization",
          payload: { title: "Cut scope to minimum rev-generating features", priority: "P0", status: "WORKING_ON_TODAY" }
        }
      ]
    });
  }

  return insights;
}

// ── Journey / Demo / Process Insights ────────────────────

function buildJourneyInsight(data: AnalyticsDashboardData): AiInsight | null {
  const journey = data.customerJourney;
  if (!journey || journey.journeys.length === 0) return null;

  const longJourneys = journey.journeys.filter((j) => j.daysInPipeline > 60);
  const lowTouchJourneys = journey.journeys.filter((j) => j.touchpoints.length <= 2 && j.value > 0);
  const avgTouches = journey.avgTouchpoints;

  if (longJourneys.length < 3 && lowTouchJourneys.length < 3) return null;

  const longPct = journey.journeys.length > 0 ? (longJourneys.length / journey.journeys.length) * 100 : 0;
  const lowTouchPct = journey.journeys.length > 0 ? (lowTouchJourneys.length / journey.journeys.length) * 100 : 0;

  return {
    id: "ai-journey-engagement-gap",
    section: "customer-journey",
    severity: longPct > 30 || lowTouchPct > 25 ? "critical" : "warning",
    title: "Customer journeys show engagement gaps slowing conversion",
    why: `${longJourneys.length} journeys exceed 60 days (${longPct.toFixed(0)}%) and ${lowTouchJourneys.length} active deals have ≤2 touchpoints. Average touches: ${avgTouches.toFixed(1)}.`,
    confidence: clampConfidence(0.82),
    expectedImpact: "Adding mid-funnel touchpoints and reducing stale deal age should lift conversion velocity.",
    stale: data.staleDomains.includes("hubspot"),
    evidence: [
      {
        source: "Customer Journey",
        domain: "customerJourney",
        metric: "Long Journeys (>60d)",
        value: `${longJourneys.length} deals (${longPct.toFixed(1)}%)`,
        delta: `median ${journey.medianDaysToClose}d to close`,
      },
      {
        source: "Customer Journey",
        domain: "customerJourney",
        metric: "Low-Touch Deals",
        value: `${lowTouchJourneys.length} deals`,
        delta: `avg ${avgTouches.toFixed(1)} touchpoints`,
      },
    ],
    actions: [
      {
        type: "create_task",
        label: "Create mid-funnel engagement playbook",
        payload: {
          title: "Add touchpoints for stalled deals with low engagement",
          priority: "P1",
          status: "QUEUED",
        },
      },
      {
        type: "assign_owner",
        label: "Assign owner for stale-deal review",
        payload: { role: "sales-ops" },
      },
    ],
  };
}

function buildDemoInsight(data: AnalyticsDashboardData): AiInsight | null {
  const demo = data.demoAnalytics;
  if (!demo || demo.totalScheduled === 0) return null;

  const noShowRate = demo.noShowRate;
  const conversionStep = demo.conversionFunnel.find((s) => s.label === "Closed Won");
  const endConversion = conversionStep?.conversionFromPrevious ?? 0;

  if (noShowRate <= 15 && endConversion >= 20) return null;

  return {
    id: "ai-demo-effectiveness",
    section: "demo-analytics",
    severity: noShowRate > 30 || endConversion < 10 ? "critical" : "warning",
    title: "Demo pipeline leaking — no-shows and post-demo drop-off are high",
    why: `No-show rate is ${noShowRate.toFixed(1)}% across ${demo.totalScheduled} scheduled demos. Post-demo close rate: ${endConversion.toFixed(1)}%.`,
    confidence: clampConfidence(0.87),
    expectedImpact: "Reducing no-shows by 10pp and improving follow-up speed should lift demo-to-close by 5-15%.",
    stale: data.staleDomains.includes("hubspot") || data.staleDomains.includes("googleWorkspace"),
    evidence: [
      {
        source: "Demo Analytics",
        domain: "demoAnalytics",
        metric: "No-Show Rate",
        value: `${noShowRate.toFixed(1)}%`,
        delta: `${demo.totalNoShows} of ${demo.totalScheduled}`,
      },
      {
        source: "Demo Analytics",
        domain: "demoAnalytics",
        metric: "Post-Demo Close Rate",
        value: `${endConversion.toFixed(1)}%`,
        delta: `${demo.totalCompleted} completed`,
      },
    ],
    actions: [
      {
        type: "create_task",
        label: "Implement demo reminder + no-show recovery flow",
        payload: {
          title: "SMS/email demo reminders and no-show re-engagement",
          priority: "P1",
          status: "QUEUED",
        },
      },
      {
        type: "create_automation_from_template",
        label: "Enable post-demo follow-up automation",
        payload: { templateKey: "hubspot-demo-followup" },
      },
    ],
  };
}

function buildProcessInsight(data: AnalyticsDashboardData): AiInsight | null {
  const process = data.processAnalytics;
  if (!process) return null;

  const health = process.healthScore;
  const criticalBottlenecks = process.bottlenecks.filter((b) => b.severity === "critical");
  const totalLeakage = process.leakagePoints.reduce((sum, lp) => sum + lp.lostCount, 0);

  if (health >= 70 && criticalBottlenecks.length === 0) return null;

  const worstBottleneck = criticalBottlenecks[0] ?? process.bottlenecks[0];

  return {
    id: "ai-process-health-alert",
    section: "process-analytics",
    severity: health < 40 || criticalBottlenecks.length >= 2 ? "critical" : "warning",
    title: "Pipeline health degraded — bottlenecks and leakage need attention",
    why: `Health score: ${health}/100. ${criticalBottlenecks.length} critical bottlenecks. ${totalLeakage} deals leaked from pipeline. Worst stage: ${worstBottleneck?.stageLabel ?? "n/a"} (${worstBottleneck?.avgDays.toFixed(1) ?? "n/a"}d avg).`,
    confidence: clampConfidence(0.85),
    expectedImpact: "Clearing bottleneck stages and plugging leakage points should recover 15-25% of pipeline velocity.",
    stale: data.staleDomains.includes("hubspot"),
    evidence: [
      {
        source: "Process Analytics",
        domain: "processAnalytics",
        metric: "Health Score",
        value: `${health}/100`,
        delta: `${criticalBottlenecks.length} critical bottlenecks`,
      },
      {
        source: "Process Analytics",
        domain: "processAnalytics",
        metric: "Pipeline Leakage",
        value: `${totalLeakage} deals`,
        delta: `avg cycle ${process.avgCycleTimeDays}d`,
      },
    ],
    actions: [
      {
        type: "create_task",
        label: "Create bottleneck resolution plan",
        payload: {
          title: `Clear ${worstBottleneck?.stageLabel ?? "critical"} stage bottleneck`,
          priority: "P0",
          status: "WORKING_ON_TODAY",
        },
      },
      {
        type: "assign_owner",
        label: "Assign pipeline velocity owner",
        payload: { role: "rev-ops" },
      },
    ],
  };
}

// ── Steady State Fallback ────────────────────────────────

function buildSteadyStateInsight(data: AnalyticsDashboardData): AiInsight {
  return {
    id: "ai-steady-state",
    section: "sales-pipeline",
    severity: "info",
    title: "No critical cross-functional regressions detected",
    why: "Current lifecycle and domain indicators are inside guardrails for the selected range.",
    confidence: clampConfidence(0.74),
    expectedImpact: "Use this window for one growth experiment and one cycle-time experiment.",
    stale: data.staleDomains.length > 0,
    evidence: [
      {
        source: "Lifecycle",
        domain: "cross-domain",
        metric: "Funnel Stability",
        value: "Stable",
        delta: `${data.staleDomains.length} stale domains`,
      },
    ],
    actions: [
      {
        type: "create_task",
        label: "Define next GTM experiment",
        payload: { title: "Run one GTM + one execution experiment", priority: "P2", status: "QUEUED" },
      },
    ],
  };
}

// ── Bundle Assembly ──────────────────────────────────────

export function buildAiInsightsBundle(data: AnalyticsDashboardData): AiInsightsBundle {
  const candidateInsights = [
    ...buildAdsInsights(data),
    ...buildFinanceInsights(data),
    ...buildSalesInsights(data),
    ...buildCustomerSuccessInsights(data),
    ...buildCrossdomainInsights(data),
    ...[buildJourneyInsight(data), buildDemoInsight(data), buildProcessInsight(data)].filter((item): item is AiInsight => item !== null),
  ];

  const global = sortInsights(candidateInsights.length > 0 ? candidateInsights : [buildSteadyStateInsight(data)]).slice(0, 12);

  const bySection = SECTION_ORDER.reduce<AiInsightsBundle["bySection"]>(
    (acc, section) => {
      acc[section] = global.filter((item) => item.section === section);
      return acc;
    },
    {
      "website-traffic": [],
      "social-media": [],
      finance: [],
      "sales-pipeline": [],
      retention: [],
      "customer-success": [],
      "customer-journey": [],
      "demo-analytics": [],
      "process-analytics": [],
    }
  );

  return {
    generatedAt: new Date().toISOString(),
    global,
    bySection,
  };
}

export function buildDistilledInsights(data: AnalyticsDashboardData): DistilledInsight[] {
  const insights = buildAiInsightsBundle(data).global.slice(0, 5);
  return insights.map((item) => ({
    id: item.id,
    section: item.section,
    severity: item.severity,
    title: item.title,
    why: item.why,
    changeOverTime: item.evidence.map((evidence) => `${evidence.metric}: ${evidence.delta}`).join(" | "),
    confidence: item.confidence,
    actions: item.actions,
  }));
}

export const __private__ = {
  sortInsights,
};
