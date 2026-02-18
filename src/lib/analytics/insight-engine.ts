import type {
  AiInsight,
  AiInsightsBundle,
  AnalyticsDashboardData,
  AnalyticsSectionId,
  DistilledInsight,
} from "@/lib/analytics/types";

const SECTION_ORDER: AnalyticsSectionId[] = ["ads-traffic", "finance", "sales-pipeline", "customer-success"];

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

function normalizeThroughputRatio(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value > 1 ? value / 100 : value;
}

// ── Ads & Traffic ────────────────────────────────────────

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
      section: "ads-traffic",
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
      section: "ads-traffic",
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
      section: "ads-traffic",
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
      section: "ads-traffic",
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

  return insights;
}

// ── Finance ──────────────────────────────────────────────

function buildFinanceInsights(data: AnalyticsDashboardData): AiInsight[] {
  const insights: AiInsight[] = [];
  const runway = data.mercury?.cashFlow?.runway ?? 0;
  const revenueGrowth = data.stripe?.revenue?.revenueGrowth ?? 0;
  const burnRate = data.mercury?.cashFlow?.burnRate ?? 0;
  const churnRate = data.stripe?.subscriptions?.churnRate ?? 0;
  const paymentSuccessRate = data.stripe?.payments?.successRate ?? 1;
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
  if (churnRate > 0.08) {
    insights.push({
      id: "ai-finance-churn",
      section: "finance",
      subsectionId: "finance-stripe",
      severity: churnRate > 0.12 ? "critical" : "warning",
      title: "Subscription churn rate exceeds healthy threshold",
      why: `Churn rate is ${(churnRate * 100).toFixed(1)}% — above the 8% warning threshold. ${data.stripe?.subscriptions?.canceled ?? 0} cancellations in period.`,
      confidence: clampConfidence(0.88),
      expectedImpact: "Reducing churn by 2-3pp directly improves MRR retention and LTV.",
      stale: data.staleDomains.includes("stripe"),
      evidence: [
        {
          source: "Stripe",
          domain: "stripe",
          metric: "Churn Rate",
          value: `${(churnRate * 100).toFixed(1)}%`,
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
  if (paymentSuccessRate < 0.90) {
    insights.push({
      id: "ai-finance-payment-failures",
      section: "finance",
      subsectionId: "finance-stripe",
      severity: paymentSuccessRate < 0.80 ? "critical" : "warning",
      title: "Payment failure rate is eroding collected revenue",
      why: `Payment success rate is ${(paymentSuccessRate * 100).toFixed(1)}% — ${data.stripe?.payments?.failed ?? 0} failed of ${(data.stripe?.payments?.succeeded ?? 0) + (data.stripe?.payments?.failed ?? 0)} attempts.`,
      confidence: clampConfidence(0.90),
      expectedImpact: "Smart retries and card updater can recover 30-50% of failed payments.",
      stale: data.staleDomains.includes("stripe"),
      evidence: [
        {
          source: "Stripe",
          domain: "stripe",
          metric: "Payment Success Rate",
          value: `${(paymentSuccessRate * 100).toFixed(1)}%`,
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
  const throughputRatio = normalizeThroughputRatio(data.product?.throughputRate);
  const throughputPctText = throughputRatio === null ? "n/a" : `${(throughputRatio * 100).toFixed(1)}%`;
  const csStale = data.staleDomains.includes("pylon") || data.staleDomains.includes("codaOps") || data.staleDomains.includes("slack");

  // 1. Escalation pressure
  if (urgent > 10 || backlogGrowth > 0) {
    insights.push({
      id: "ai-cs-escalation-risk",
      section: "customer-success",
      subsectionId: "cs-pylon",
      severity: urgent > 20 || backlogGrowth > 10 ? "critical" : "warning",
      title: "Customer-success execution pressure is rising",
      why: `Urgent conversations: ${urgent}; backlog growth: ${backlogGrowth}; throughput: ${throughputPctText}.`,
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
          delta: `${throughputPctText} throughput`,
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
  if (throughputRatio !== null && throughputRatio < 0.70) {
    insights.push({
      id: "ai-cs-throughput-stall",
      section: "customer-success",
      subsectionId: "cs-product",
      severity: throughputRatio < 0.50 ? "critical" : "warning",
      title: "Execution throughput has stalled below target",
      why: `Throughput rate is ${(throughputRatio * 100).toFixed(1)}% — below the 70% healthy threshold. Backlog is growing at ${backlogGrowth}/period.`,
      confidence: clampConfidence(0.81),
      expectedImpact: "Restoring throughput above 70% prevents backlog snowball and customer frustration.",
      stale: csStale,
      evidence: [
        {
          source: "Product Signals",
          domain: "product",
          metric: "Throughput Rate",
          value: `${(throughputRatio * 100).toFixed(1)}%`,
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
      section: "ads-traffic",
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

  return insights;
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
  ];

  const global = sortInsights(candidateInsights.length > 0 ? candidateInsights : [buildSteadyStateInsight(data)]).slice(0, 12);

  const bySection = SECTION_ORDER.reduce<AiInsightsBundle["bySection"]>(
    (acc, section) => {
      acc[section] = global.filter((item) => item.section === section);
      return acc;
    },
    {
      "ads-traffic": [],
      finance: [],
      "sales-pipeline": [],
      "customer-success": [],
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
