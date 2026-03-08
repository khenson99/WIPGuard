import type React from "react";

export type TaskStatus =
  | "BACKLOG"
  | "QUEUED"
  | "WORKING_ON_TODAY"
  | "ACTIVE"
  | "NOT_DONE"
  | "DONE";

export type Priority = "P0" | "P1" | "P2" | "P3";
export type DifficultyLevel = "LOW" | "MEDIUM" | "HIGH" | "EPIC";
export type ProjectStatus = "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED";
export type ProjectType = "RECURRING" | "PERPETUAL" | "ONE_OFF";
export type AutomationOperatorKey =
  | "SALES_FOLLOWUP"
  | "CUSTOMER_HEALTH"
  | "GTM_SCRUM"
  | "SEO_GROWTH"
  | "ADS_OPTIMIZER"
  | "ROADMAP_INTELLIGENCE";
export type AutomationArtifactStatus = "DRAFT" | "READY" | "ERROR" | "ARCHIVED";
export type AutomationRecommendationStatus =
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTED"
  | "FAILED";

export type ConferenceStatus =
  | "DRAFT"
  | "PLANNING"
  | "COMMITTED"
  | "ONSITE"
  | "WRAP_UP"
  | "COMPLETE"
  | "CANCELED";

export type ConferenceType =
  | "EXHIBIT"
  | "SPONSOR"
  | "SPEAK"
  | "ATTEND"
  | "HYBRID";

export type ConferenceDeadlineType =
  | "SPONSORSHIP"
  | "REGISTRATION"
  | "CFP"
  | "BOOTH"
  | "SWAG"
  | "SHIPPING"
  | "TRAVEL"
  | "MARKETING"
  | "MEETINGS"
  | "LEAD_UPLOAD"
  | "POSTMORTEM"
  | "OTHER";

export type ConferenceLeadStatus =
  | "NEW"
  | "QUALIFIED"
  | "FOLLOW_UP_SCHEDULED"
  | "CONTACTED"
  | "CONVERTED"
  | "DISQUALIFIED";

export type ConferenceExpenseCategory =
  | "SPONSORSHIP"
  | "BOOTH"
  | "SWAG"
  | "SHIPPING"
  | "TRAVEL"
  | "LODGING"
  | "MEALS"
  | "EVENTS"
  | "SOFTWARE"
  | "OTHER";

export type ConferenceReimbursementStatus =
  | "NONE"
  | "REQUESTED"
  | "APPROVED"
  | "PAID";

export const CONFERENCE_STATUS_LABELS: Record<ConferenceStatus, string> = {
  DRAFT: "Draft",
  PLANNING: "Planning",
  COMMITTED: "Committed",
  ONSITE: "Onsite",
  WRAP_UP: "Wrap-up",
  COMPLETE: "Complete",
  CANCELED: "Canceled",
};

export const CONFERENCE_TYPE_LABELS: Record<ConferenceType, string> = {
  EXHIBIT: "Exhibit",
  SPONSOR: "Sponsor",
  SPEAK: "Speaking",
  ATTEND: "Attend",
  HYBRID: "Hybrid",
};

export const CONFERENCE_DEADLINE_TYPE_LABELS: Record<ConferenceDeadlineType, string> = {
  SPONSORSHIP: "Sponsorship",
  REGISTRATION: "Registration",
  CFP: "CFP",
  BOOTH: "Booth",
  SWAG: "Swag",
  SHIPPING: "Shipping",
  TRAVEL: "Travel",
  MARKETING: "Marketing",
  MEETINGS: "Meetings",
  LEAD_UPLOAD: "Lead upload",
  POSTMORTEM: "Postmortem",
  OTHER: "Other",
};

export const CONFERENCE_LEAD_STATUS_LABELS: Record<ConferenceLeadStatus, string> = {
  NEW: "New",
  QUALIFIED: "Qualified",
  FOLLOW_UP_SCHEDULED: "Follow-up scheduled",
  CONTACTED: "Contacted",
  CONVERTED: "Converted",
  DISQUALIFIED: "Disqualified",
};

export const CONFERENCE_EXPENSE_CATEGORY_LABELS: Record<ConferenceExpenseCategory, string> = {
  SPONSORSHIP: "Sponsorship",
  BOOTH: "Booth",
  SWAG: "Swag",
  SHIPPING: "Shipping",
  TRAVEL: "Travel",
  LODGING: "Lodging",
  MEALS: "Meals",
  EVENTS: "Events",
  SOFTWARE: "Software",
  OTHER: "Other",
};

export const COLUMN_ORDER: TaskStatus[] = [
  "BACKLOG",
  "QUEUED",
  "WORKING_ON_TODAY",
  "ACTIVE",
  "NOT_DONE",
  "DONE",
];

export const COLUMN_LABELS: Record<TaskStatus, string> = {
  BACKLOG: "Backlog",
  QUEUED: "Queued",
  WORKING_ON_TODAY: "Working on Today",
  ACTIVE: "Active",
  NOT_DONE: "Not Done",
  DONE: "Done",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  P0: "var(--priority-p0)",
  P1: "var(--priority-p1)",
  P2: "var(--priority-p2)",
  P3: "var(--priority-p3)",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  P0: "P0 - Critical",
  P1: "P1 - High",
  P2: "P2 - Medium",
  P3: "P3 - Low",
};

/** Dot color by swim lane (column status) */
export const STATUS_COLORS: Record<TaskStatus, string> = {
  BACKLOG: "var(--status-backlog)",
  QUEUED: "var(--status-queued)",
  WORKING_ON_TODAY: "var(--status-working)",
  ACTIVE: "var(--status-active)",
  NOT_DONE: "var(--status-not-done)",
  DONE: "var(--status-done)",
};

/** Card background + ring styles by difficulty (inline style objects) */
export const DIFFICULTY_STYLES: Record<
  DifficultyLevel,
  React.CSSProperties
> = {
  LOW: {
    background: "var(--diff-low-bg)",
    boxShadow: "inset 0 0 0 1px var(--diff-low-ring)",
  },
  MEDIUM: {
    background: "var(--diff-medium-bg)",
    boxShadow: "inset 0 0 0 1px var(--diff-medium-ring)",
  },
  HIGH: {
    background: "var(--diff-high-bg)",
    boxShadow: "inset 0 0 0 1px var(--diff-high-ring)",
  },
  EPIC: {
    background: "var(--diff-epic-bg)",
    boxShadow: "inset 0 0 0 1px var(--diff-epic-ring)",
  },
};

/** Difficulty tag colors (inline style objects) */
export const DIFFICULTY_TAG_STYLES: Record<
  DifficultyLevel,
  React.CSSProperties
> = {
  LOW: { background: "var(--tag-bg)", color: "var(--muted-foreground)" },
  MEDIUM: { background: "var(--diff-medium-ring)", color: "var(--foreground)" },
  HIGH: { background: "var(--diff-high-ring)", color: "var(--foreground)" },
  EPIC: { background: "var(--diff-epic-ring)", color: "var(--foreground)" },
};

export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  LOW: "Easy",
  MEDIUM: "Medium",
  HIGH: "Hard",
  EPIC: "Epic",
};

export interface TaskWithRelations {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: Priority;
  degreeOfDifficulty: DifficultyLevel;
  startDate: string | null;
  dueDate: string | null;
  completedOn: string | null;
  assignedOn: string | null;
  parentId: string | null;
  projectId: string | null;
  sprintId: string | null;
  unplanned: boolean;
  slackThread: string | null;
  columnOrder: number;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string } | null;
  sprint?: { id: string; name: string } | null;
  parent?: { id: string; title: string } | null;
  children?: { id: string; title: string; status: TaskStatus; priority: Priority }[];
  dependsOn?: { id: string; title: string; status: TaskStatus }[];
  dependedBy?: { id: string; title: string; status: TaskStatus }[];
  statusHistory?: { id: string; fromStatus: string | null; toStatus: string; changedAt: string; changedBy: string }[];
  logbookEntries?: { id: string; taskTitle: string; archivedAt: string }[];
  responsible?: UserSummary[];
  accountable?: UserSummary[];
  consulted?: UserSummary[];
  informed?: UserSummary[];
}

export interface UserSummary {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface BoardColumn {
  id: TaskStatus;
  label: string;
  wipLimit: number;
  tasks: TaskWithRelations[];
}

export interface SprintSummary {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface ProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  projectType: ProjectType;
  companyPriorityId: string | null;
}

export interface DepartmentSummary {
  id: string;
  name: string;
  color: string | null;
  _count?: { projects: number };
}

export interface ProjectWithDetails {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  projectType: ProjectType;
  departmentId: string | null;
  department: { id: string; name: string; color: string | null } | null;
  companyPriority: { id: string; name: string; color: string | null } | null;
  responsible: UserSummary[];
  accountable: UserSummary[];
  consulted: UserSummary[];
  informed: UserSummary[];
  sponsor: UserSummary[];
  _count: { tasks: number };
  taskStatusCounts?: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export interface ConferenceListItem {
  id: string;
  slug: string;
  name: string;
  websiteUrl: string | null;
  startDate: string;
  endDate: string;
  timezone: string;
  city: string | null;
  region: string | null;
  country: string | null;
  venue: string | null;
  status: ConferenceStatus;
  type: ConferenceType;
  ownerId: string | null;
  owner: UserSummary | null;
  primaryProjectId: string | null;
  _count: {
    deadlines: number;
    leads: number;
    expenses: number;
    tasks: number;
    projects: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ConferenceDeadline {
  id: string;
  conferenceId: string;
  type: ConferenceDeadlineType;
  name: string;
  dueAt: string;
  completedAt: string | null;
  ownerId: string | null;
  notes: string | null;
  sourceUrl: string | null;
  taskId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConferenceBudgetLineItem {
  id: string;
  budgetId: string;
  category: ConferenceExpenseCategory;
  label: string;
  plannedAmount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConferenceBudget {
  id: string;
  conferenceId: string;
  currency: string;
  notes: string | null;
  lineItems: ConferenceBudgetLineItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ConferenceExpense {
  id: string;
  conferenceId: string;
  category: ConferenceExpenseCategory;
  amount: number;
  currency: string;
  incurredAt: string;
  vendor: string | null;
  description: string | null;
  receiptUrl: string | null;
  reimbursable: boolean;
  reimbursementStatus: ConferenceReimbursementStatus;
  paidByUserId: string | null;
  budgetLineItemId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConferenceLead {
  id: string;
  conferenceId: string;
  status: ConferenceLeadStatus;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  phone: string | null;
  companyName: string | null;
  companyDomain: string | null;
  linkedinUrl: string | null;
  notes: string | null;
  capturedAt: string;
  capturedByUserId: string | null;
  assignedToUserId: string | null;
  followupTaskId: string | null;
  followedUpAt: string | null;
  pushedToHubspotAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConferenceDetailModel extends ConferenceListItem {
  slackChannelId: string | null;
  slackChannelName: string | null;
  slackChannelUrl: string | null;
  driveFolderUrl: string | null;
  codaDocUrl: string | null;
  notes: string | null;
  primaryProject: { id: string; name: string } | null;
  deadlines: ConferenceDeadline[];
  budget: ConferenceBudget | null;
  expenses: ConferenceExpense[];
  leads: ConferenceLead[];
}

export interface ConferenceDetailPayload {
  conference: ConferenceDetailModel;
  summary: import("@/lib/conferences/summary").ConferenceSummary;
  meta?: { servedAt: string; isPartial: boolean };
}

// ── Deals CRM ──

export type DealStage =
  | "LEAD"
  | "QUALIFIED"
  | "PROPOSAL"
  | "NEGOTIATION"
  | "CLOSED_WON"
  | "CLOSED_LOST";

export type DealSource =
  | "ADS"
  | "WEBSITE"
  | "ORGANIC"
  | "REFERRAL"
  | "CONFERENCE"
  | "OUTBOUND"
  | "PARTNER"
  | "OTHER";

export type MeetingStatus =
  | "SCHEDULED"
  | "COMPLETED"
  | "CANCELED"
  | "NO_SHOW";

export const DEAL_STAGE_ORDER: DealStage[] = [
  "LEAD",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
  "CLOSED_WON",
  "CLOSED_LOST",
];

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  LEAD: "Lead",
  QUALIFIED: "Qualified",
  PROPOSAL: "Proposal",
  NEGOTIATION: "Negotiation",
  CLOSED_WON: "Closed Won",
  CLOSED_LOST: "Closed Lost",
};

export const DEAL_SOURCE_LABELS: Record<DealSource, string> = {
  ADS: "Ads",
  WEBSITE: "Website",
  ORGANIC: "Organic",
  REFERRAL: "Referral",
  CONFERENCE: "Conference",
  OUTBOUND: "Outbound",
  PARTNER: "Partner",
  OTHER: "Other",
};

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
  NO_SHOW: "No Show",
};

export interface DealCompanySummary {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  _count?: { contacts: number; deals: number };
}

export interface DealContactSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  companyId: string | null;
  company?: { id: string; name: string } | null;
}

export interface DealListItem {
  id: string;
  name: string;
  stage: DealStage;
  amount: number;
  source: DealSource;
  expectedCloseDate: string | null;
  closedAt: string | null;
  companyId: string | null;
  company: { id: string; name: string } | null;
  ownerId: string | null;
  owner: UserSummary | null;
  contacts: DealContactSummary[];
  _count: { meetings: number; contacts: number };
  lastMeetingAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DealMeetingListItem {
  id: string;
  title: string;
  status: MeetingStatus;
  startAt: string;
  endAt: string | null;
  location: string | null;
  expectedAttendees: number;
  actualAttendees: number;
  dealId: string | null;
  deal: { id: string; name: string } | null;
  companyId: string | null;
  company: { id: string; name: string } | null;
  _count: { attendees: number };
  createdAt: string;
}

export type SavedViewScope = "TASKS" | "PROJECTS";

export interface UserUiPreference {
  id: string;
  userId: string;
  dashboardConfig: Record<string, unknown> | null;
  tasksConfig: Record<string, unknown> | null;
  projectsConfig: Record<string, unknown> | null;
  analyticsConfig: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserSavedView {
  id: string;
  userId: string;
  scope: SavedViewScope;
  slug: string;
  name: string;
  isDefault: boolean;
  isSystem: boolean;
  config: Record<string, unknown>;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export type WorkflowScope = "PRIVATE" | "SHARED";
export type WorkflowStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ERROR" | "ARCHIVED";
export type WorkflowNodeType = "TRIGGER" | "CONDITION" | "ACTION" | "APPROVAL" | "DELAY";
export type WorkflowRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "WAITING_APPROVAL"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED";
export type WorkflowStepStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "SKIPPED"
  | "WAITING_APPROVAL";
export type WorkflowApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "TIMED_OUT"
  | "CANCELED";

export interface WorkflowNode {
  id: string;
  workflowId: string;
  nodeKey: string;
  type: WorkflowNodeType;
  label: string;
  config: Record<string, unknown>;
  positionX: number;
  positionY: number;
}

export interface WorkflowEdge {
  id: string;
  workflowId: string;
  sourceNodeKey: string;
  targetNodeKey: string;
  conditionLabel: string | null;
  conditionExpr: Record<string, unknown> | null;
  priority: number;
}

export interface WorkflowDefinition {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  scope: WorkflowScope;
  status: WorkflowStatus;
  providers: string[];
  rolePolicy: Record<string, unknown> | null;
  isSystemManaged: boolean;
  graphVersion: number;
  graph: Record<string, unknown>;
  lastPublishedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  requestedById: string | null;
  triggerProvider: string | null;
  triggerType: string | null;
  triggerId: string | null;
  status: WorkflowRunStatus;
  correlationId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowApproval {
  id: string;
  runId: string;
  stepId: string | null;
  nodeKey: string;
  requestedById: string | null;
  approverId: string | null;
  status: WorkflowApprovalStatus;
  decisionNote: string | null;
  timeoutAt: string | null;
  resolvedAt: string | null;
}
