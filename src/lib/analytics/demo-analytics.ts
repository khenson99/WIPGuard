import type {
  AnalyticsDashboardData,
  DemoAnalyticsData,
  DemoConversionStep,
  DemoOutcome,
  DemoOutcomeBreakdown,
  DemoRecord,
  DemoSourceBreakdown,
  DemoWeeklyTrend,
    let outcome = inferOutcome(deal.stageLabel);
    
    // Fallback scheduledAt to createdAt since updatedAt gets overwritten too often
    const scheduledAt = deal.createdAt ?? new Date().toISOString();

    // If a demo is "pending" but the scheduled date is in the past, mark it unknown (or rescheduled if preferred, 
    // pending should strictly be future)
    // We will mark them as "no-show" or "rescheduled" if they are in the past and still pending.
    // The user requested: "pending demos that are in the past are just ones that we haven't updated. They should be unknown. Pending demos should just bei n the future"
    // Since "unknown" isn't a DemoOutcome, we can add it, or map to "pending" but handle it later. We will add "unknown" to DemoOutcome.
    if (outcome === "pending" && scheduledAt) {
      // rough heuristic: if created > 14 days ago and still pending, it's unknown.
      // better yet, just look at the date.
      const daysSinceScheduled = Math.round(
        (Date.now() - new Date(scheduledAt).getTime()) / 86_400_000
      );
      if (daysSinceScheduled > 1) { // 1 day grace period
        outcome = "unknown" as DemoOutcome; 
      }
    }

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
      scheduledAt,
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
  const counts: Record<DemoOutcome, number> = { completed: 0, "no-show": 0, rescheduled: 0, pending: 0, unknown: 0 };

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

    journeyPaths: buildJourneyPathAnalysis(data),
  };
}
