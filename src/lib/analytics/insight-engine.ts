import type { AnalyticsDashboardData, DistilledInsight } from "@/lib/analytics/types";

function clampConfidence(value: number): number {
  return Math.max(0.1, Math.min(0.99, Math.round(value * 100) / 100));
}

export function buildDistilledInsights(data: AnalyticsDashboardData): DistilledInsight[] {
  const insights: DistilledInsight[] = [];

  const bounceRate = data.googleAnalytics?.bounceRate ?? 0;
  if (bounceRate > 0.55) {
    insights.push({
      id: "insight-ads-bounce",
      section: "ads-traffic",
      severity: bounceRate > 0.65 ? "critical" : "warning",
      title: "Landing traffic quality is degrading",
      why: `Bounce rate is ${(bounceRate * 100).toFixed(1)}%, indicating weak ad-to-page relevance for paid sessions.`,
      changeOverTime: `Session trend is ${data.googleAnalytics?.sessions30d ?? 0} vs ${data.googleAnalytics?.sessionsPrev30d ?? 0} in previous range.`,
      confidence: clampConfidence(0.86),
      actions: [
        {
          type: "create_task",
          label: "Create landing page triage task",
          payload: {
            title: "Reduce high-bounce paid landing traffic",
            notes: "Audit top paid entry pages and align copy/offer with ad intent.",
            status: "QUEUED",
            priority: "P1",
          },
        },
      ],
    });
  }

  const runway = data.mercury?.cashFlow?.runway ?? 0;
  if (runway > 0 && runway < 4) {
    insights.push({
      id: "insight-finance-runway",
      section: "finance",
      severity: "critical",
      title: "Cash runway requires immediate intervention",
      why: `Estimated runway is ${runway.toFixed(1)} months with net cash flow ${data.mercury?.cashFlow?.netCashFlow ?? 0}.`,
      changeOverTime: `MRR is ${data.stripe?.revenue?.mrr ?? 0} with growth ${(data.stripe?.revenue?.revenueGrowth ?? 0).toFixed(1)}% over prior range.`,
      confidence: clampConfidence(0.93),
      actions: [
        {
          type: "create_task",
          label: "Create runway action plan task",
          payload: {
            title: "Runway protection: 30-day plan",
            notes: "Cut low-ROI spend and accelerate collections/expansion opportunities.",
            status: "WORKING_ON_TODAY",
            priority: "P0",
          },
        },
        {
          type: "create_automation_from_template",
          label: "Enable HubSpot stage checklist automation",
          payload: {
            templateKey: "hubspot-stage-checklist",
          },
        },
      ],
    });
  }

  const noShowRate = data.hubspot?.funnel?.noShowRate ?? 0;
  if (noShowRate > 15) {
    insights.push({
      id: "insight-sales-noshow",
      section: "sales-pipeline",
      severity: noShowRate > 25 ? "critical" : "warning",
      title: "Demo no-show leakage is suppressing pipeline conversion",
      why: `No-show rate is ${noShowRate.toFixed(1)}% with ${data.hubspot?.funnel?.noShows ?? 0} missed demos in range.`,
      changeOverTime: `Demo scheduled count is ${data.hubspot?.funnel?.demoScheduled ?? 0}.`,
      confidence: clampConfidence(0.88),
      actions: [
        {
          type: "create_automation_from_template",
          label: "Create Slack SLA escalation workflow",
          payload: {
            templateKey: "slack-unanswered-sla",
          },
        },
        {
          type: "create_task",
          label: "Assign follow-up owner",
          payload: {
            title: "Recover no-show opportunities",
            notes: "Implement 24h and 1h reminder cadence, then owner follow-up within 2 hours.",
            status: "QUEUED",
            priority: "P1",
          },
        },
      ],
    });
  }

  const urgentConversations = data.pylon?.urgentConversations ?? 0;
  if (urgentConversations > 10) {
    insights.push({
      id: "insight-cs-urgent",
      section: "customer-success",
      severity: urgentConversations > 20 ? "critical" : "warning",
      title: "Customer success risk is rising",
      why: `${urgentConversations} urgent conversations are open; backlog growth is ${data.product?.backlogGrowth ?? 0}.`,
      changeOverTime: `Resolved in range: ${data.pylon?.resolvedInRange ?? 0}; throughput: ${data.product?.throughputRate ?? 0}%.`,
      confidence: clampConfidence(0.81),
      actions: [
        {
          type: "create_task",
          label: "Create urgent CS triage task",
          payload: {
            title: "Urgent CS escalation triage",
            notes: "Rebalance owners and resolve top-risk threads first.",
            status: "WORKING_ON_TODAY",
            priority: "P1",
          },
        },
      ],
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "insight-steady-state",
      section: "sales-pipeline",
      severity: "info",
      title: "No critical GTM regressions detected",
      why: "Cross-platform indicators are within normal thresholds for the selected range.",
      changeOverTime: "Use this window to run one growth and one conversion experiment.",
      confidence: clampConfidence(0.74),
      actions: [
        {
          type: "create_task",
          label: "Create next GTM experiment task",
          payload: {
            title: "Design next GTM experiment",
            notes: "Define hypothesis, owner, and KPI before launch.",
            status: "QUEUED",
            priority: "P2",
          },
        },
      ],
    });
  }

  return insights.slice(0, 5);
}
