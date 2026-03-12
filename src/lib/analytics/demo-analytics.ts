import { prisma } from "@/lib/prisma";
import { getRequiredOrganizationId } from "@/lib/request-context";
import type {
  AnalyticsDashboardData,
  DemoAnalysisStatus,
  DemoAnalyticsData,
  DemoConversionStep,
  DemoOutcome,
  DemoOutcomeBreakdown,
  DemoOutcomeConfidence,
  DemoRecord,
  DemoSourceBreakdown,
  DemoTranscriptStatus,
  DemoWeeklyTrend,
  JourneyPathRow,
} from "@/lib/analytics/types";

const POST_DEMO_STAGES = [
  "Demo Follow-Up",
  "Budgetary Quote Sent",
  "Payment Link Sent",
  "Free Trial",
  "Freemium",
  "Subscription",
  "Closed Won",
];
const MEETING_STATUSES_FOR_COMPLETION = new Set(["COMPLETED"]);
const MEETING_STATUSES_FOR_NO_SHOW = new Set(["NO_SHOW"]);
const MEETING_STATUSES_FOR_RESCHEDULE = new Set(["CANCELED"]);
const DEMO_ANALYSIS_ARTIFACT_TYPES = new Set([
  "demo_quality_scorecard",
  "demo_coaching_memo",
  "deal_next_step_memo",
]);

type HubSpotDeal = NonNullable<NonNullable<AnalyticsDashboardData["hubspot"]>["deals"]>[number];

export interface DemoMeetingContext {
  id: string;
  title: string;
  status: string;
  startAt: string;
  endAt: string | null;
  location: string | null;
  notes: string | null;
  dealId: string | null;
  dealName: string | null;
  hubspotDealId: string | null;
  companyName: string | null;
  attendeeEmails: string[];
  googleDriveFileId: string | null;
  googleDriveFileName: string | null;
  googleDriveFileUrl: string | null;
  transcriptMatchedAt: string | null;
  transcriptMatchConfidence: number | null;
  analysisArtifactId: string | null;
  demoQualityScore: number | null;
  demoQualitySummary: string | null;
  demoStrengths: string[];
  demoGaps: string[];
  analyzedAt: string | null;
  analysisArtifact: {
    id: string;
    runId: string;
    artifactType: string;
    summary: string | null;
    content: string | null;
    contentJson: Record<string, unknown> | null;
    sourceDocument: {
      id: string;
      title: string | null;
      sourceUrl: string | null;
      textContent: string | null;
    } | null;
  } | null;
  siblingArtifacts: Array<{
    id: string;
    artifactType: string;
    title: string;
    summary: string | null;
    content: string | null;
    contentJson: Record<string, unknown> | null;
  }>;
}

function normalizeKey(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function findArtifactText(
  artifacts: DemoMeetingContext["siblingArtifacts"],
  artifactType: string,
): string | null {
  const artifact = artifacts.find((item) => item.artifactType === artifactType) ?? null;
  if (!artifact) return null;
  return artifact.content ?? artifact.summary ?? null;
}

function cohortDemos(demos: DemoRecord[]): DemoRecord[] {
  return demos.filter((demo) => !demo.isUpcoming || demo.isUnscheduledFallback);
}

function historicalAnalysisDemos(demos: DemoRecord[]): DemoRecord[] {
  return demos.filter((demo) => !demo.isUpcoming);
}

function deriveOutcome(input: {
  now: Date;
  meeting: DemoMeetingContext | null;
  deal: HubSpotDeal | null;
  scheduledAt: string;
  isUpcoming: boolean;
}): DemoOutcome {
  if (input.isUpcoming) {
    return "pending";
  }

  const meetingStatus = normalizeKey(input.meeting?.status);
  if (MEETING_STATUSES_FOR_NO_SHOW.has(meetingStatus.toUpperCase())) {
    return "no-show";
  }
  if (MEETING_STATUSES_FOR_RESCHEDULE.has(meetingStatus.toUpperCase())) {
    return "rescheduled";
  }
  if (MEETING_STATUSES_FOR_COMPLETION.has(meetingStatus.toUpperCase())) {
    return "completed";
  }

  const stageLabel = input.deal?.stageLabel ?? null;
  if (stageLabel === "No-Show/Reschedule") return "no-show";
  if (stageLabel && POST_DEMO_STAGES.includes(stageLabel)) return "completed";
  if (stageLabel === "Demo Scheduled") {
    const daysSinceScheduled = Math.round(
      (input.now.getTime() - new Date(input.scheduledAt).getTime()) / 86_400_000,
    );
    return daysSinceScheduled > 1 ? "unknown" : "pending";
  }

  return "unknown";
}

function deriveDaysToNextStage(meeting: DemoMeetingContext | null, deal: HubSpotDeal | null): number | null {
  if (!meeting?.endAt || !deal?.updatedAt) return null;
  const from = new Date(meeting.endAt).getTime();
  const to = new Date(deal.updatedAt).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
  return Math.round((to - from) / 86_400_000);
}

function deriveTranscriptStatus(meeting: DemoMeetingContext | null): DemoTranscriptStatus {
  if (!meeting) return "missing";
  if (meeting.googleDriveFileId && meeting.transcriptMatchedAt) return "matched";
  if (meeting.googleDriveFileId) return "unmatched";
  return "missing";
}

function deriveAnalysisStatus(meeting: DemoMeetingContext | null): DemoAnalysisStatus {
  if (!meeting) return "missing";
  if (meeting.analyzedAt && meeting.demoQualityScore != null) return "ready";
  if (meeting.googleDriveFileId) return "pending";
  return "missing";
}

function deriveOutcomeConfidence(meeting: DemoMeetingContext | null): DemoOutcomeConfidence | null {
  const scorecard = asRecord(meeting?.analysisArtifact?.contentJson);
  const value = typeof scorecard?.outcomeConfidence === "string"
    ? scorecard.outcomeConfidence.trim().toLowerCase()
    : "";
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return null;
}

function buildThemeCounts(items: string[]): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const label = item.trim();
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 5);
}

function findHubSpotDealForMeeting(
  meeting: DemoMeetingContext,
  dealsByHubspotId: Map<string, HubSpotDeal>,
  dealsByName: Map<string, HubSpotDeal>,
): HubSpotDeal | null {
  if (meeting.hubspotDealId) {
    const byId = dealsByHubspotId.get(meeting.hubspotDealId);
    if (byId) return byId;
  }

  if (meeting.dealName) {
    const byName = dealsByName.get(normalizeKey(meeting.dealName));
    if (byName) return byName;
  }

  return null;
}

function buildDemoRecordFromMeeting(input: {
  now: Date;
  meeting: DemoMeetingContext;
  deal: HubSpotDeal | null;
}): DemoRecord {
  const scheduledAt = input.meeting.startAt;
  const normalizedMeetingStatus = normalizeKey(input.meeting.status).toUpperCase();
  const isUpcoming =
    !MEETING_STATUSES_FOR_COMPLETION.has(normalizedMeetingStatus) &&
    !MEETING_STATUSES_FOR_NO_SHOW.has(normalizedMeetingStatus) &&
    !MEETING_STATUSES_FOR_RESCHEDULE.has(normalizedMeetingStatus) &&
    new Date(scheduledAt).getTime() > input.now.getTime();
  const outcome = deriveOutcome({
    now: input.now,
    meeting: input.meeting,
    deal: input.deal,
    scheduledAt,
    isUpcoming,
  });
  const siblingArtifacts = input.meeting.siblingArtifacts;
  const transcriptSource = input.meeting.analysisArtifact?.sourceDocument;

  return {
    dealId: input.deal?.dealId ?? input.meeting.dealId ?? input.meeting.id,
    dealName: input.deal?.dealName ?? input.meeting.dealName ?? input.meeting.title,
    ownerName: input.deal?.repName ?? null,
    contactEmail: input.meeting.attendeeEmails[0] ?? input.deal?.primaryContactEmail ?? null,
    scheduledAt,
    meetingId: input.meeting.id,
    meetingTitle: input.meeting.title,
    meetingEndAt: input.meeting.endAt,
    meetingStatus: input.meeting.status,
    isUpcoming,
    isUnscheduledFallback: false,
    source: input.deal?.source || "Unknown",
    outcome,
    followUpSent: Boolean(input.deal?.stageLabel && POST_DEMO_STAGES.includes(input.deal.stageLabel)),
    daysToNextStage: deriveDaysToNextStage(input.meeting, input.deal),
    resultingStage: input.deal?.stageLabel ?? null,
    transcriptStatus: deriveTranscriptStatus(input.meeting),
    transcriptMatchConfidence: input.meeting.transcriptMatchConfidence,
    transcriptSourceUrl: transcriptSource?.sourceUrl ?? input.meeting.googleDriveFileUrl,
    transcriptSourceTitle: transcriptSource?.title ?? input.meeting.googleDriveFileName,
    transcriptSourceDocumentId: transcriptSource?.id ?? null,
    transcriptText: transcriptSource?.textContent ?? null,
    analysisStatus: deriveAnalysisStatus(input.meeting),
    qualityScore: input.meeting.demoQualityScore,
    qualitySummary: input.meeting.demoQualitySummary,
    strengths: input.meeting.demoStrengths,
    gaps: input.meeting.demoGaps,
    nextSteps: uniqueStrings(asRecord(input.meeting.analysisArtifact?.contentJson)?.nextSteps),
    customerSignals: uniqueStrings(asRecord(input.meeting.analysisArtifact?.contentJson)?.customerSignals),
    outcomeConfidence: deriveOutcomeConfidence(input.meeting),
    coachingMemo: findArtifactText(siblingArtifacts, "demo_coaching_memo"),
    nextStepMemo: findArtifactText(siblingArtifacts, "deal_next_step_memo"),
  };
}

function buildUnscheduledFallbackRecord(input: {
  deal: HubSpotDeal;
}): DemoRecord {
  const stageLabel = input.deal.stageLabel;
  const isUnscheduledFallback = stageLabel === "Demo Scheduled";
  const scheduledAt = input.deal.updatedAt ?? input.deal.createdAt ?? new Date().toISOString();
  const outcome: DemoOutcome =
    stageLabel === "No-Show/Reschedule"
      ? "no-show"
      : stageLabel && POST_DEMO_STAGES.includes(stageLabel)
        ? "completed"
        : "pending";

  return {
    dealId: input.deal.dealId,
    dealName: input.deal.dealName,
    ownerName: input.deal.repName ?? null,
    contactEmail: input.deal.primaryContactEmail ?? null,
    scheduledAt,
    meetingId: null,
    meetingTitle: null,
    meetingEndAt: null,
    meetingStatus: null,
    isUpcoming: isUnscheduledFallback,
    isUnscheduledFallback,
    source: input.deal.source || "Unknown",
    outcome,
    followUpSent: Boolean(stageLabel && POST_DEMO_STAGES.includes(stageLabel)),
    daysToNextStage: null,
    resultingStage: input.deal.stageLabel,
    transcriptStatus: "missing",
    transcriptMatchConfidence: null,
    transcriptSourceUrl: null,
    transcriptSourceTitle: null,
    transcriptSourceDocumentId: null,
    transcriptText: null,
    analysisStatus: "missing",
    qualityScore: null,
    qualitySummary: null,
    strengths: [],
    gaps: [],
    nextSteps: [],
    customerSignals: [],
    outcomeConfidence: null,
    coachingMemo: null,
    nextStepMemo: null,
  };
}

function buildDealAggregateRecord(input: {
  now: Date;
  deal: HubSpotDeal;
}): DemoRecord {
  const scheduledAt =
    input.deal.updatedAt ??
    input.deal.createdAt ??
    input.now.toISOString();
  const stageLabel = input.deal.stageLabel ?? null;
  const outcome: DemoOutcome =
    stageLabel === "No-Show/Reschedule"
      ? "no-show"
      : stageLabel && POST_DEMO_STAGES.includes(stageLabel)
        ? "completed"
        : stageLabel === "Demo Scheduled"
          ? "pending"
          : "unknown";

  return {
    dealId: input.deal.dealId,
    dealName: input.deal.dealName,
    ownerName: input.deal.repName ?? null,
    contactEmail: input.deal.primaryContactEmail ?? null,
    scheduledAt,
    meetingId: null,
    meetingTitle: null,
    meetingEndAt: null,
    meetingStatus: null,
    isUpcoming: false,
    isUnscheduledFallback: false,
    source: input.deal.source || "Unknown",
    outcome,
    followUpSent: Boolean(stageLabel && POST_DEMO_STAGES.includes(stageLabel)),
    daysToNextStage: null,
    resultingStage: stageLabel,
    transcriptStatus: "missing",
    transcriptMatchConfidence: null,
    transcriptSourceUrl: null,
    transcriptSourceTitle: null,
    transcriptSourceDocumentId: null,
    transcriptText: null,
    analysisStatus: "missing",
    qualityScore: null,
    qualitySummary: null,
    strengths: [],
    gaps: [],
    nextSteps: [],
    customerSignals: [],
    outcomeConfidence: null,
    coachingMemo: null,
    nextStepMemo: null,
  };
}

function buildSourceBreakdown(demos: DemoRecord[]): DemoSourceBreakdown[] {
  const historical = cohortDemos(demos);
  const bySource = new Map<string, { scheduled: number; completed: number; noShows: number }>();

  for (const demo of historical) {
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
  const historical = cohortDemos(demos);
  const total = historical.length;
  const counts: Record<DemoOutcome, number> = {
    completed: 0,
    "no-show": 0,
    rescheduled: 0,
    pending: 0,
    unknown: 0,
  };

  for (const demo of historical) {
    counts[demo.outcome] += 1;
  }

  return (Object.entries(counts) as [DemoOutcome, number][]).map(([outcome, count]) => ({
    outcome,
    count,
    pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
  }));
}

function buildConversionFunnel(demos: DemoRecord[]): DemoConversionStep[] {
  const historical = cohortDemos(demos);
  const scheduledCount = historical.length;
  if (scheduledCount === 0) return [];

  const completedCount = historical.filter((d) => d.outcome === "completed").length;
  const followUpCount = historical.filter((d) => d.followUpSent).length;
  const closedWonCount = historical.filter((d) => d.resultingStage === "Closed Won").length;

  const steps: DemoConversionStep[] = [
    { label: "Demo Scheduled", count: scheduledCount, conversionFromPrevious: null },
    {
      label: "Demo Completed",
      count: completedCount,
      conversionFromPrevious: Math.round((completedCount / scheduledCount) * 1000) / 10,
    },
    {
      label: "Follow-Up Sent",
      count: followUpCount,
      conversionFromPrevious: completedCount > 0
        ? Math.round((followUpCount / completedCount) * 1000) / 10
        : null,
    },
    {
      label: "Closed Won",
      count: closedWonCount,
      conversionFromPrevious: Math.round((closedWonCount / scheduledCount) * 1000) / 10,
    },
  ];

  return steps;
}

function buildWeeklyTrend(demos: DemoRecord[]): DemoWeeklyTrend[] {
  const historical = cohortDemos(demos);
  const byWeek = new Map<string, { scheduled: number; completed: number; noShows: number }>();

  for (const demo of historical) {
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
  "Demo Scheduled",
  "No-Show/Reschedule",
  ...POST_DEMO_STAGES,
]);
const ONBOARDED_STAGES = new Set(["Subscription", "Closed Won"]);
const HUBSPOT_CHURN_STAGES = new Set(["Churn", "Closed Lost"]);

type StripeChurnEvent = NonNullable<
  AnalyticsDashboardData["stripe"]
>["subscriptions"]["recentChurnEvents"][number];

function buildStripeChurnLookup(events: StripeChurnEvent[]): Map<string, StripeChurnEvent> {
  const lookup = new Map<string, StripeChurnEvent>();
  for (const event of events) {
    const key = normalizeKey(event.customer);
    if (!key) continue;
    const existing = lookup.get(key);
    if (!existing || new Date(event.canceledAt).getTime() > new Date(existing.canceledAt).getTime()) {
      lookup.set(key, event);
    }
  }
  return lookup;
}

function resolveStripeChurnEvent(
  deal: { dealId: string; dealName: string; stripeCustomerId?: string | null },
  lookup: Map<string, StripeChurnEvent>,
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

function pct(num: number, denom: number): number {
  return denom > 0 ? Math.round((num / denom) * 1000) / 10 : 0;
}

function buildJourneyPathAnalysis(data: AnalyticsDashboardData): JourneyPathRow[] {
  const deals = data.hubspot?.deals ?? [];
  const stripeChurnEvents = data.stripe?.subscriptions?.recentChurnEvents ?? [];
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

    const terminalDeals = sourceDeals.filter((d) => TERMINAL_STAGES.has(d.stageLabel) && d.updatedAt);
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
    const onboarding = sourceDeals.filter((d) => ONBOARDED_STAGES.has(d.stageLabel)).length;
    const wonWithValue = wonDeals.filter((d) => d.amount > 0);
    const avgContractValue = wonWithValue.length > 0
      ? Math.round(wonWithValue.reduce((sum, deal) => sum + deal.amount, 0) / wonWithValue.length)
      : null;

    const churnedDeals = sourceDeals.flatMap((deal) => {
      const stripeEvent = resolveStripeChurnEvent(deal, stripeChurnLookup);
      const hubspotChurned = HUBSPOT_CHURN_STAGES.has(deal.stageLabel);
      if (!hubspotChurned && !stripeEvent) return [];
      return [{
        deal,
        churnedAt: stripeEvent?.canceledAt ?? deal.updatedAt ?? null,
      }];
    });

    const notActivatedDeals = churnedDeals.filter(({ deal, churnedAt }) => {
      if (!deal.createdAt || !churnedAt) return false;
      const createdMs = new Date(deal.createdAt).getTime();
      const churnedMs = new Date(churnedAt).getTime();
      return (churnedMs - createdMs) / 86_400_000 <= 60;
    });

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
      churned: churnedDeals.length,
      churnedPct: pct(churnedDeals.length, closedWon),
      notActivated: notActivatedDeals.length,
      notActivatedPct: pct(notActivatedDeals.length, closedWon),
    });
  }

  return rows.sort((a, b) => b.totalLeads - a.totalLeads);
}

export async function listDemoAnalyticsMeetings(): Promise<DemoMeetingContext[]> {
  const organizationId = getRequiredOrganizationId();
  const meetings = await prisma.dealMeeting.findMany({
    where: {
      deal: {
        organizationId,
      },
    },
    include: {
      deal: {
        select: {
          id: true,
          name: true,
          hubspotDealId: true,
        },
      },
      company: {
        select: {
          id: true,
          name: true,
        },
      },
      attendees: {
        select: {
          email: true,
        },
      },
      analysisArtifact: {
        select: {
          id: true,
          runId: true,
          artifactType: true,
          summary: true,
          content: true,
          contentJson: true,
          sourceDocument: {
            select: {
              id: true,
              title: true,
              sourceUrl: true,
              textContent: true,
            },
          },
        },
      },
    },
    orderBy: {
      startAt: "desc",
    },
  });

  const runIds = Array.from(
    new Set(
      meetings
        .map((meeting) => meeting.analysisArtifact?.runId ?? null)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const siblingArtifacts = runIds.length > 0
    ? await prisma.automationArtifact.findMany({
        where: {
          runId: { in: runIds },
          artifactType: { in: Array.from(DEMO_ANALYSIS_ARTIFACT_TYPES) },
        },
        select: {
          id: true,
          runId: true,
          artifactType: true,
          title: true,
          summary: true,
          content: true,
          contentJson: true,
        },
      })
    : [];
  const siblingByRunId = new Map<string, typeof siblingArtifacts>();
  for (const artifact of siblingArtifacts) {
    const group = siblingByRunId.get(artifact.runId) ?? [];
    group.push(artifact);
    siblingByRunId.set(artifact.runId, group);
  }

  return meetings.map((meeting) => ({
    id: meeting.id,
    title: meeting.title,
    status: meeting.status,
    startAt: meeting.startAt.toISOString(),
    endAt: meeting.endAt?.toISOString() ?? null,
    location: meeting.location,
    notes: meeting.notes,
    dealId: meeting.dealId,
    dealName: meeting.deal?.name ?? null,
    hubspotDealId: meeting.deal?.hubspotDealId ?? null,
    companyName: meeting.company?.name ?? null,
    attendeeEmails: meeting.attendees.map((attendee) => attendee.email).filter(Boolean) as string[],
    googleDriveFileId: meeting.googleDriveFileId,
    googleDriveFileName: meeting.googleDriveFileName,
    googleDriveFileUrl: meeting.googleDriveFileUrl,
    transcriptMatchedAt: meeting.transcriptMatchedAt?.toISOString() ?? null,
    transcriptMatchConfidence: meeting.transcriptMatchConfidence,
    analysisArtifactId: meeting.analysisArtifactId,
    demoQualityScore: meeting.demoQualityScore,
    demoQualitySummary: meeting.demoQualitySummary,
    demoStrengths: uniqueStrings(meeting.demoStrengthsJson),
    demoGaps: uniqueStrings(meeting.demoGapsJson),
    analyzedAt: meeting.analyzedAt?.toISOString() ?? null,
    analysisArtifact: meeting.analysisArtifact
      ? {
          id: meeting.analysisArtifact.id,
          runId: meeting.analysisArtifact.runId,
          artifactType: meeting.analysisArtifact.artifactType,
          summary: meeting.analysisArtifact.summary,
          content: meeting.analysisArtifact.content,
          contentJson: asRecord(meeting.analysisArtifact.contentJson),
          sourceDocument: meeting.analysisArtifact.sourceDocument
            ? {
                id: meeting.analysisArtifact.sourceDocument.id,
                title: meeting.analysisArtifact.sourceDocument.title,
                sourceUrl: meeting.analysisArtifact.sourceDocument.sourceUrl,
                textContent: meeting.analysisArtifact.sourceDocument.textContent,
              }
            : null,
        }
      : null,
    siblingArtifacts: meeting.analysisArtifact
      ? (siblingByRunId.get(meeting.analysisArtifact.runId) ?? []).map((artifact) => ({
          id: artifact.id,
          artifactType: artifact.artifactType,
          title: artifact.title,
          summary: artifact.summary,
          content: artifact.content,
          contentJson: asRecord(artifact.contentJson),
        }))
      : [],
  }));
}

export function buildDemoAnalyticsData(
  data: AnalyticsDashboardData,
  input?: { meetings?: DemoMeetingContext[] },
): DemoAnalyticsData {
  const now = new Date(
    data.hubspot?._meta?.fetchedAt ??
      data.timeRange?.to ??
      new Date().toISOString(),
  );
  const meetings = input?.meetings ?? [];
  const deals = data.hubspot?.deals ?? [];
  const dealsByHubspotId = new Map(deals.map((deal) => [deal.dealId, deal] as const));
  const dealsByName = new Map(deals.map((deal) => [normalizeKey(deal.dealName), deal] as const));
  const aggregateDemos = deals
    .filter((deal) => DEMO_ENTRY_STAGES.has(deal.stageLabel))
    .map((deal) => buildDealAggregateRecord({ now, deal }));

  const meetingPairs = meetings.map((meeting) => ({
    meeting,
    deal: findHubSpotDealForMeeting(meeting, dealsByHubspotId, dealsByName),
  }));

  const meetingBackedDemos = meetingPairs.map(({ meeting, deal }) =>
    buildDemoRecordFromMeeting({
      now,
      meeting,
      deal,
    }),
  );

  const coveredHubSpotDealIds = new Set(
    meetingPairs
      .map(({ deal, meeting }) => deal?.dealId ?? meeting.hubspotDealId ?? null)
      .filter((dealId): dealId is string => Boolean(dealId)),
  );

  const hubSpotFallbacks = deals
    .filter((deal) => deal.stageLabel === "Demo Scheduled" && !coveredHubSpotDealIds.has(deal.dealId))
    .map((deal) => buildUnscheduledFallbackRecord({ deal }));

  const demos = [...meetingBackedDemos, ...hubSpotFallbacks].sort((a, b) => {
    const timeDiff = new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.dealName.localeCompare(b.dealName);
  });

  const cohort = aggregateDemos;
  const historical = historicalAnalysisDemos(demos);
  const totalScheduled = cohort.length;
  const totalCompleted = cohort.filter((demo) => demo.outcome === "completed").length;
  const totalNoShows = cohort.filter((demo) => demo.outcome === "no-show").length;
  const noShowRate = totalScheduled > 0
    ? Math.round((totalNoShows / totalScheduled) * 1000) / 10
    : 0;

  const withNextStage = cohort.filter((demo) => demo.daysToNextStage !== null);
  const avgLeadTimeDays = withNextStage.length > 0
    ? Math.round(
        (withNextStage.reduce((sum, demo) => sum + (demo.daysToNextStage ?? 0), 0) / withNextStage.length) * 10,
      ) / 10
    : 0;

  const analyzed = historical.filter((demo) => demo.analysisStatus === "ready" && demo.qualityScore != null);
  const matchedTranscripts = historical.filter((demo) => demo.transcriptStatus === "matched");

  return {
    totalScheduled,
    totalCompleted,
    totalNoShows,
    noShowRate,
    avgLeadTimeDays,
    upcomingCount: demos.filter((demo) => demo.isUpcoming).length,
    meetingBackedUpcomingCount: demos.filter((demo) => demo.isUpcoming && !demo.isUnscheduledFallback).length,
    unscheduledDemoCount: hubSpotFallbacks.filter((demo) => demo.isUnscheduledFallback).length,
    analyzedDemoCount: analyzed.length,
    avgDemoQualityScore: analyzed.length > 0
      ? Math.round((analyzed.reduce((sum, demo) => sum + (demo.qualityScore ?? 0), 0) / analyzed.length) * 10) / 10
      : 0,
    transcriptCoveragePct: historical.length > 0
      ? Math.round((matchedTranscripts.length / historical.length) * 1000) / 10
      : 0,
    topStrengthThemes: buildThemeCounts(analyzed.flatMap((demo) => demo.strengths)),
    topGapThemes: buildThemeCounts(analyzed.flatMap((demo) => demo.gaps)),
    demos,
    upcomingDemos: demos.filter((demo) => demo.isUpcoming).sort((a, b) => {
      if (a.isUnscheduledFallback !== b.isUnscheduledFallback) {
        return a.isUnscheduledFallback ? 1 : -1;
      }
      return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    }),
    bySource: buildSourceBreakdown(cohort),
    byOutcome: buildOutcomeBreakdown(cohort),
    conversionFunnel: buildConversionFunnel(cohort),
    weeklyTrend: buildWeeklyTrend(cohort),
    journeyPaths: buildJourneyPathAnalysis(data),
  };
}
