import type {
  AnalyticsDashboardData,
  DemoAnalyticsData,
  DemoConversionStep,
  DemoOutcome,
  DemoOutcomeBreakdown,
  DemoRecord,
  DemoSourceBreakdown,
  DemoWeeklyTrend,
  JourneyPathRow,
} from "@/lib/analytics/types";

const DEMO_STAGES = new Set(["Demo Scheduled", "No-Show/Reschedule", "Demo Follow-Up"]);
const POST_DEMO_STAGES = ["Demo Follow-Up", "Budgetary Quote Sent", "Payment Link Sent", "Free Trial", "Freemium", "Subscription", "Closed Won"];

function inferOutcome(stageLabel: string): DemoOutcome {
  if (stageLabel === "No-Show/Reschedule") return "no-show";
  if (stageLabel === "Demo Scheduled") return "pending";
  if (POST_DEMO_STAGES.includes(stageLabel)) return "completed";
  return "rescheduled";
}

function buildDemoRecords(data: AnalyticsDashboardData): DemoRecord[] {
  const deals = data.hubspot?.deals ?? [];
  const stages = data.hubspot?.funnel?.stages ?? [];
  const stageMap = new Map(stages.map((s) => [s.label, s]));

  // Deals that ever reached Demo Scheduled or beyond
  const demoDeals = deals.filter(
    (deal) => DEMO_STAGES.has(deal.stageLabel) || POST_DEMO_STAGES.includes(deal.stageLabel)
  );

  return demoDeals.map((deal) => {
    const outcome = inferOutcome(deal.stageLabel);
    const currentStageIdx = POST_DEMO_STAGES.indexOf(deal.stageLabel);
    const hasFollowUp = currentStageIdx >= 0;

    // Estimate days to next stage based on updatedAt
    let daysToNextStage: number | null = null;
    if (deal.updatedAt) {
      const daysSinceUpdate = Math.round(
        (Date.now() - new Date(deal.updatedAt).getTime()) / 86_400_000
      );
      if (outcome === "completed" && daysSinceUpdate > 0) {
        daysToNextStage = daysSinceUpdate;
      }
    }

    return {
      dealId: deal.dealId,
      dealName: deal.dealName,
      contactEmail: null,
      scheduledAt: deal.updatedAt ?? new Date().toISOString(),
      source: deal.source || "Unknown",
      outcome,
      followUpSent: hasFollowUp,
      daysToNextStage,
      resultingStage: outcome === "completed" ? deal.stageLabel : null,
    };
  });
}

function buildSourceBreakdown(demos: DemoRecord[]): DemoSourceBreakdown[] {
  const bySource = new Map<string, { scheduled: number; completed: number; noShows: number }>();

  for (const demo of demos) {
    const entry = bySource.get(demo.source) ?? { scheduled: 0, completed: 0, noShows: 0 };
    entry.scheduled += 1;
    if (demo.outcome === "completed") entry.completed += 1;
    if (demo.outcome === "no-show") entry.noShows += 1;
    bySource.set(demo.source, entry);
  }

  return Array.from(bySource.entries())
    .map(([source, stats]) => ({
      source,
      scheduled: stats.scheduled,
      completed: stats.completed,
      noShows: stats.noShows,
      conversionRate: stats.scheduled > 0
        ? Math.round((stats.completed / stats.scheduled) * 1000) / 10
        : 0,
    }))
    .sort((a, b) => b.scheduled - a.scheduled);
}

function buildOutcomeBreakdown(demos: DemoRecord[]): DemoOutcomeBreakdown[] {
  const total = demos.length;
  const counts: Record<DemoOutcome, number> = { completed: 0, "no-show": 0, rescheduled: 0, pending: 0 };

  for (const demo of demos) {
    counts[demo.outcome] += 1;
  }

  return (Object.entries(counts) as [DemoOutcome, number][]).map(([outcome, count]) => ({
    outcome,
    count,
    pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
  }));
}

function buildConversionFunnel(data: AnalyticsDashboardData, demos: DemoRecord[]): DemoConversionStep[] {
  const funnel = data.hubspot?.funnel;
  if (!funnel) return [];

  const steps: DemoConversionStep[] = [
    { label: "Demo Scheduled", count: funnel.demoScheduled, conversionFromPrevious: null },
    {
      label: "Demo Completed",
      count: demos.filter((d) => d.outcome === "completed").length,
      conversionFromPrevious: funnel.demoScheduled > 0
        ? Math.round((demos.filter((d) => d.outcome === "completed").length / funnel.demoScheduled) * 1000) / 10
        : null,
    },
    {
      label: "Follow-Up Sent",
      count: demos.filter((d) => d.followUpSent).length,
      conversionFromPrevious: null,
    },
    {
      label: "Closed Won",
      count: funnel.closedWon,
      conversionFromPrevious: funnel.demoScheduled > 0
        ? Math.round((funnel.closedWon / funnel.demoScheduled) * 1000) / 10
        : null,
    },
  ];

  // Fill in follow-up → closed conversion
  const followUpCount = steps[2].count;
  if (followUpCount > 0) {
    steps[2].conversionFromPrevious =
      steps[1].count > 0
        ? Math.round((followUpCount / steps[1].count) * 1000) / 10
        : null;
  }

  return steps;
}

function buildWeeklyTrend(demos: DemoRecord[]): DemoWeeklyTrend[] {
  const byWeek = new Map<string, { scheduled: number; completed: number; noShows: number }>();

  for (const demo of demos) {
    const date = new Date(demo.scheduledAt);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString().slice(0, 10);

    const entry = byWeek.get(weekKey) ?? { scheduled: 0, completed: 0, noShows: 0 };
    entry.scheduled += 1;
    if (demo.outcome === "completed") entry.completed += 1;
    if (demo.outcome === "no-show") entry.noShows += 1;
    byWeek.set(weekKey, entry);
  }

  return Array.from(byWeek.entries())
    .map(([week, stats]) => ({
      week,
      scheduled: stats.scheduled,
      completed: stats.completed,
      noShows: stats.noShows,
    }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

const TERMINAL_STAGES = new Set(["Closed Won", "Closed Lost", "Unlikely"]);
const DEMO_ENTRY_STAGES = new Set([
  "Demo Scheduled", "No-Show/Reschedule",
  ...POST_DEMO_STAGES,
]);

function pct(num: number, denom: number): number {
  return denom > 0 ? Math.round((num / denom) * 1000) / 10 : 0;
}

// Stages that indicate the customer has been onboarded (reached Subscription or beyond)
const ONBOARDED_STAGES = new Set(["Subscription", "Closed Won"]);
const HUBSPOT_CHURN_STAGES = new Set(["Churn", "Closed Lost"]);

type StripeChurnEvent = NonNullable<
  AnalyticsDashboardData["stripe"]
>["subscriptions"]["recentChurnEvents"][number];

function normalizeKey(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function buildStripeChurnLookup(events: StripeChurnEvent[]): Map<string, StripeChurnEvent> {
  const lookup = new Map<string, StripeChurnEvent>();
  for (const event of events) {
    const key = normalizeKey(event.customer);
    if (!key) continue;
    const existing = lookup.get(key);
    if (!existing) {
      lookup.set(key, event);
      continue;
    }
    const existingTime = new Date(existing.canceledAt).getTime();
    const nextTime = new Date(event.canceledAt).getTime();
    if (nextTime > existingTime) {
      lookup.set(key, event);
    }
  }
  return lookup;
}

function resolveStripeChurnEvent(
  deal: { dealId: string; dealName: string; stripeCustomerId?: string | null },
  lookup: Map<string, StripeChurnEvent>
): StripeChurnEvent | null {
  const candidates = [
    normalizeKey(deal.stripeCustomerId),
    normalizeKey(deal.dealId),
    normalizeKey(deal.dealName),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const match = lookup.get(candidate);
    if (match) return match;
  }
  return null;
}

function buildJourneyPathAnalysis(data: AnalyticsDashboardData): JourneyPathRow[] {
  const deals = data.hubspot?.deals ?? [];
  const stripeChurnEvents = data.stripe?.subscriptions?.recentChurnEvents ?? [];

  // Build a lookup of Stripe-churned customer IDs for cross-referencing
  const stripeChurnLookup = buildStripeChurnLookup(stripeChurnEvents);

  const bySource = new Map<string, typeof deals>();
  for (const deal of deals) {
    const source = deal.source || "Unknown";
    const group = bySource.get(source) ?? [];
    group.push(deal);
    bySource.set(source, group);
  }

  const rows: JourneyPathRow[] = [];

  for (const [source, sourceDeals] of bySource) {
    const totalLeads = sourceDeals.length;
    const demosBooked = sourceDeals.filter((d) => DEMO_ENTRY_STAGES.has(d.stageLabel)).length;
    const demoCompleted = sourceDeals.filter((d) => POST_DEMO_STAGES.includes(d.stageLabel)).length;
    const demoNoShow = sourceDeals.filter((d) => d.stageLabel === "No-Show/Reschedule").length;

    // Avg days to decision for terminal-stage deals (approximate from updatedAt)
    const terminalDeals = sourceDeals.filter(
      (d) => TERMINAL_STAGES.has(d.stageLabel) && d.updatedAt,
    );
    let avgDaysToDecision: number | null = null;
    if (terminalDeals.length > 0) {
      const totalDays = terminalDeals.reduce((sum, d) => {
        const days = Math.round((Date.now() - new Date(d.updatedAt!).getTime()) / 86_400_000);
        return sum + Math.max(days, 0);
      }, 0);
      avgDaysToDecision = Math.round((totalDays / terminalDeals.length) * 10) / 10;
    }

    const wonDeals = sourceDeals.filter((d) => d.stageLabel === "Closed Won");
    const closedWon = wonDeals.length;
    const closedLost = sourceDeals.filter((d) => d.stageLabel === "Closed Lost").length;

    // Onboarding: deals that reached Subscription or Closed Won stage
    // (indicates the customer completed onboarding after signing up)
    // TODO: Replace with actual Google Calendar onboarding call detection with Mat
    // once calendar event data is available in the analytics pipeline
    const onboarding = sourceDeals.filter((d) => ONBOARDED_STAGES.has(d.stageLabel)).length;

    const wonWithValue = wonDeals.filter((d) => d.amount > 0);
    const avgContractValue = wonWithValue.length > 0
      ? Math.round(wonWithValue.reduce((s, d) => s + d.amount, 0) / wonWithValue.length)
      : null;

    // Churn: HubSpot "Churn" / "Closed Lost" stages OR Stripe subscription cancellation
    // Stripe churn events are matched by customer ID (deal name used as fallback identifier)
    const churnedDeals = sourceDeals.flatMap((deal) => {
      const stripeEvent = resolveStripeChurnEvent(deal, stripeChurnLookup);
      const hubspotChurned = HUBSPOT_CHURN_STAGES.has(deal.stageLabel);
      if (!hubspotChurned && !stripeEvent) return [];
      return [{
        deal,
        churnedAt: stripeEvent?.canceledAt ?? deal.updatedAt ?? null,
      }];
    });
    const churned = churnedDeals.length;

    // Not Activated: churned within 30 days of deal creation (signup)
    const notActivated = churnedDeals.filter(({ deal, churnedAt }) => {
      if (!deal.createdAt || !churnedAt) return false;
      const createdMs = new Date(deal.createdAt).getTime();
      const churnedMs = new Date(churnedAt).getTime();
      const daysSinceCreation = (churnedMs - createdMs) / 86_400_000;
      return daysSinceCreation <= 30;
    }).length;

    rows.push({
      source,
      totalLeads,
      demosBooked,
      demosBookedPct: pct(demosBooked, totalLeads),
      demoCompleted,
      demoCompletedPct: pct(demoCompleted, demosBooked),
      demoNoShow,
      demoNoShowPct: pct(demoNoShow, demosBooked),
      avgDaysToDecision,
      closedWon,
      closedWonPct: pct(closedWon, demoCompleted),
      closedLost,
      onboarding,
      onboardingPct: pct(onboarding, closedWon),
      avgContractValue,
      churned,
      churnedPct: pct(churned, closedWon),
      notActivated,
      notActivatedPct: pct(notActivated, churned),
    });
  }

  return rows.sort((a, b) => b.totalLeads - a.totalLeads);
}

export function buildDemoAnalyticsData(data: AnalyticsDashboardData): DemoAnalyticsData {
  const demos = buildDemoRecords(data);
  const totalScheduled = demos.length;
  const totalCompleted = demos.filter((d) => d.outcome === "completed").length;
  const totalNoShows = demos.filter((d) => d.outcome === "no-show").length;
  const noShowRate = totalScheduled > 0
    ? Math.round((totalNoShows / totalScheduled) * 1000) / 10
    : 0;

  // Avg lead time from scheduling to next stage
  const withNextStage = demos.filter((d) => d.daysToNextStage !== null);
  const avgLeadTimeDays = withNextStage.length > 0
    ? Math.round(
        (withNextStage.reduce((sum, d) => sum + (d.daysToNextStage ?? 0), 0) / withNextStage.length) * 10
      ) / 10
    : 0;

  return {
    totalScheduled,
    totalCompleted,
    totalNoShows,
    noShowRate,
    avgLeadTimeDays,
    demos,
    bySource: buildSourceBreakdown(demos),
    byOutcome: buildOutcomeBreakdown(demos),
    conversionFunnel: buildConversionFunnel(data, demos),
    weeklyTrend: buildWeeklyTrend(demos),
    journeyPaths: buildJourneyPathAnalysis(data),
  };
}
