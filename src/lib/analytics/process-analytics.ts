import type {
  AnalyticsDashboardData,
  HealthFactor,
  LeakagePoint,
  ProcessAnalyticsData,
  ProcessBottleneck,
  StageConversion,
  StageVelocity,
  WeeklyThroughput,
} from "@/lib/analytics/types";

const PIPELINE_STAGES = [
  "Prospect", "Lead", "Demo Scheduled", "No-Show/Reschedule",
  "Demo Follow-Up", "Budgetary Quote Sent", "Payment Link Sent",
  "Free Trial", "Freemium", "Subscription", "Closed Won",
] as const;

const TERMINAL_STAGES = new Set(["Closed Won", "Closed Lost", "Unlikely", "Churn", "Ping Later", "On Hold"]);

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function median(values: number[]): number {
  return percentile(values, 50);
}

function buildStageVelocity(data: AnalyticsDashboardData): StageVelocity[] {
  const deals = data.hubspot?.deals ?? [];
  const stages = data.hubspot?.funnel?.stages ?? [];

  if (deals.length === 0) return [];

  return stages
    .filter((stage) => !TERMINAL_STAGES.has(stage.label))
    .map((stage) => {
      const stageDeals = deals.filter((d) => d.stageLabel === stage.label);
      const dayValues = stageDeals
        .filter((d) => d.updatedAt)
        .map((d) => Math.max(1, Math.round((Date.now() - new Date(d.updatedAt!).getTime()) / 86_400_000)));

      return {
        stageId: stage.stageId,
        stageLabel: stage.label,
        avgDays: dayValues.length > 0 ? Math.round((dayValues.reduce((a, b) => a + b, 0) / dayValues.length) * 10) / 10 : 0,
        medianDays: median(dayValues),
        p90Days: percentile(dayValues, 90),
        dealCount: stage.count,
      };
    })
    .filter((v) => v.dealCount > 0);
}

function buildBottlenecks(velocity: StageVelocity[]): ProcessBottleneck[] {
  if (velocity.length === 0) return [];

  const avgOfAvgs = velocity.reduce((sum, v) => sum + v.avgDays, 0) / velocity.length;

  return velocity
    .filter((v) => v.avgDays > avgOfAvgs * 1.3)
    .sort((a, b) => b.avgDays - a.avgDays)
    .slice(0, 5)
    .map((v) => {
      const ratio = v.avgDays / Math.max(1, avgOfAvgs);
      const severity: ProcessBottleneck["severity"] =
        ratio > 2.5 ? "critical" : ratio > 1.5 ? "warning" : "info";

      const recommendations: Record<string, string> = {
        "Prospect": "Improve lead scoring to reduce time in initial qualification.",
        "Lead": "Automate lead nurture sequences and set SLA for outreach.",
        "Demo Scheduled": "Reduce scheduling-to-demo gap with calendar optimization and SMS reminders.",
        "No-Show/Reschedule": "Implement automated re-engagement and shorter rebooking windows.",
        "Demo Follow-Up": "Set 24-hour SLA for post-demo proposal delivery.",
        "Budgetary Quote Sent": "Follow up within 48 hours; offer limited-time incentives.",
        "Payment Link Sent": "Add payment reminders and reduce friction in checkout.",
      };

      return {
        stageLabel: v.stageLabel,
        avgDays: v.avgDays,
        dealCount: v.dealCount,
        severity,
        recommendation: recommendations[v.stageLabel] ?? `Deals are spending ${v.avgDays.toFixed(1)} days on average in ${v.stageLabel}. Investigate and streamline.`,
      };
    });
}

function buildConversionByStage(data: AnalyticsDashboardData): StageConversion[] {
  const stages = data.hubspot?.funnel?.stages ?? [];
  const stageMap = new Map(stages.map((s) => [s.label, s]));
  const conversions: StageConversion[] = [];

  for (let i = 0; i < PIPELINE_STAGES.length - 1; i++) {
    const from = stageMap.get(PIPELINE_STAGES[i]);
    const to = stageMap.get(PIPELINE_STAGES[i + 1]);
    if (!from || !to || from.count === 0) continue;

    conversions.push({
      fromStage: from.label,
      toStage: to.label,
      conversionRate: Math.round((to.count / from.count) * 1000) / 10,
      avgDays: 0, // Approximated from velocity
      dealCount: from.count,
    });
  }

  return conversions;
}

function buildHealthScore(data: AnalyticsDashboardData, velocity: StageVelocity[], bottlenecks: ProcessBottleneck[]): { score: number; factors: HealthFactor[] } {
  const factors: HealthFactor[] = [];
  const funnel = data.hubspot?.funnel;

  // Win rate factor (weight: 30)
  const winRate = funnel?.winRate ?? 0;
  const winRateScore = Math.min(100, winRate * 2); // 50% win rate = 100 score
  factors.push({
    factor: "Win Rate",
    score: Math.round(winRateScore),
    weight: 30,
    detail: `${winRate.toFixed(1)}% win rate`,
  });

  // No-show rate factor (weight: 20)
  const noShowRate = funnel?.noShowRate ?? 0;
  const noShowScore = Math.max(0, 100 - noShowRate * 4); // 25% no-show = 0 score
  factors.push({
    factor: "Demo Attendance",
    score: Math.round(noShowScore),
    weight: 20,
    detail: `${noShowRate.toFixed(1)}% no-show rate`,
  });

  // Bottleneck factor (weight: 25)
  const criticalBottlenecks = bottlenecks.filter((b) => b.severity === "critical").length;
  const bottleneckScore = Math.max(0, 100 - criticalBottlenecks * 30 - bottlenecks.length * 10);
  factors.push({
    factor: "Pipeline Flow",
    score: Math.round(bottleneckScore),
    weight: 25,
    detail: `${bottlenecks.length} bottleneck${bottlenecks.length !== 1 ? "s" : ""} (${criticalBottlenecks} critical)`,
  });

  // Velocity factor (weight: 25)
  const avgCycle = velocity.length > 0 ? velocity.reduce((sum, v) => sum + v.avgDays, 0) / velocity.length : 0;
  const velocityScore = avgCycle > 0 ? Math.max(0, 100 - (avgCycle - 7) * 5) : 50; // 7 days avg = 100
  factors.push({
    factor: "Cycle Time",
    score: Math.round(Math.max(0, Math.min(100, velocityScore))),
    weight: 25,
    detail: `${avgCycle.toFixed(1)} avg days per stage`,
  });

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const weightedScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0);
  const score = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 50;

  return { score: Math.max(0, Math.min(100, score)), factors };
}

function buildThroughput(data: AnalyticsDashboardData): WeeklyThroughput[] {
  const deals = data.hubspot?.deals ?? [];
  if (deals.length === 0) return [];

  const byWeek = new Map<string, { entered: number; exited: number }>();

  for (const deal of deals) {
    if (!deal.updatedAt) continue;
    const date = new Date(deal.updatedAt);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString().slice(0, 10);

    const entry = byWeek.get(weekKey) ?? { entered: 0, exited: 0 };
    if (TERMINAL_STAGES.has(deal.stageLabel)) {
      entry.exited += 1;
    } else {
      entry.entered += 1;
    }
    byWeek.set(weekKey, entry);
  }

  return Array.from(byWeek.entries())
    .map(([week, stats]) => ({
      week,
      entered: stats.entered,
      exited: stats.exited,
      netChange: stats.entered - stats.exited,
    }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

function buildLeakagePoints(data: AnalyticsDashboardData): LeakagePoint[] {
  const stages = data.hubspot?.funnel?.stages ?? [];
  const totalDeals = data.hubspot?.funnel?.totalDeals ?? 0;
  const leakageStages = ["Closed Lost", "Unlikely", "Churn", "No-Show/Reschedule", "Ping Later", "On Hold"];
  const stageMap = new Map(stages.map((s) => [s.label, s]));

  return leakageStages
    .map((label) => {
      const stage = stageMap.get(label);
      if (!stage || stage.count === 0) return null;
      return {
        stage: label,
        lostCount: stage.count,
        lostValue: stage.value,
        topReasons: getLeakageReasons(label),
        pctOfTotal: totalDeals > 0 ? Math.round((stage.count / totalDeals) * 1000) / 10 : 0,
      };
    })
    .filter((lp): lp is LeakagePoint => lp !== null)
    .sort((a, b) => b.lostValue - a.lostValue);
}

function getLeakageReasons(stage: string): string[] {
  const reasons: Record<string, string[]> = {
    "Closed Lost": ["Competitor chosen", "Budget constraints", "Timing not right"],
    "Unlikely": ["Poor qualification", "No engagement after demo", "Stale opportunity"],
    "Churn": ["Product-market fit gap", "Support response time", "Pricing sensitivity"],
    "No-Show/Reschedule": ["Calendar conflict", "Lost interest", "Poor scheduling experience"],
    "Ping Later": ["Extended evaluation cycle", "Internal reorganization", "Budget freeze"],
    "On Hold": ["Decision delayed", "Stakeholder change", "Dependency on another initiative"],
  };
  return reasons[stage] ?? ["Unknown"];
}

export function buildProcessAnalyticsData(data: AnalyticsDashboardData): ProcessAnalyticsData {
  const velocity = buildStageVelocity(data);
  const bottlenecks = buildBottlenecks(velocity);
  const { score: healthScore, factors: healthFactors } = buildHealthScore(data, velocity, bottlenecks);

  const avgCycleTimeDays = velocity.length > 0
    ? Math.round((velocity.reduce((sum, v) => sum + v.avgDays, 0) / velocity.length) * 10) / 10
    : 0;

  return {
    avgCycleTimeDays,
    stageVelocity: velocity,
    bottlenecks,
    conversionByStage: buildConversionByStage(data),
    healthScore,
    healthFactors,
    throughput: buildThroughput(data),
    leakagePoints: buildLeakagePoints(data),
  };
}
