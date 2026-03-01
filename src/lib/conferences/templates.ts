import {
  ConferenceDeadlineType,
  type Prisma,
} from "@/generated/prisma/client";

export type PlaybookDeadlineAnchor = "start" | "end";

export interface ConferenceWorkstreamTemplate {
  key: string;
  name: string;
}

export interface ConferenceDeadlineTemplate {
  anchor: PlaybookDeadlineAnchor;
  offsetDays: number;
  type: ConferenceDeadlineType;
  name: string;
  workstreamKey: string;
  createTask: boolean;
}

export interface ConferenceRunbookTaskTemplate {
  title: string;
  workstreamKey: string;
  notes?: string;
  checklist?: string[];
}

export interface ConferencePlaybookTemplate {
  key: string;
  name: string;
  description: string;
  workstreams: ConferenceWorkstreamTemplate[];
  deadlines: ConferenceDeadlineTemplate[];
  runbookTasks: ConferenceRunbookTaskTemplate[];
  defaultBudgetLineItems: Array<{
    categoryKey: Prisma.JsonValue;
    label: string;
    plannedAmount: number;
  }>;
}

export const EXHIBITING_PLAYBOOK: ConferencePlaybookTemplate = {
  key: "exhibiting_sponsoring",
  name: "Exhibiting / Sponsoring",
  description:
    "Booth + sponsorship deliverables, swag/inventory, staffing schedule, onsite lead capture, and post-event pipeline follow-up.",
  workstreams: [
    { key: "sponsorship_booth", name: "Sponsorship & Booth" },
    { key: "swag_inventory", name: "Swag & Inventory" },
    { key: "logistics_travel", name: "Logistics & Travel" },
    { key: "marketing_pr", name: "Marketing & PR" },
    { key: "meetings_demos", name: "Meetings & Demos" },
    { key: "lead_followup", name: "Lead Follow-up" },
    { key: "ops", name: "Ops" },
  ],
  deadlines: [
    {
      anchor: "start",
      offsetDays: -180,
      type: ConferenceDeadlineType.OTHER,
      name: "Commit decision + budget approved",
      workstreamKey: "ops",
      createTask: true,
    },
    {
      anchor: "start",
      offsetDays: -150,
      type: ConferenceDeadlineType.SPONSORSHIP,
      name: "Sponsorship contract signed / booth reserved",
      workstreamKey: "sponsorship_booth",
      createTask: true,
    },
    {
      anchor: "start",
      offsetDays: -120,
      type: ConferenceDeadlineType.BOOTH,
      name: "Booth design draft complete",
      workstreamKey: "sponsorship_booth",
      createTask: true,
    },
    {
      anchor: "start",
      offsetDays: -90,
      type: ConferenceDeadlineType.SWAG,
      name: "Swag order placed",
      workstreamKey: "swag_inventory",
      createTask: true,
    },
    {
      anchor: "start",
      offsetDays: -75,
      type: ConferenceDeadlineType.SHIPPING,
      name: "Shipping plan finalized",
      workstreamKey: "swag_inventory",
      createTask: true,
    },
    {
      anchor: "start",
      offsetDays: -60,
      type: ConferenceDeadlineType.TRAVEL,
      name: "Flights + hotel booked",
      workstreamKey: "logistics_travel",
      createTask: true,
    },
    {
      anchor: "start",
      offsetDays: -45,
      type: ConferenceDeadlineType.MEETINGS,
      name: "Outreach list finalized + meeting outreach starts",
      workstreamKey: "meetings_demos",
      createTask: true,
    },
    {
      anchor: "start",
      offsetDays: -30,
      type: ConferenceDeadlineType.MARKETING,
      name: "Print collateral finalized",
      workstreamKey: "marketing_pr",
      createTask: true,
    },
    {
      anchor: "start",
      offsetDays: -14,
      type: ConferenceDeadlineType.SHIPPING,
      name: "Ship booth/swag",
      workstreamKey: "swag_inventory",
      createTask: true,
    },
    {
      anchor: "start",
      offsetDays: -7,
      type: ConferenceDeadlineType.OTHER,
      name: "Internal briefing + run-of-show finalized",
      workstreamKey: "ops",
      createTask: true,
    },
    {
      anchor: "end",
      offsetDays: 1,
      type: ConferenceDeadlineType.LEAD_UPLOAD,
      name: "Leads cleaned + HubSpot push complete",
      workstreamKey: "lead_followup",
      createTask: true,
    },
    {
      anchor: "end",
      offsetDays: 3,
      type: ConferenceDeadlineType.MEETINGS,
      name: "First follow-up wave complete",
      workstreamKey: "lead_followup",
      createTask: true,
    },
    {
      anchor: "end",
      offsetDays: 14,
      type: ConferenceDeadlineType.POSTMORTEM,
      name: "Postmortem + ROI report complete",
      workstreamKey: "ops",
      createTask: true,
    },
  ],
  runbookTasks: [
    {
      title: "[Runbook] Booth packing checklist",
      workstreamKey: "swag_inventory",
      checklist: [
        "Booth structure + hardware",
        "Tablecloth + signage",
        "Swag + collateral",
        "Lead capture supplies (badges, scanner, iPad)",
        "Power strips + extension cords",
      ],
    },
    {
      title: "[Onsite] Daily checklist",
      workstreamKey: "ops",
      checklist: [
        "Booth setup checked",
        "Staffing schedule confirmed",
        "Meeting schedule reviewed",
        "Lead capture working",
        "End-of-day lead upload + notes",
      ],
    },
    {
      title: "[Runbook] Lead upload SOP",
      workstreamKey: "lead_followup",
      notes:
        "Define how to capture, qualify, and push leads to HubSpot; include attribution and follow-up SLAs.",
    },
  ],
  defaultBudgetLineItems: [
    { categoryKey: "SPONSORSHIP", label: "Sponsorship", plannedAmount: 0 },
    { categoryKey: "BOOTH", label: "Booth / Exhibit", plannedAmount: 0 },
    { categoryKey: "SWAG", label: "Swag", plannedAmount: 0 },
    { categoryKey: "SHIPPING", label: "Shipping", plannedAmount: 0 },
    { categoryKey: "TRAVEL", label: "Travel", plannedAmount: 0 },
    { categoryKey: "LODGING", label: "Lodging", plannedAmount: 0 },
    { categoryKey: "MEALS", label: "Meals", plannedAmount: 0 },
    { categoryKey: "EVENTS", label: "Events", plannedAmount: 0 },
  ],
};

