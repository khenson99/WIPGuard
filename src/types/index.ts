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

export interface UserSummary {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface DepartmentSummary {
  id: string;
  name: string;
  color: string | null;
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
  _count: {
    deadlines: number;
    leads: number;
    expenses: number;
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
  notes: string | null;
  googleDriveFileId: string | null;
  googleDriveFileName: string | null;
  googleDriveFileUrl: string | null;
  transcriptMatchedAt: string | null;
  transcriptMatchConfidence: number | null;
  analysisArtifactId: string | null;
  demoQualityScore: number | null;
  demoQualitySummary: string | null;
  demoStrengthsJson: unknown;
  demoGapsJson: unknown;
  analyzedAt: string | null;
  expectedAttendees: number;
  actualAttendees: number;
  dealId: string | null;
  deal: { id: string; name: string } | null;
  companyId: string | null;
  company: { id: string; name: string } | null;
  _count: { attendees: number };
  createdAt: string;
}

export interface UserUiPreference {
  id: string;
  userId: string;
  dashboardConfig: Record<string, unknown> | null;
  analyticsConfig: Record<string, unknown> | null;
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
