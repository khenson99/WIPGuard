export const ARDA_GTM_OPERATOR_BOARD_PROJECT_NAME = "Arda GTM Operators";

export const ARDA_GTM_OPERATOR_BOARD_PROJECT_DESCRIPTION =
  "Dedicated rollout board for Arda's GTM operator program, including workflow foundations, operator launches, and mixed-autonomy approval work.";

export interface ArdaGtmOperatorBoardTaskTemplate {
  title: string;
  notes: string;
  status: "BACKLOG" | "QUEUED" | "ACTIVE" | "DONE";
  priority: "P0" | "P1" | "P2";
  operatorKey?: string;
  wave: "wave0" | "wave1" | "wave2" | "wave3";
  ownerEmail?: string;
}

export const ARDA_GTM_OPERATOR_BOARD_TASKS: readonly ArdaGtmOperatorBoardTaskTemplate[] = [
  {
    title: "Wave 0: operator runtime and audit trail foundation",
    notes:
      "Persist source documents, artifacts, recommendations, approvals, AI jobs, and execution traces so GTM operators remain auditable.",
    status: "DONE",
    priority: "P0",
    wave: "wave0",
    ownerEmail: "kyle@arda.cards",
  },
  {
    title: "Wave 0: seed GTM operator workflows",
    notes:
      "Ship shared workflow templates and system-managed workflow seeds for each Arda GTM operator.",
    status: "DONE",
    priority: "P1",
    wave: "wave0",
    ownerEmail: "kyle@arda.cards",
  },
  {
    title: "Wave 0: dedicated Ralph board for operator rollout",
    notes:
      "Expose a dedicated project-backed board so the Arda team can track operator rollout work in one place.",
    status: "DONE",
    priority: "P1",
    wave: "wave0",
    ownerEmail: "kyle@arda.cards",
  },
  {
    title: "Wave 1: launch Sales Follow-up operator",
    notes:
      "Validate post-demo follow-up analysis, internal tasking, CRM updates, and approval-gated customer drafts.",
    status: "QUEUED",
    priority: "P1",
    operatorKey: "SALES_FOLLOWUP",
    wave: "wave1",
    ownerEmail: "mat@arda.cards",
  },
  {
    title: "Wave 1: launch Customer Health operator",
    notes:
      "Validate health-signal ingestion, intervention briefs, internal save motions, and approval-gated outreach drafts.",
    status: "QUEUED",
    priority: "P1",
    operatorKey: "CUSTOMER_HEALTH",
    wave: "wave1",
    ownerEmail: "mat@arda.cards",
  },
  {
    title: "Wave 1: launch GTM Scrum operator",
    notes:
      "Validate daily GTM signal synthesis, scrum brief generation, internal Slack digests, and backlog follow-through.",
    status: "ACTIVE",
    priority: "P1",
    operatorKey: "GTM_SCRUM",
    wave: "wave1",
    ownerEmail: "kyle@arda.cards",
  },
  {
    title: "Wave 2: launch SEO Growth operator",
    notes:
      "Validate search delta analysis, content and SEO brief generation, and internal execution recommendations.",
    status: "BACKLOG",
    priority: "P2",
    operatorKey: "SEO_GROWTH",
    wave: "wave2",
    ownerEmail: "kyle@arda.cards",
  },
  {
    title: "Wave 2: launch Ads Optimizer operator",
    notes:
      "Validate paid media anomaly analysis, internal investigation tasks, and approval-gated status messaging.",
    status: "BACKLOG",
    priority: "P2",
    operatorKey: "ADS_OPTIMIZER",
    wave: "wave2",
    ownerEmail: "kyle@arda.cards",
  },
  {
    title: "Wave 3: launch Roadmap Intelligence operator",
    notes:
      "Validate roadmap signal synthesis, GitHub issue generation, and stakeholder-facing drafts gated by approval.",
    status: "BACKLOG",
    priority: "P2",
    operatorKey: "ROADMAP_INTELLIGENCE",
    wave: "wave3",
    ownerEmail: "miguel@arda.cards",
  },
] as const;
