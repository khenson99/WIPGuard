import {
  CustomerExternalProvider,
  CustomerRecordStatus,
  CustomerSuccessNoteSource,
  CustomerSuccessNoteVisibility,
  CustomerSuccessAlertSeverity,
  CustomerSuccessAlertSource,
  CustomerSuccessAlertStatus,
  CustomerSuccessOutreachChannel,
  CustomerSuccessOutreachStatus,
  CustomerSuccessPlanStatus,
  MeetingStatus,
  Priority,
  Prisma,
  TaskStatus,
} from "@/generated/prisma/client";
import { buildOutboxIdempotencyKey, publishDomainEvent } from "@/lib/event-bus";
import { prisma } from "@/lib/prisma";
import { runWithContextAsync } from "@/lib/request-context";
import { getNextColumnOrder } from "@/lib/task-order";
import type { CustomerSuccessActor } from "@/lib/customer-success/access";
import type {
  CreateCustomerSuccessNoteInput,
  CreateCustomerSuccessPlanInput,
  CreateCustomerSuccessTaskInput,
  CustomerSuccessAccountDetail,
  CustomerSuccessActivityFeed,
  CustomerSuccessAlert,
  CustomerSuccessAlertFeed,
  CustomerSuccessEvent,
  CustomerSuccessHealth,
  CustomerSuccessHealthComponent,
  CustomerSuccessLeadingIndicator,
  CustomerSuccessPortfolio,
  CustomerSuccessPortfolioRelationshipSummary,
  CustomerSuccessProviderLink,
  CustomerSuccessRelationshipIntelligence,
  CustomerSuccessRelationshipReason,
  CustomerSuccessRetentionSummary,
  CustomerSuccessTaskSummary,
  CustomerSuccessStakeholder,
  SendCustomerSuccessOutreachInput,
  UpdateCustomerSuccessAlertStatusInput,
} from "@/lib/customer-success/types";

const USER_SUMMARY_SELECT = {
  id: true,
  name: true,
  email: true,
} satisfies Prisma.UserSelect;

const CONTACT_SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  title: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DealContactSelect;

const CUSTOMER_RECORD_INCLUDE = {
  owner: { select: USER_SUMMARY_SELECT },
  dealCompany: {
    include: {
      contacts: {
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: CONTACT_SUMMARY_SELECT,
      },
    },
  },
  primaryDeal: {
    include: {
      contacts: {
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: CONTACT_SUMMARY_SELECT,
      },
    },
  },
  externalRefs: {
    orderBy: [{ provider: "asc" }, { updatedAt: "desc" }],
  },
  notes: {
    orderBy: [{ createdAt: "desc" }],
    take: 12,
    include: {
      authorUser: { select: USER_SUMMARY_SELECT },
    },
  },
  plans: {
    orderBy: [{ updatedAt: "desc" }],
    include: {
      ownerUser: { select: USER_SUMMARY_SELECT },
      milestones: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  },
  alerts: {
    orderBy: [{ updatedAt: "desc" }, { openedAt: "desc" }],
    include: {
      ownerUser: { select: USER_SUMMARY_SELECT },
    },
  },
  outreachMessages: {
    orderBy: [{ createdAt: "desc" }],
    take: 12,
    include: {
      authorUser: { select: USER_SUMMARY_SELECT },
    },
  },
  tasks: {
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 16,
  },
  meetings: {
    orderBy: [{ startAt: "desc" }],
    take: 12,
    include: {
      attendees: {
        select: CONTACT_SUMMARY_SELECT,
      },
    },
  },
} satisfies Prisma.CustomerRecordInclude;

type CustomerRecordWithRelations = Prisma.CustomerRecordGetPayload<{
  include: typeof CUSTOMER_RECORD_INCLUDE;
}>;
type ContactSummary = Prisma.DealContactGetPayload<{
  select: typeof CONTACT_SUMMARY_SELECT;
}>;

export interface CustomerSuccessAccountSnapshot {
  id: string;
  name: string;
  segment: string | null;
  tier: string | null;
  lifecycleStage: string;
  ownerName: string | null;
  ownerEmail: string | null;
  status: string;
  primaryDealAmount: number | null;
  renewalDate: Date | null;
  paymentStatus: string | null;
  expansionPotential: string | null;
  externalProviders: CustomerExternalProvider[];
  externalRefs: Array<{
    provider: CustomerExternalProvider;
    externalObjectType: string;
    externalId: string;
    label: string | null;
    isPrimary: boolean;
    metadata: Record<string, unknown> | null;
    updatedAt: Date;
  }>;
  contacts: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    title: string | null;
    updatedAt: Date;
    createdAt: Date;
  }>;
  notes: Array<{
    id: string;
    title: string | null;
    body: string;
    createdAt: Date;
    source: string;
    authorName: string | null;
  }>;
  alerts: Array<{
    id: string;
    title: string;
    category: string;
    severity: string;
    status: string;
    slaStatus: string;
    source: string;
    openedAt: Date;
    updatedAt: Date;
    resolvedAt: Date | null;
    suggestedAction: string | null;
    evidence: string[];
  }>;
  plans: Array<{
    id: string;
    name: string;
    templateKey: string | null;
    status: string;
    startedAt: Date | null;
    targetDate: Date | null;
    completedAt: Date | null;
    milestones: Array<{
      id: string;
      title: string;
      status: string;
      dueDate: Date | null;
    }>;
  }>;
  outreach: Array<{
    id: string;
    templateKey: string | null;
    status: string;
    subject: string | null;
    recipientName: string | null;
    recipientAddress: string;
    sentAt: Date | null;
    createdAt: Date;
    channel: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate: Date | null;
    createdAt: Date;
    updatedAt: Date;
    completedOn: Date | null;
  }>;
  meetings: Array<{
    id: string;
    title: string;
    status: string;
    startAt: Date;
    attendees: Array<{
      id: string;
      firstName: string;
      lastName: string;
      email: string | null;
      title: string | null;
    }>;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export class CustomerSuccessServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "CustomerSuccessServiceError";
  }
}

const HEALTH_WEIGHTS = {
  adoption: 0.24,
  engagement: 0.22,
  relationship: 0.2,
  support: 0.2,
  commercial: 0.14,
} as const;

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function withCustomerSuccessContext<T>(
  actor: CustomerSuccessActor,
  fn: () => Promise<T>
): Promise<T> {
  return runWithContextAsync({ organizationId: actor.organizationId, userId: actor.id }, fn);
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function toJsonMetadata(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  if (!value || Object.keys(value).length === 0) return undefined;
  return value as Prisma.InputJsonValue;
}

function parseDateInput(value: string | undefined, fieldName: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new CustomerSuccessServiceError(`${fieldName} must be a valid ISO date`, 400);
  }
  return parsed;
}

function parseTaskStatusInput(value: string | undefined): TaskStatus {
  if (!value) return TaskStatus.BACKLOG;
  if (Object.values(TaskStatus).includes(value as TaskStatus)) {
    return value as TaskStatus;
  }
  throw new CustomerSuccessServiceError("Invalid task status", 400);
}

function parsePriorityInput(value: string | undefined): Priority {
  if (!value) return Priority.P2;
  if (Object.values(Priority).includes(value as Priority)) {
    return value as Priority;
  }
  throw new CustomerSuccessServiceError("Invalid task priority", 400);
}

function parseNoteSourceInput(value: string | undefined): CustomerSuccessNoteSource {
  if (!value) return CustomerSuccessNoteSource.MANUAL;
  if (Object.values(CustomerSuccessNoteSource).includes(value as CustomerSuccessNoteSource)) {
    return value as CustomerSuccessNoteSource;
  }
  throw new CustomerSuccessServiceError("Invalid customer-success note source", 400);
}

function parseNoteVisibilityInput(value: string | undefined): CustomerSuccessNoteVisibility {
  if (!value) return CustomerSuccessNoteVisibility.INTERNAL;
  if (Object.values(CustomerSuccessNoteVisibility).includes(value as CustomerSuccessNoteVisibility)) {
    return value as CustomerSuccessNoteVisibility;
  }
  throw new CustomerSuccessServiceError("Invalid customer-success note visibility", 400);
}

function parseAlertStatusInput(value: string): CustomerSuccessAlertStatus {
  if (Object.values(CustomerSuccessAlertStatus).includes(value as CustomerSuccessAlertStatus)) {
    return value as CustomerSuccessAlertStatus;
  }
  throw new CustomerSuccessServiceError("Invalid customer-success alert status", 400);
}

function parseOutreachChannelInput(value: string): CustomerSuccessOutreachChannel {
  if (Object.values(CustomerSuccessOutreachChannel).includes(value as CustomerSuccessOutreachChannel)) {
    return value as CustomerSuccessOutreachChannel;
  }
  throw new CustomerSuccessServiceError("Invalid outreach channel", 400);
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

function daysUntil(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

function mapScoreToGrade(score: number): CustomerSuccessHealth["grade"] {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function mapScoreToStatus(score: number): CustomerSuccessHealthComponent["status"] {
  if (score >= 80) return "healthy";
  if (score >= 65) return "watch";
  return "risk";
}

function mapTrendScore(value: number): CustomerSuccessHealth["trend"] {
  if (value >= 0.35) return "improving";
  if (value <= -0.35) return "declining";
  return "stable";
}

function trendWeight(trend: CustomerSuccessHealth["trend"]): number {
  if (trend === "improving") return 1;
  if (trend === "declining") return -1;
  return 0;
}

function toEvidenceList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item === null || item === undefined) return "";
      return String(item).trim();
    })
    .filter((item) => item.length > 0);
}

function isAlertOpen(status: string): boolean {
  return status === CustomerSuccessAlertStatus.OPEN || status === CustomerSuccessAlertStatus.IN_PROGRESS;
}

function isHighSeverity(severity: string): boolean {
  return severity === CustomerSuccessAlertSeverity.HIGH || severity === CustomerSuccessAlertSeverity.CRITICAL;
}

function isTaskDone(status: string): boolean {
  return status === TaskStatus.DONE;
}

function stakeholderRole(contact: { title: string | null }): string {
  return contact.title?.trim() || "Stakeholder";
}

function stakeholderCoverageStatus(lastTouchAt: Date | null, now: Date): CustomerSuccessStakeholder["coverageStatus"] {
  if (!lastTouchAt) return "missing";
  const age = daysBetween(lastTouchAt, now);
  if (age <= 30) return "covered";
  if (age <= 60) return "stale";
  return "missing";
}

function providerSet(snapshot: CustomerSuccessAccountSnapshot): Set<CustomerExternalProvider> {
  return new Set(snapshot.externalProviders);
}

function getLatestActivity(snapshot: CustomerSuccessAccountSnapshot): Date | null {
  const candidates = [
    snapshot.updatedAt,
    ...snapshot.notes.map((note) => note.createdAt),
    ...snapshot.meetings.map((meeting) => meeting.startAt),
    ...snapshot.outreach.map((message) => message.sentAt ?? message.createdAt),
    ...snapshot.tasks.map((task) => task.completedOn ?? task.updatedAt),
    ...snapshot.alerts.map((alert) => alert.updatedAt),
  ];

  if (candidates.length === 0) return null;

  return candidates.reduce((latest, current) =>
    current.getTime() > latest.getTime() ? current : latest
  );
}

function getCustomerTouchDates(snapshot: CustomerSuccessAccountSnapshot): Date[] {
  return [
    ...snapshot.notes.map((note) => note.createdAt),
    ...snapshot.meetings.map((meeting) => meeting.startAt),
    ...snapshot.outreach.map((message) => message.sentAt ?? message.createdAt),
  ].sort((a, b) => a.getTime() - b.getTime());
}

function getLatestCustomerTouch(snapshot: CustomerSuccessAccountSnapshot): Date | null {
  const touchDates = getCustomerTouchDates(snapshot);
  return touchDates[touchDates.length - 1] ?? null;
}

function buildStakeholders(
  snapshot: CustomerSuccessAccountSnapshot,
  now: Date
): CustomerSuccessStakeholder[] {
  const lastTouchByEmail = new Map<string, Date>();

  snapshot.meetings.forEach((meeting) => {
    meeting.attendees.forEach((attendee) => {
      if (!attendee.email) return;
      const current = lastTouchByEmail.get(attendee.email);
      if (!current || meeting.startAt.getTime() > current.getTime()) {
        lastTouchByEmail.set(attendee.email, meeting.startAt);
      }
    });
  });

  snapshot.outreach.forEach((message) => {
    const touchedAt = message.sentAt ?? message.createdAt;
    const current = lastTouchByEmail.get(message.recipientAddress);
    if (!current || touchedAt.getTime() > current.getTime()) {
      lastTouchByEmail.set(message.recipientAddress, touchedAt);
    }
  });

  const seen = new Set<string>();
  const stakeholders: CustomerSuccessStakeholder[] = [];

  snapshot.contacts.forEach((contact) => {
    const dedupeKey = contact.email || contact.id;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    const fullName = `${contact.firstName} ${contact.lastName}`.trim() || contact.email || "Unknown contact";
    const lastTouchAt = contact.email ? lastTouchByEmail.get(contact.email) ?? null : null;

    stakeholders.push({
      id: contact.id,
      name: fullName,
      email: contact.email ?? undefined,
      role: stakeholderRole(contact),
      coverageStatus: stakeholderCoverageStatus(lastTouchAt, now),
      lastTouchAt: lastTouchAt?.toISOString(),
    });
  });

  return stakeholders;
}

function buildComponent(input: {
  score: number;
  weight: number;
  trend: CustomerSuccessHealth["trend"];
  evidence: string[];
  updatedAt: Date;
}): CustomerSuccessHealthComponent {
  const score = clamp(round(input.score));
  return {
    score,
    weight: input.weight,
    weightedScore: round(score * input.weight),
    trend: input.trend,
    status: mapScoreToStatus(score),
    evidence: input.evidence,
    lastUpdatedAt: input.updatedAt.toISOString(),
  };
}

function buildLeadingIndicator(input: {
  label: string;
  score: number;
  value: string;
  evidence: string[];
}): CustomerSuccessLeadingIndicator {
  const score = clamp(round(input.score));
  return {
    label: input.label,
    score,
    status: mapScoreToStatus(score),
    value: input.value,
    evidence: input.evidence,
  };
}

function maxGapInDays(dates: Date[], now: Date): number {
  if (dates.length === 0) return 90;

  let maxGap = daysBetween(dates[dates.length - 1], now);
  for (let index = 1; index < dates.length; index += 1) {
    maxGap = Math.max(maxGap, daysBetween(dates[index - 1], dates[index]));
  }
  return maxGap;
}

export function buildCustomerSuccessHealth(
  snapshot: CustomerSuccessAccountSnapshot,
  now: Date = new Date()
): CustomerSuccessHealth {
  const providers = providerSet(snapshot);
  const latestActivity = getLatestActivity(snapshot);
  const touchDates = getCustomerTouchDates(snapshot);
  const latestCustomerTouch = getLatestCustomerTouch(snapshot);
  const daysSinceTouch = latestCustomerTouch ? daysBetween(latestCustomerTouch, now) : 90;
  const activePlan =
    snapshot.plans.find((plan) => plan.status === CustomerSuccessPlanStatus.ACTIVE) ??
    snapshot.plans[0] ??
    null;
  const totalMilestones = activePlan?.milestones.length ?? 0;
  const completedMilestones =
    activePlan?.milestones.filter((milestone) => milestone.status === "COMPLETED").length ?? 0;
  const blockedMilestones =
    activePlan?.milestones.filter((milestone) => milestone.status === "BLOCKED").length ?? 0;
  const milestoneRatio = totalMilestones > 0 ? completedMilestones / totalMilestones : 0;
  const completedTasks30d = snapshot.tasks.filter(
    (task) => task.completedOn && daysBetween(task.completedOn, now) <= 30
  ).length;
  const openTasks = snapshot.tasks.filter((task) => !isTaskDone(task.status)).length;
  const recentMeetings = snapshot.meetings.filter((meeting) => daysBetween(meeting.startAt, now) <= 30).length;
  const recentNotes = snapshot.notes.filter((note) => daysBetween(note.createdAt, now) <= 30).length;
  const recentOutreach = snapshot.outreach.filter((message) => {
    const touchedAt = message.sentAt ?? message.createdAt;
    return daysBetween(touchedAt, now) <= 30;
  }).length;
  const recentTouches30d = touchDates.filter((date) => daysBetween(date, now) <= 30);
  const recentTouches90d = touchDates.filter((date) => daysBetween(date, now) <= 90);
  const coveredTouchWindows90d = new Set(
    recentTouches90d.map((date) => Math.min(2, Math.floor(daysBetween(date, now) / 30)))
  ).size;
  const maxTouchGapDays = maxGapInDays(recentTouches90d, now);
  const stakeholders = buildStakeholders(snapshot, now);
  const coveredStakeholders = stakeholders.filter((stakeholder) => stakeholder.coverageStatus === "covered").length;
  const hasChampion = stakeholders.some((stakeholder) =>
    /champion|manager|director|head|vp|chief|lead/i.test(stakeholder.role)
  );
  const openAlerts = snapshot.alerts.filter((alert) => isAlertOpen(alert.status));
  const criticalAlerts = openAlerts.filter((alert) => alert.severity === CustomerSuccessAlertSeverity.CRITICAL).length;
  const highAlerts = openAlerts.filter((alert) => alert.severity === CustomerSuccessAlertSeverity.HIGH).length;
  const supportAlerts = openAlerts.filter((alert) =>
    alert.source === CustomerSuccessAlertSource.SUPPORT || alert.source === CustomerSuccessAlertSource.HEALTH
  ).length;
  const commercialAlerts = openAlerts.filter((alert) => alert.source === CustomerSuccessAlertSource.COMMERCIAL).length;
  const renewalDays = snapshot.renewalDate ? daysUntil(now, snapshot.renewalDate) : null;

  const adoption = buildComponent({
    score:
      36 +
      Math.min((recentMeetings + recentNotes + recentOutreach) * 5, 24) +
      milestoneRatio * 26 +
      (providers.has(CustomerExternalProvider.CODA) ? 10 : 0) -
      Math.min(blockedMilestones * 12, 24),
    weight: HEALTH_WEIGHTS.adoption,
    trend:
      blockedMilestones > 0
        ? "declining"
        : recentMeetings + recentNotes + recentOutreach >= 3
          ? "improving"
          : "stable",
    evidence: [
      `${recentMeetings + recentNotes + recentOutreach} customer-success touches in the last 30 days`,
      totalMilestones > 0
        ? `${completedMilestones}/${totalMilestones} plan milestones completed`
        : "No success-plan milestones linked yet",
      blockedMilestones > 0 ? `${blockedMilestones} plan milestones are blocked` : "No blocked success-plan milestones",
      providers.has(CustomerExternalProvider.CODA) ? "Coda signal available" : "No Coda reference connected",
    ],
    updatedAt: latestActivity ?? snapshot.updatedAt,
  });

  const engagement = buildComponent({
    score:
      98 -
      Math.min(daysSinceTouch * 2.8, 60) +
      Math.min((recentMeetings + recentNotes + recentOutreach) * 4, 18) +
      (providers.has(CustomerExternalProvider.SLACK) ? 7 : 0) +
      (providers.has(CustomerExternalProvider.GOOGLE_WORKSPACE) ? 7 : 0),
    weight: HEALTH_WEIGHTS.engagement,
    trend:
      recentMeetings + recentNotes + recentOutreach >= 4
        ? "improving"
        : daysSinceTouch > 30
          ? "declining"
          : "stable",
    evidence: [
      latestCustomerTouch ? `Last customer touch ${daysSinceTouch} days ago` : "No recent customer touch found",
      `${recentMeetings} meetings, ${recentNotes} notes, ${recentOutreach} outreach messages in the last 30 days`,
      providers.has(CustomerExternalProvider.SLACK) || providers.has(CustomerExternalProvider.GOOGLE_WORKSPACE)
        ? "Workspace collaboration signals available"
        : "Workspace collaboration signals missing",
    ],
    updatedAt: latestCustomerTouch ?? latestActivity ?? snapshot.updatedAt,
  });

  const relationship = buildComponent({
    score:
      30 +
      Math.min(stakeholders.length * 10, 30) +
      Math.min(coveredStakeholders * 8, 18) +
      (hasChampion ? 12 : 0) +
      (snapshot.ownerName ? 14 : 0) +
      (recentNotes + recentOutreach > 0 ? 10 : -8),
    weight: HEALTH_WEIGHTS.relationship,
    trend:
      coveredStakeholders >= 2 && recentNotes + recentOutreach >= 2
        ? "improving"
        : stakeholders.length === 0
          ? "declining"
          : "stable",
    evidence: [
      `${stakeholders.length} mapped stakeholders`,
      snapshot.ownerName ? `Customer owner: ${snapshot.ownerName}` : "No owner assigned",
      hasChampion ? "Champion-level stakeholder present" : "Champion coverage missing",
    ],
    updatedAt: latestCustomerTouch ?? latestActivity ?? snapshot.updatedAt,
  });

  const support = buildComponent({
    score:
      95 -
      criticalAlerts * 24 -
      highAlerts * 12 -
      supportAlerts * 5,
    weight: HEALTH_WEIGHTS.support,
    trend:
      criticalAlerts > 0
        ? "declining"
        : supportAlerts === 0
          ? "improving"
          : "stable",
    evidence: [
      `${openAlerts.length} open alerts, ${criticalAlerts} critical`,
      `${supportAlerts} support or health alerts in queue`,
      supportAlerts > 0 ? "Support or health alerts need attention" : "Support load is within threshold",
    ],
    updatedAt: latestActivity ?? snapshot.updatedAt,
  });

  const commercial = buildComponent({
    score:
      50 +
      (providers.has(CustomerExternalProvider.STRIPE) ? 10 : 0) +
      (providers.has(CustomerExternalProvider.HUBSPOT) ? 10 : 0) +
      (snapshot.primaryDealAmount ? 10 : 0) +
      (snapshot.expansionPotential === "high" || snapshot.lifecycleStage === "EXPANSION" ? 12 : 0) -
      (commercialAlerts > 0 ? 18 : 0) +
      (renewalDays === null ? 0 : renewalDays >= 30 ? 10 : renewalDays >= 0 ? 4 : -14),
    weight: HEALTH_WEIGHTS.commercial,
    trend:
      snapshot.lifecycleStage === "EXPANSION"
        ? "improving"
        : commercialAlerts > 0 || (renewalDays !== null && renewalDays < 0)
          ? "declining"
          : "stable",
    evidence: [
      snapshot.primaryDealAmount ? `Primary deal value ${snapshot.primaryDealAmount.toLocaleString()}` : "No commercial amount linked yet",
      renewalDays === null ? "Renewal date unavailable" : `Renewal in ${renewalDays} days`,
      snapshot.expansionPotential ? `Expansion potential ${snapshot.expansionPotential}` : "Expansion potential not scored",
    ],
    updatedAt: latestActivity ?? snapshot.updatedAt,
  });

  const leadingIndicators = {
    recency: buildLeadingIndicator({
      label: "Activity recency",
      score: 100 - Math.min(daysSinceTouch * 3.5, 88),
      value: latestCustomerTouch ? `${daysSinceTouch}d since touch` : "No recent touch",
      evidence: [
        latestCustomerTouch ? `Most recent meeting, note, or outreach was ${daysSinceTouch} days ago` : "No meeting, note, or outreach found",
        latestActivity && !latestCustomerTouch ? "Recent internal work exists, but no customer-facing touch was detected" : "Customer-facing touch signals are available",
      ],
    }),
    cadence: buildLeadingIndicator({
      label: "Touch cadence",
      score:
        22 +
        Math.min(recentTouches30d.length * 16, 48) +
        Math.min(recentMeetings * 8, 16) +
        Math.min(recentOutreach * 6, 12),
      value: `${recentTouches30d.length} touches / 30d`,
      evidence: [
        `${recentMeetings} meetings, ${recentNotes} notes, ${recentOutreach} outreach messages in the last 30 days`,
        recentTouches30d.length >= 4 ? "Healthy follow-up rhythm this month" : "Follow-up rhythm is still light this month",
      ],
    }),
    consistency: buildLeadingIndicator({
      label: "Touch consistency",
      score:
        18 +
        coveredTouchWindows90d * 20 +
        Math.min(recentTouches90d.length * 5, 20) -
        Math.min(Math.max(maxTouchGapDays - 14, 0) * 1.5, 26),
      value: `${coveredTouchWindows90d}/3 months active`,
      evidence: [
        `${recentTouches90d.length} customer touches recorded in the last 90 days`,
        maxTouchGapDays > 21 ? `Largest gap between touches is ${maxTouchGapDays} days` : "Touch gaps stayed within a 3-week window",
      ],
    }),
    depth: buildLeadingIndicator({
      label: "Execution depth",
      score:
        26 +
        milestoneRatio * 36 +
        Math.min(completedTasks30d * 10, 24) +
        (activePlan ? 8 : 0) +
        (providers.has(CustomerExternalProvider.CODA) ? 6 : 0) -
        Math.min(openTasks * 4, 20),
      value:
        totalMilestones > 0
          ? `${completedMilestones}/${totalMilestones} milestones done`
          : `${completedTasks30d} tasks done / 30d`,
      evidence: [
        activePlan ? `Active success plan: ${activePlan.name}` : "No active success plan linked",
        `${completedTasks30d} tasks completed and ${openTasks} open tasks in the last/current 30-day window`,
      ],
    }),
    breadth: buildLeadingIndicator({
      label: "Relationship breadth",
      score:
        24 +
        Math.min(stakeholders.length * 8, 24) +
        Math.min(coveredStakeholders * 10, 30) +
        (hasChampion ? 10 : 0) +
        (coveredStakeholders >= 2 ? 8 : 0),
      value: `${coveredStakeholders}/${stakeholders.length || 0} stakeholders covered`,
      evidence: [
        `${stakeholders.length} stakeholders mapped, ${coveredStakeholders} touched in the last 30 days`,
        hasChampion ? "Champion-level contact is present" : "Champion-level contact is missing",
      ],
    }),
  } satisfies CustomerSuccessHealth["leadingIndicators"];

  const score =
    adoption.weightedScore +
    engagement.weightedScore +
    relationship.weightedScore +
    support.weightedScore +
    commercial.weightedScore;

  const confidenceSignals = [
    snapshot.externalProviders.length > 0,
    snapshot.contacts.length > 0,
    snapshot.plans.length > 0,
    snapshot.outreach.length > 0 || snapshot.notes.length > 0,
    snapshot.alerts.length > 0 || snapshot.primaryDealAmount !== null,
  ];

  const confidence = round((confidenceSignals.filter(Boolean).length / confidenceSignals.length) * 100);
  const trendValue =
    trendWeight(adoption.trend) * HEALTH_WEIGHTS.adoption +
    trendWeight(engagement.trend) * HEALTH_WEIGHTS.engagement +
    trendWeight(relationship.trend) * HEALTH_WEIGHTS.relationship +
    trendWeight(support.trend) * HEALTH_WEIGHTS.support +
    trendWeight(commercial.trend) * HEALTH_WEIGHTS.commercial;

  const roundedScore = round(score);

  return {
    score: roundedScore,
    grade: mapScoreToGrade(roundedScore),
    trend: mapTrendScore(trendValue),
    confidence,
    updatedAt: (latestActivity ?? snapshot.updatedAt).toISOString(),
    components: {
      adoption,
      engagement,
      relationship,
      support,
      commercial,
    },
    leadingIndicators,
  };
}

function alertPriority(alert: CustomerSuccessAlert): number {
  const severityRank = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  }[alert.severity];
  const slaRank = {
    breached: 3,
    at_risk: 2,
    on_track: 1,
    none: 0,
  }[alert.slaStatus];

  return severityRank * 10 + slaRank;
}

function pickLeadingIndicatorAction(health: CustomerSuccessHealth): string {
  const weakestIndicator = Object.entries(health.leadingIndicators).sort(([, left], [, right]) => left.score - right.score)[0]?.[0];

  switch (weakestIndicator) {
    case "recency":
      return "Re-establish direct customer contact this week.";
    case "cadence":
      return "Increase touch cadence over the next 30 days.";
    case "consistency":
      return "Set a steadier 30/60/90-day follow-up rhythm.";
    case "depth":
      return "Advance the success plan and close open execution items.";
    case "breadth":
      return "Expand coverage beyond the current champion.";
    default:
      return "Review account workspace";
  }
}

function buildAlert(snapshot: CustomerSuccessAccountSnapshot, alert: CustomerSuccessAccountSnapshot["alerts"][number]): CustomerSuccessAlert {
  return {
    id: alert.id,
    accountId: snapshot.id,
    title: alert.title,
    category: alert.category.toLowerCase() as CustomerSuccessAlert["category"],
    severity: alert.severity.toLowerCase() as CustomerSuccessAlert["severity"],
    status: alert.status.toLowerCase() as CustomerSuccessAlert["status"],
    slaStatus: alert.slaStatus.toLowerCase() as CustomerSuccessAlert["slaStatus"],
    source: alert.source.toLowerCase() as CustomerSuccessAlert["source"],
    evidence: alert.evidence,
    suggestedAction: alert.suggestedAction ?? undefined,
    createdAt: alert.openedAt.toISOString(),
    updatedAt: alert.updatedAt.toISOString(),
  };
}

function pushEvent(target: CustomerSuccessEvent[], event: CustomerSuccessEvent) {
  target.push(event);
}

function buildEvents(snapshot: CustomerSuccessAccountSnapshot): CustomerSuccessEvent[] {
  const events: CustomerSuccessEvent[] = [];

  snapshot.alerts.forEach((alert) => {
    pushEvent(events, {
      id: `alert:${alert.id}`,
      accountId: snapshot.id,
      type:
        alert.source === CustomerSuccessAlertSource.COMMERCIAL
          ? "commercial"
          : alert.source === CustomerSuccessAlertSource.RELATIONSHIP
            ? "relationship"
            : alert.source === CustomerSuccessAlertSource.WORKFLOW
              ? "workflow"
              : "support",
      title: alert.title,
      description: alert.suggestedAction ?? alert.evidence[0],
      occurredAt: alert.updatedAt.toISOString(),
      metadata: {
        severity: alert.severity,
        status: alert.status,
      },
    });
  });

  snapshot.notes.forEach((note) => {
    pushEvent(events, {
      id: `note:${note.id}`,
      accountId: snapshot.id,
      type: "relationship",
      title: note.title || "Customer success note",
      description: note.body.slice(0, 180),
      actorName: note.authorName ?? undefined,
      occurredAt: note.createdAt.toISOString(),
      metadata: {
        source: note.source,
      },
    });
  });

  snapshot.meetings.forEach((meeting) => {
    pushEvent(events, {
      id: `meeting:${meeting.id}`,
      accountId: snapshot.id,
      type: "relationship",
      title:
        meeting.status === MeetingStatus.COMPLETED ? `Meeting completed: ${meeting.title}` : `Meeting scheduled: ${meeting.title}`,
      description:
        meeting.attendees.length > 0
          ? `${meeting.attendees.length} attendee${meeting.attendees.length === 1 ? "" : "s"} linked`
          : undefined,
      occurredAt: meeting.startAt.toISOString(),
      metadata: {
        status: meeting.status,
      },
    });
  });

  snapshot.outreach.forEach((message) => {
    pushEvent(events, {
      id: `outreach:${message.id}`,
      accountId: snapshot.id,
      type: "relationship",
      title:
        message.status === CustomerSuccessOutreachStatus.SENT
          ? `${message.channel} sent to ${message.recipientName || message.recipientAddress}`
          : `${message.channel} ${message.status.toLowerCase()} for ${message.recipientName || message.recipientAddress}`,
      description: message.subject ?? undefined,
      occurredAt: (message.sentAt ?? message.createdAt).toISOString(),
      metadata: {
        status: message.status,
        channel: message.channel,
      },
    });
  });

  snapshot.tasks.forEach((task) => {
    const occurredAt = task.completedOn ?? task.updatedAt;
    pushEvent(events, {
      id: `task:${task.id}`,
      accountId: snapshot.id,
      type: "workflow",
      title: isTaskDone(task.status) ? `Task completed: ${task.title}` : `Task updated: ${task.title}`,
      description:
        task.dueDate && !isTaskDone(task.status)
          ? `Due ${task.dueDate.toISOString().slice(0, 10)}`
          : undefined,
      occurredAt: occurredAt.toISOString(),
      metadata: {
        status: task.status,
        priority: task.priority,
      },
    });
  });

  return events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

function pickRecommendedTemplates(snapshot: CustomerSuccessAccountSnapshot): string[] {
  const templates = new Set<string>();

  if (snapshot.lifecycleStage === "ONBOARDING") templates.add("onboarding");
  if (snapshot.lifecycleStage === "ADOPTION") templates.add("adoption-check-in");
  if (snapshot.lifecycleStage === "EXPANSION") templates.add("expansion");
  if (snapshot.lifecycleStage === "RENEWAL") templates.add("renewal");
  if (snapshot.lifecycleStage === "AT_RISK") templates.add("at-risk-recovery");
  if (snapshot.lifecycleStage === "CHURNED") templates.add("reactivation");
  if (snapshot.alerts.some((alert) => isHighSeverity(alert.severity) && isAlertOpen(alert.status))) {
    templates.add("risk-escalation");
  }

  if (templates.size === 0) {
    templates.add("check-in");
  }

  return Array.from(templates);
}

function buildTaskSummaries(snapshot: CustomerSuccessAccountSnapshot): CustomerSuccessTaskSummary[] {
  return snapshot.tasks.slice(0, 8).map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    dueDate: task.dueDate?.toISOString(),
    priority: task.priority,
  }));
}

function providerDocUrl(provider: CustomerExternalProvider, externalId: string, metadata: Record<string, unknown> | null): string | undefined {
  const browserLink =
    asString(metadata?.browserLink) ??
    asString(metadata?.url) ??
    asString(metadata?.docUrl) ??
    asString(metadata?.sourceUrl);
  if (browserLink) return browserLink;

  if (provider === CustomerExternalProvider.CODA) {
    return `https://coda.io/d/_d${encodeURIComponent(externalId)}`;
  }

  return undefined;
}

function buildProviderLinks(snapshot: CustomerSuccessAccountSnapshot): CustomerSuccessProviderLink[] {
  return snapshot.externalRefs
    .slice()
    .sort((left, right) => {
      if (left.provider !== right.provider) return left.provider.localeCompare(right.provider);
      if (left.externalObjectType !== right.externalObjectType) {
        return left.externalObjectType.localeCompare(right.externalObjectType);
      }
      return right.updatedAt.getTime() - left.updatedAt.getTime();
    })
    .map((ref) => ({
      provider: ref.provider,
      externalObjectType: ref.externalObjectType,
      externalId: ref.externalId,
      label: ref.label ?? undefined,
      isPrimary: ref.isPrimary,
      url: providerDocUrl(ref.provider, ref.externalId, ref.metadata),
    }));
}

function mergeProviderLinks(
  baseLinks: CustomerSuccessProviderLink[],
  derivedLinks: CustomerSuccessProviderLink[]
): CustomerSuccessProviderLink[] {
  const merged = new Map<string, CustomerSuccessProviderLink>();

  for (const link of [...baseLinks, ...derivedLinks]) {
    merged.set(
      `${link.provider}:${link.externalObjectType}:${link.externalId}`,
      link
    );
  }

  return [...merged.values()].sort((left, right) => {
    if (left.provider !== right.provider) return left.provider.localeCompare(right.provider);
    if (left.externalObjectType !== right.externalObjectType) {
      return left.externalObjectType.localeCompare(right.externalObjectType);
    }
    return left.externalId.localeCompare(right.externalId);
  });
}

function buildDerivedCodaProviderLinks(latestArdaPayload: Record<string, unknown>): CustomerSuccessProviderLink[] {
  const links: CustomerSuccessProviderLink[] = [];

  const mainDocId = asString(latestArdaPayload.mainCodaDocId);
  if (mainDocId) {
    links.push({
      provider: CustomerExternalProvider.CODA,
      externalObjectType: "doc",
      externalId: mainDocId,
      label: "Customer Success and Implementation",
      isPrimary: true,
      url: `https://coda.io/d/_d${encodeURIComponent(mainDocId)}`,
    });
  }

  const orderArchiveDocumentId = asString(latestArdaPayload.orderArchiveDocumentId);
  if (orderArchiveDocumentId) {
    links.push({
      provider: CustomerExternalProvider.CODA,
      externalObjectType: "order_archive_doc",
      externalId: orderArchiveDocumentId,
      label: "Master Order Archive",
      isPrimary: !mainDocId,
      url: `https://coda.io/d/_d${encodeURIComponent(orderArchiveDocumentId)}`,
    });
  }

  return links;
}

function countConnectedSystems(input: {
  providers: Iterable<CustomerExternalProvider>;
  coverage?: {
    arda?: boolean;
    coda?: boolean;
    stripe?: boolean;
    hubspot?: boolean;
    pylon?: boolean;
  } | null;
}): number {
  const systems = new Set<string>();

  for (const provider of input.providers) {
    systems.add(provider.toLowerCase());
  }

  if (input.coverage?.arda) systems.add("arda");
  if (input.coverage?.coda) systems.add("coda");
  if (input.coverage?.stripe) systems.add("stripe");
  if (input.coverage?.hubspot) systems.add("hubspot");
  if (input.coverage?.pylon) systems.add("pylon");

  return systems.size;
}

export function buildCustomerSuccessAccountDetailFromSnapshot(
  snapshot: CustomerSuccessAccountSnapshot,
  now: Date = new Date()
): CustomerSuccessAccountDetail {
  const providerLinks = buildProviderLinks(snapshot);
  const health = buildCustomerSuccessHealth(snapshot, now);
  const timeline = buildEvents(snapshot);
  const stakeholders = buildStakeholders(snapshot, now);
  const currentPlan =
    snapshot.plans.find((plan) => plan.status === CustomerSuccessPlanStatus.ACTIVE) ??
    snapshot.plans[0] ??
    null;

  return {
    accountId: snapshot.id,
    name: snapshot.name,
    segment: snapshot.segment ?? undefined,
    tier: snapshot.tier ?? undefined,
    lifecycleStage: snapshot.lifecycleStage,
    ownerName: snapshot.ownerName ?? undefined,
    health,
    alerts: snapshot.alerts.map((alert) => buildAlert(snapshot, alert)),
    timeline,
    stakeholders,
    tasks: buildTaskSummaries(snapshot),
    successPlan: {
      templateKey: currentPlan?.templateKey ?? undefined,
      milestones:
        currentPlan?.milestones.map((milestone) => ({
          id: milestone.id,
          title: milestone.title,
          status: milestone.status,
          dueDate: milestone.dueDate?.toISOString(),
        })) ?? [],
    },
    outreach: {
      recommendedTemplates: pickRecommendedTemplates(snapshot),
      recentMessages: snapshot.outreach.slice(0, 8).map((message) => ({
        id: message.id,
        subject: message.subject || `${message.channel} outreach`,
        sentAt: message.sentAt?.toISOString(),
        status: message.status,
      })),
    },
    commercial: {
      arr: snapshot.primaryDealAmount ?? undefined,
      renewalDate: snapshot.renewalDate?.toISOString(),
      paymentStatus: snapshot.paymentStatus ?? undefined,
      expansionPotential: snapshot.expansionPotential ?? undefined,
    },
    relationshipIntelligence: {
      connectedSystems: countConnectedSystems({ providers: providerLinks.map((provider) => provider.provider) }),
      providers: providerLinks,
    },
  };
}

export function buildCustomerSuccessPortfolioFromSnapshots(
  snapshots: CustomerSuccessAccountSnapshot[],
  now: Date = new Date(),
  relationshipMap: Map<string, CustomerSuccessPortfolioRelationshipSummary> = new Map()
): CustomerSuccessPortfolio {
  const generatedAt = now.toISOString();
  const accounts = snapshots.map((snapshot) => {
    const health = buildCustomerSuccessHealth(snapshot, now);
    const lastActivityAt = getLatestActivity(snapshot)?.toISOString();
    const openAlertCount = snapshot.alerts.filter((alert) => isAlertOpen(alert.status)).length;
    const activeUsers30d = buildStakeholders(snapshot, now).filter(
      (stakeholder) => stakeholder.coverageStatus === "covered"
    ).length;
    const relationship = relationshipMap.get(snapshot.id);

    return {
      accountId: snapshot.id,
      name: snapshot.name,
      segment: snapshot.segment ?? undefined,
      tier: snapshot.tier ?? undefined,
      ownerName: snapshot.ownerName ?? undefined,
      health,
      lastActivityAt,
      activeUsers30d,
      renewalDate: snapshot.renewalDate?.toISOString(),
      openAlertCount,
      relationship: {
        connectedSystems:
          relationship?.connectedSystems ??
          countConnectedSystems({ providers: snapshot.externalProviders }),
        retentionStatus: relationship?.retentionStatus,
        primaryLirPassed: relationship?.primaryLirPassed,
        implementationStage: relationship?.implementationStage,
        missingSources: relationship?.missingSources ?? [],
      },
    };
  });

  const alerts = snapshots
    .flatMap((snapshot) => snapshot.alerts.map((alert) => buildAlert(snapshot, alert)))
    .sort((a, b) => {
      const priorityDiff = alertPriority(b) - alertPriority(a);
      if (priorityDiff !== 0) return priorityDiff;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  const recentActivity = snapshots
    .flatMap((snapshot) => buildEvents(snapshot))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 20);

  const healthDistribution = ["A", "B", "C", "D", "F"].map((grade) => ({
    label: grade as CustomerSuccessHealth["grade"],
    count: accounts.filter((account) => account.health.grade === grade).length,
  }));

  const attentionAccounts = accounts
    .slice()
    .sort((a, b) => {
      if (a.health.score !== b.health.score) return a.health.score - b.health.score;
      return b.openAlertCount - a.openAlertCount;
    })
    .slice(0, 8)
    .map((account) => ({
      accountId: account.accountId,
      name: account.name,
      ownerName: account.ownerName,
      health: account.health,
      openAlertCount: account.openAlertCount,
      lifecycleStage: snapshots.find((snapshot) => snapshot.id === account.accountId)?.lifecycleStage ?? "ACTIVE",
      relationship: account.relationship,
      nextAction:
        alerts.find((alert) => alert.accountId === account.accountId && alert.status !== "resolved")?.suggestedAction ??
        pickLeadingIndicatorAction(account.health) ??
        pickRecommendedTemplates(snapshots.find((snapshot) => snapshot.id === account.accountId) ?? snapshots[0])[0],
    }));

  const avgHealthScore =
    accounts.length > 0 ? round(accounts.reduce((sum, account) => sum + account.health.score, 0) / accounts.length) : 0;
  const atRiskAccounts = accounts.filter((account) => account.health.score < 80).length;
  const openAlerts = alerts.filter((alert) => alert.status === "open" || alert.status === "in_progress").length;

  return {
    generatedAt,
    summary: {
      totalAccounts: accounts.length,
      avgHealthScore,
      atRiskAccounts,
      openAlerts,
    },
    healthDistribution,
    attentionAccounts,
    alerts: alerts.slice(0, 16),
    recentActivity,
    accounts,
  };
}

function mapCustomerRecordToSnapshot(record: CustomerRecordWithRelations): CustomerSuccessAccountSnapshot {
  const contactsById = new Map<string, CustomerSuccessAccountSnapshot["contacts"][number]>();
  const pushContact = (contact: ContactSummary) => {
    contactsById.set(contact.id, {
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      title: contact.title,
      updatedAt: contact.updatedAt,
      createdAt: contact.createdAt,
    });
  };

  record.dealCompany?.contacts.forEach(pushContact);
  record.primaryDeal?.contacts.forEach(pushContact);

  const metadata = record.metadata && typeof record.metadata === "object" ? (record.metadata as Record<string, unknown>) : null;

  return {
    id: record.id,
    name: record.name,
    segment: record.segment,
    tier: record.tier,
    lifecycleStage: record.lifecycleStage,
    ownerName: record.owner?.name ?? null,
    ownerEmail: record.owner?.email ?? null,
    status: record.status,
    primaryDealAmount: record.primaryDeal?.amount ?? null,
    renewalDate: record.primaryDeal?.expectedCloseDate ?? null,
    paymentStatus:
      typeof metadata?.paymentStatus === "string"
        ? metadata.paymentStatus
        : record.primaryDeal?.stage === "CLOSED_WON"
          ? "current"
          : null,
    expansionPotential:
      typeof metadata?.expansionPotential === "string"
        ? metadata.expansionPotential
        : record.lifecycleStage === "EXPANSION"
          ? "high"
          : null,
    externalProviders: record.externalRefs.map((ref) => ref.provider),
    externalRefs: record.externalRefs.map((ref) => ({
      provider: ref.provider,
      externalObjectType: ref.externalObjectType,
      externalId: ref.externalId,
      label: ref.label,
      isPrimary: ref.isPrimary,
      metadata: ref.metadata && typeof ref.metadata === "object" ? (ref.metadata as Record<string, unknown>) : null,
      updatedAt: ref.updatedAt,
    })),
    contacts: Array.from(contactsById.values()),
    notes: record.notes.map((note) => ({
      id: note.id,
      title: note.title,
      body: note.body,
      createdAt: note.createdAt,
      source: note.source,
      authorName: note.authorUser?.name ?? null,
    })),
    alerts: record.alerts.map((alert) => ({
      id: alert.id,
      title: alert.title,
      category: alert.category,
      severity: alert.severity,
      status: alert.status,
      slaStatus: alert.slaStatus,
      source: alert.source,
      openedAt: alert.openedAt,
      updatedAt: alert.updatedAt,
      resolvedAt: alert.resolvedAt,
      suggestedAction: alert.suggestedAction,
      evidence: toEvidenceList(alert.evidence),
    })),
    plans: record.plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      templateKey: plan.templateKey,
      status: plan.status,
      startedAt: plan.startedAt,
      targetDate: plan.targetDate,
      completedAt: plan.completedAt,
      milestones: plan.milestones.map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        status: milestone.status,
        dueDate: milestone.dueDate,
      })),
    })),
    outreach: record.outreachMessages.map((message) => ({
      id: message.id,
      templateKey: message.templateKey,
      status: message.status,
      subject: message.subject,
      recipientName: message.recipientName,
      recipientAddress: message.recipientAddress,
      sentAt: message.sentAt,
      createdAt: message.createdAt,
      channel: message.channel,
    })),
    tasks: record.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedOn: task.completedOn,
    })),
    meetings: record.meetings.map((meeting) => ({
      id: meeting.id,
      title: meeting.title,
      status: meeting.status,
      startAt: meeting.startAt,
      attendees: meeting.attendees.map((attendee) => ({
        id: attendee.id,
        firstName: attendee.firstName,
        lastName: attendee.lastName,
        email: attendee.email,
        title: attendee.title,
      })),
    })),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function requireCustomerSuccessRecord(
  actor: CustomerSuccessActor,
  accountId: string
): Promise<{ id: string; name: string }> {
  return withCustomerSuccessContext(actor, async () => {
    const record = await prisma.customerRecord.findFirst({
      where: {
        id: accountId,
        status: { not: CustomerRecordStatus.MERGED },
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!record) {
      throw new CustomerSuccessServiceError("Customer success account not found", 404);
    }

    return record;
  });
}

async function listCustomerSuccessSnapshots(actor: CustomerSuccessActor): Promise<CustomerSuccessAccountSnapshot[]> {
  return withCustomerSuccessContext(actor, async () => {
    const records = await prisma.customerRecord.findMany({
      where: {
        organizationId: actor.organizationId,
        status: { not: CustomerRecordStatus.MERGED },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: CUSTOMER_RECORD_INCLUDE,
    });

    return records.map(mapCustomerRecordToSnapshot);
  });
}

async function getCustomerSuccessSnapshotById(
  actor: CustomerSuccessActor,
  accountId: string
): Promise<CustomerSuccessAccountSnapshot | null> {
  return withCustomerSuccessContext(actor, async () => {
    const record = await prisma.customerRecord.findFirst({
      where: {
        organizationId: actor.organizationId,
        id: accountId,
        status: { not: CustomerRecordStatus.MERGED },
      },
      include: CUSTOMER_RECORD_INCLUDE,
    });

    return record ? mapCustomerRecordToSnapshot(record) : null;
  });
}

function humanizeRetentionStatus(value: string | null | undefined): string {
  const normalized = (value ?? "WATCH").replace(/_/g, " ").toLowerCase();
  return normalized
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseRelationshipReasons(value: unknown): CustomerSuccessRelationshipReason[] {
  return asArray<Record<string, unknown>>(value)
    .map((entry) => {
      const code = asString(entry.code);
      const label = asString(entry.label);
      const detail = asString(entry.detail);
      const severity = asString(entry.severity);
      const dimension = asString(entry.dimension);
      if (!code || !label || !detail || !severity || !dimension) return null;
      return {
        code,
        label,
        detail,
        severity: severity as CustomerSuccessRelationshipReason["severity"],
        dimension: dimension as CustomerSuccessRelationshipReason["dimension"],
      };
    })
    .filter((entry): entry is CustomerSuccessRelationshipReason => entry !== null);
}

function buildDerivedCoverage(
  sourceRows: Array<{ source: string }>
): CustomerSuccessRetentionSummary["coverage"] {
  const seen = new Set(sourceRows.map((row) => row.source.toLowerCase()));
  const missingSources = ["arda", "coda", "stripe", "hubspot", "pylon"].filter((source) => !seen.has(source));
  return {
    arda: seen.has("arda"),
    coda: seen.has("coda"),
    stripe: seen.has("stripe"),
    hubspot: seen.has("hubspot"),
    pylon: seen.has("pylon"),
    ardaActivityCollectionAvailable: undefined,
    ardaUserDetailsFallback: undefined,
    missingSources,
  };
}

function buildPortfolioRelationshipSummary(input: {
  providers?: Iterable<CustomerExternalProvider>;
  retentionCurrent?: {
    status: string;
    primaryLirPassed: boolean;
    detailData: unknown;
    monthFact?: { coverageData: unknown } | null;
  } | null;
}): CustomerSuccessPortfolioRelationshipSummary {
  const detailData = input.retentionCurrent ? asRecord(input.retentionCurrent.detailData) : {};
  const adoptionData = asRecord(detailData.adoptionSummary);
  const coverageData =
    input.retentionCurrent?.monthFact ? asRecord(input.retentionCurrent.monthFact.coverageData) : {};
  const coverage = {
    arda: asBoolean(coverageData.arda) ?? false,
    coda: asBoolean(coverageData.coda) ?? false,
    stripe: asBoolean(coverageData.stripe) ?? false,
    hubspot: asBoolean(coverageData.hubspot) ?? false,
    pylon: asBoolean(coverageData.pylon) ?? false,
  };

  return {
    connectedSystems: countConnectedSystems({
      providers: input.providers ?? [],
      coverage,
    }),
    retentionStatus: input.retentionCurrent ? humanizeRetentionStatus(input.retentionCurrent.status) : undefined,
    primaryLirPassed: input.retentionCurrent?.primaryLirPassed ?? undefined,
    implementationStage: asString(detailData.implementationStage) ?? undefined,
    ardaAdoptionCountsSource:
      (asString(adoptionData.ardaAdoptionCountsSource) as
        | "ARDA_ACTIVITY"
        | "ARDA_USER_DETAILS"
        | "NONE"
        | undefined) ?? undefined,
    missingSources: asArray<string>(coverageData.missingSources),
  };
}

async function buildRelationshipIntelligence(
  actor: CustomerSuccessActor,
  snapshot: CustomerSuccessAccountSnapshot
): Promise<CustomerSuccessRelationshipIntelligence> {
  const [retentionCurrent, sourceRows] = await withCustomerSuccessContext(actor, async () =>
    Promise.all([
      prisma.retentionTenantCurrent.findFirst({
        where: {
          organizationId: actor.organizationId,
          customerRecordId: snapshot.id,
        },
        include: {
          monthFact: {
            select: {
              coverageData: true,
            },
          },
        },
      }),
      prisma.retentionSourceRecord.findMany({
        where: {
          organizationId: actor.organizationId,
          customerRecordId: snapshot.id,
          source: { in: ["ARDA", "CODA", "STRIPE", "HUBSPOT", "PYLON"] },
        },
        orderBy: [{ sourceUpdatedAt: "desc" }, { occurredAt: "desc" }, { createdAt: "desc" }],
        select: {
          source: true,
          objectType: true,
          occurredAt: true,
          sourceUpdatedAt: true,
          payload: true,
        },
      }),
    ])
  );

  const providers = buildProviderLinks(snapshot);
  const latestArdaTenant = sourceRows.find((row) => row.source === "ARDA" && row.objectType === "tenant") ?? null;
  const ardaRows = sourceRows.filter((row) => row.source === "ARDA");
  const codaOrderRows = sourceRows.filter((row) => row.source === "CODA");
  const latestCodaOrder = codaOrderRows
    .map((row) => row.occurredAt ?? row.sourceUpdatedAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0];

  const latestArdaPayload = latestArdaTenant ? asRecord(latestArdaTenant.payload) : {};
  const retentionDetail = retentionCurrent ? asRecord(retentionCurrent.detailData) : {};
  const retentionAdoption = asRecord(retentionDetail.adoptionSummary);
  const retentionCoverageRaw =
    retentionCurrent && retentionCurrent.monthFact ? asRecord(retentionCurrent.monthFact.coverageData) : null;
  const coverage =
    retentionCoverageRaw && Object.keys(retentionCoverageRaw).length > 0
      ? {
          arda: Boolean(asBoolean(retentionCoverageRaw.arda)),
          coda: Boolean(asBoolean(retentionCoverageRaw.coda)),
          stripe: Boolean(asBoolean(retentionCoverageRaw.stripe)),
          hubspot: Boolean(asBoolean(retentionCoverageRaw.hubspot)),
          pylon: Boolean(asBoolean(retentionCoverageRaw.pylon)),
          ardaActivityCollectionAvailable: asBoolean(retentionCoverageRaw.ardaActivityCollectionAvailable) ?? undefined,
          ardaUserDetailsFallback: asBoolean(retentionCoverageRaw.ardaUserDetailsFallback) ?? undefined,
          missingSources: asArray<string>(retentionCoverageRaw.missingSources),
        }
      : buildDerivedCoverage(sourceRows);
  const mergedProviderLinks = mergeProviderLinks(providers, buildDerivedCodaProviderLinks(latestArdaPayload));
  const connectedSystems = countConnectedSystems({
    providers: mergedProviderLinks.map((provider) => provider.provider),
    coverage,
  });

  return {
    connectedSystems,
    providers: mergedProviderLinks,
    retention: retentionCurrent
      ? {
          status: humanizeRetentionStatus(retentionCurrent.status),
          lifecyclePhase: retentionCurrent.lifecyclePhase,
          primaryLirLabel: retentionCurrent.primaryLirLabel,
          primaryLirPassed: retentionCurrent.primaryLirPassed,
          primaryLirValue: retentionCurrent.primaryLirValue ?? undefined,
          primaryLirThreshold: retentionCurrent.primaryLirThreshold ?? undefined,
          currentMonthActivity: retentionCurrent.currentMonthActivity ?? undefined,
          trendVsPriorPct: retentionCurrent.activityTrendPct ?? undefined,
          implementationStage: asString(retentionDetail.implementationStage) ?? undefined,
          goLiveDate: asString(retentionDetail.goLiveDate) ?? undefined,
          subscriptionStartDate: asString(retentionDetail.subscriptionStartDate) ?? undefined,
          firstOrderDate: asString(retentionDetail.firstOrderDate) ?? undefined,
          explanation: asString(retentionDetail.explanation) ?? undefined,
          reasonCodes: parseRelationshipReasons(retentionCurrent.reasonCodes),
          ardaAdoptionCountsSource:
            asString(retentionAdoption.ardaAdoptionCountsSource) as
              | "ARDA_ACTIVITY"
              | "ARDA_USER_DETAILS"
              | "NONE"
              | undefined,
          ardaDirectActivityCounts: {
            orders: asNumber(asRecord(retentionAdoption.ardaDirectActivityCounts).orders) ?? 0,
            cards: asNumber(asRecord(retentionAdoption.ardaDirectActivityCounts).cards) ?? 0,
            items: asNumber(asRecord(retentionAdoption.ardaDirectActivityCounts).items) ?? 0,
          },
          ardaUserDetailsCounts: {
            orders: asNumber(asRecord(retentionAdoption.ardaUserDetailsCounts).orders) ?? 0,
            cards: asNumber(asRecord(retentionAdoption.ardaUserDetailsCounts).cards) ?? 0,
            items: asNumber(asRecord(retentionAdoption.ardaUserDetailsCounts).items) ?? 0,
          },
          coverage,
          detailUrl: `/analytics/retention/${snapshot.id}`,
        }
      : undefined,
    arda:
      latestArdaTenant || ardaRows.length > 0
        ? {
            tenantId: asString(latestArdaPayload.ardaTenantId) ?? undefined,
            configuredTenantId: asString(latestArdaPayload.configuredTenantId) ?? undefined,
            tenantName: asString(latestArdaPayload.tenantName) ?? undefined,
            companyName: asString(latestArdaPayload.companyName) ?? undefined,
            customerStatus: asString(latestArdaPayload.customerStatus) ?? undefined,
            configuredHealth: asString(latestArdaPayload.health) ?? undefined,
            implementationStage: asString(latestArdaPayload.implementationStage) ?? undefined,
            sourceRecordCount: ardaRows.length,
          }
        : undefined,
    coda:
      latestArdaTenant || codaOrderRows.length > 0
        ? {
            customerStatus: asString(latestArdaPayload.customerStatus) ?? undefined,
            configuredHealth: asString(latestArdaPayload.health) ?? undefined,
            mainDocId: asString(latestArdaPayload.mainCodaDocId) ?? undefined,
            orderArchiveDocumentId: asString(latestArdaPayload.orderArchiveDocumentId) ?? undefined,
            mainDocUrl: asString(latestArdaPayload.mainCodaDocId)
              ? `https://coda.io/d/_d${encodeURIComponent(asString(latestArdaPayload.mainCodaDocId)!)}`
              : undefined,
            orderArchiveDocumentUrl: asString(latestArdaPayload.orderArchiveDocumentId)
              ? `https://coda.io/d/_d${encodeURIComponent(asString(latestArdaPayload.orderArchiveDocumentId)!)}`
              : undefined,
            lastOrderAt: latestCodaOrder?.toISOString(),
            sourceRecordCount: codaOrderRows.length,
          }
        : undefined,
  };
}

export async function getCustomerSuccessPortfolio(
  actor: CustomerSuccessActor
): Promise<CustomerSuccessPortfolio> {
  const snapshots = await listCustomerSuccessSnapshots(actor);
  const [retentionCurrents, syncRuns] = await withCustomerSuccessContext(actor, async () =>
    Promise.all([
      prisma.retentionTenantCurrent.findMany({
        where: {
          organizationId: actor.organizationId,
          customerRecordId: { in: snapshots.map((snapshot) => snapshot.id) },
        },
        include: {
          monthFact: {
            select: {
              coverageData: true,
            },
          },
        },
      }),
      prisma.retentionSyncRun.findMany({
        where: {
          organizationId: actor.organizationId,
        },
        orderBy: [{ startedAt: "desc" }],
        take: 25,
      }),
    ])
  );

  const relationshipMap = new Map<string, CustomerSuccessPortfolioRelationshipSummary>();
  retentionCurrents.forEach((current) => {
    const summary = buildPortfolioRelationshipSummary({
      providers:
        snapshots.find((snapshot) => snapshot.id === current.customerRecordId)?.externalProviders ?? [],
      retentionCurrent: current,
    });
    relationshipMap.set(current.customerRecordId, summary);
  });

  const portfolio = buildCustomerSuccessPortfolioFromSnapshots(snapshots, new Date(), relationshipMap);
  const latestRunsBySource = new Map<string, typeof syncRuns[number]>();
  syncRuns.forEach((run) => {
    if (!latestRunsBySource.has(run.source)) {
      latestRunsBySource.set(run.source, run);
    }
  });
  const latestCompletedAt = [...latestRunsBySource.values()]
    .map((run) => run.completedAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0];

  portfolio.relationshipOps = {
    lastCompletedAt: latestCompletedAt?.toISOString(),
    sources: [...latestRunsBySource.values()].map((run) => ({
      source: run.source,
      status: run.status,
      completedAt: run.completedAt?.toISOString(),
      recordCount: run.recordCount,
      mappedCount: run.mappedCount,
      errorCount: run.errorCount,
      lastError: run.lastError ?? undefined,
    })),
  };

  return portfolio;
}

export async function getCustomerSuccessAlertFeed(
  actor: CustomerSuccessActor
): Promise<CustomerSuccessAlertFeed> {
  const portfolio = await getCustomerSuccessPortfolio(actor);
  const alerts = portfolio.alerts;
  return {
    generatedAt: portfolio.generatedAt,
    summary: {
      total: alerts.length,
      open: alerts.filter((alert) => alert.status === "open").length,
      inProgress: alerts.filter((alert) => alert.status === "in_progress").length,
      breached: alerts.filter((alert) => alert.slaStatus === "breached").length,
      critical: alerts.filter((alert) => alert.severity === "critical").length,
    },
    alerts,
  };
}

export async function getCustomerSuccessActivityFeed(
  actor: CustomerSuccessActor
): Promise<CustomerSuccessActivityFeed> {
  const portfolio = await getCustomerSuccessPortfolio(actor);
  return {
    generatedAt: portfolio.generatedAt,
    events: portfolio.recentActivity,
  };
}

export async function getCustomerSuccessAccountDetail(
  actor: CustomerSuccessActor,
  accountId: string
): Promise<CustomerSuccessAccountDetail | null> {
  const snapshot = await getCustomerSuccessSnapshotById(actor, accountId);
  if (!snapshot) return null;
  const detail = buildCustomerSuccessAccountDetailFromSnapshot(snapshot);
  detail.relationshipIntelligence = await buildRelationshipIntelligence(actor, snapshot);
  return detail;
}

export async function createCustomerSuccessNote(
  actor: CustomerSuccessActor,
  input: CreateCustomerSuccessNoteInput
) {
  const body = normalizeOptionalString(input.body);
  if (!body) {
    throw new CustomerSuccessServiceError("Note body is required", 400);
  }

  await requireCustomerSuccessRecord(actor, input.accountId);

  return withCustomerSuccessContext(actor, async () =>
    prisma.customerSuccessNote.create({
      data: {
        customerRecordId: input.accountId,
        authorUserId: actor.id,
        title: normalizeOptionalString(input.title),
        body,
        source: parseNoteSourceInput(input.source),
        visibility: parseNoteVisibilityInput(input.visibility),
        metadata: toJsonMetadata(input.metadata),
      },
    })
  );
}

export async function updateCustomerSuccessAlertStatus(
  actor: CustomerSuccessActor,
  input: UpdateCustomerSuccessAlertStatusInput
) {
  const status = parseAlertStatusInput(input.status);
  const now = new Date();

  await requireCustomerSuccessRecord(actor, input.accountId);

  return withCustomerSuccessContext(actor, async () => {
    const alert = await prisma.customerSuccessAlertRecord.findFirst({
      where: {
        id: input.alertId,
        customerRecordId: input.accountId,
      },
      select: {
        id: true,
      },
    });

    if (!alert) {
      throw new CustomerSuccessServiceError("Customer success alert not found", 404);
    }

    return prisma.customerSuccessAlertRecord.update({
      where: { id: input.alertId },
      data: {
        status,
        resolvedAt:
          status === CustomerSuccessAlertStatus.RESOLVED || status === CustomerSuccessAlertStatus.DISMISSED
            ? now
            : null,
        lastEvaluatedAt: now,
      },
    });
  });
}

export async function createCustomerSuccessTask(
  actor: CustomerSuccessActor,
  input: CreateCustomerSuccessTaskInput
) {
  const title = normalizeOptionalString(input.title);
  if (!title) {
    throw new CustomerSuccessServiceError("Task title is required", 400);
  }

  await requireCustomerSuccessRecord(actor, input.accountId);

  return withCustomerSuccessContext(actor, async () => {
    const status = parseTaskStatusInput(input.status);
    const priority = parsePriorityInput(input.priority);
    const dueDate = parseDateInput(input.dueDate, "dueDate");
    const nextColumnOrder = await getNextColumnOrder(prisma, status);

    return prisma.task.create({
      data: {
        title,
        notes: normalizeOptionalString(input.notes),
        status,
        priority,
        dueDate: dueDate ?? undefined,
        assignedOn: input.responsibleIds && input.responsibleIds.length > 0 ? new Date() : undefined,
        addedBy: actor.id,
        columnOrder: nextColumnOrder,
        customerRecordId: input.accountId,
        responsible: {
          connect: (input.responsibleIds ?? []).map((id) => ({ id })),
        },
        accountable: {
          connect: (input.accountableIds ?? []).map((id) => ({ id })),
        },
        consulted: {
          connect: (input.consultedIds ?? []).map((id) => ({ id })),
        },
        informed: {
          connect: (input.informedIds ?? []).map((id) => ({ id })),
        },
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: status,
            changedBy: actor.id,
          },
        },
      },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        customerRecordId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });
}

export async function createCustomerSuccessPlan(
  actor: CustomerSuccessActor,
  input: CreateCustomerSuccessPlanInput
) {
  const name = normalizeOptionalString(input.name);
  if (!name) {
    throw new CustomerSuccessServiceError("Success plan name is required", 400);
  }

  const targetDate = parseDateInput(input.targetDate, "targetDate");
  const milestoneTitles = (input.milestoneTitles ?? [])
    .map((title) => title.trim())
    .filter((title) => title.length > 0);
  const now = new Date();

  await requireCustomerSuccessRecord(actor, input.accountId);

  return withCustomerSuccessContext(actor, async () =>
    prisma.$transaction(async (tx) => {
      await tx.customerSuccessPlan.updateMany({
        where: {
          customerRecordId: input.accountId,
          status: CustomerSuccessPlanStatus.ACTIVE,
        },
        data: {
          status: CustomerSuccessPlanStatus.ARCHIVED,
        },
      });

      return tx.customerSuccessPlan.create({
        data: {
          customerRecordId: input.accountId,
          name,
          templateKey: normalizeOptionalString(input.templateKey),
          status: CustomerSuccessPlanStatus.ACTIVE,
          ownerUserId: actor.id,
          startedAt: now,
          targetDate: targetDate ?? undefined,
          milestones:
            milestoneTitles.length > 0
              ? {
                  create: milestoneTitles.map((title, index) => ({
                    title,
                    sortOrder: index,
                  })),
                }
              : undefined,
        },
        include: {
          milestones: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          },
        },
      });
    })
  );
}

export async function createCustomerSuccessOutreachDraft(
  actor: CustomerSuccessActor,
  input: SendCustomerSuccessOutreachInput
) {
  const recipientAddress = normalizeOptionalString(input.recipientAddress);
  const body = normalizeOptionalString(input.body);

  if (!recipientAddress) {
    throw new CustomerSuccessServiceError("Recipient address is required", 400);
  }
  if (!body) {
    throw new CustomerSuccessServiceError("Outreach body is required", 400);
  }

  await requireCustomerSuccessRecord(actor, input.accountId);

  return withCustomerSuccessContext(actor, async () =>
    prisma.customerSuccessOutreachMessage.create({
      data: {
        customerRecordId: input.accountId,
        authorUserId: actor.id,
        channel: parseOutreachChannelInput(input.channel),
        status: CustomerSuccessOutreachStatus.DRAFT,
        templateKey: normalizeOptionalString(input.templateKey),
        recipientName: normalizeOptionalString(input.recipientName),
        recipientAddress,
        subject: normalizeOptionalString(input.subject),
        body,
        metadata: toJsonMetadata(input.metadata),
      },
    })
  );
}

export async function sendCustomerSuccessOutreach(
  actor: CustomerSuccessActor,
  input: SendCustomerSuccessOutreachInput
) {
  const recipientAddress = normalizeOptionalString(input.recipientAddress);
  const body = normalizeOptionalString(input.body);

  if (!recipientAddress) {
    throw new CustomerSuccessServiceError("Recipient address is required", 400);
  }
  if (!body) {
    throw new CustomerSuccessServiceError("Outreach body is required", 400);
  }

  const account = await requireCustomerSuccessRecord(actor, input.accountId);
  const now = new Date();
  const channel = parseOutreachChannelInput(input.channel);

  return withCustomerSuccessContext(actor, async () =>
    prisma.$transaction(async (tx) => {
      const message = await tx.customerSuccessOutreachMessage.create({
        data: {
          customerRecordId: input.accountId,
          authorUserId: actor.id,
          channel,
          status: CustomerSuccessOutreachStatus.QUEUED,
          templateKey: normalizeOptionalString(input.templateKey),
          recipientName: normalizeOptionalString(input.recipientName),
          recipientAddress,
          subject: normalizeOptionalString(input.subject),
          body,
          metadata: toJsonMetadata(input.metadata),
          queuedAt: now,
        },
      });

      await publishDomainEvent(
        {
          eventType: "customer_success.outreach.send",
          aggregateType: "customer_success_outreach_message",
          aggregateId: message.id,
          payload: {
            accountId: input.accountId,
            accountName: account.name,
            messageId: message.id,
            organizationId: actor.organizationId,
            authorUserId: actor.id,
            channel,
            templateKey: message.templateKey,
            recipientName: message.recipientName,
            recipientAddress: message.recipientAddress,
            subject: message.subject,
            body: message.body,
            queuedAt: message.queuedAt?.toISOString() ?? now.toISOString(),
            metadata: input.metadata ?? null,
          } as Prisma.InputJsonValue,
          idempotencyKey: buildOutboxIdempotencyKey({
            aggregateType: "customer_success_outreach_message",
            aggregateId: message.id,
            eventType: "customer_success.outreach.send",
          }),
        },
        { outboxEvent: tx.outboxEvent }
      );

      return message;
    })
  );
}
