import type {
  AnalyticsDashboardData,
  DemoAnalyticsData,
  DemoConversionStep,
  DemoOutcome,
  DemoOutcomeBreakdown,
  DemoRecord,
  DemoSourceBreakdown,
  DemoWeeklyTrend,
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
  };
}
