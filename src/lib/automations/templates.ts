import type { Prisma } from "@/generated/prisma/client";

export interface AutomationTemplate {
  key: string;
  name: string;
  description: string;
  providers: string[];
  graph: Prisma.JsonObject;
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    key: "google-gmail-commitment",
    name: "Gmail Commitment Capture",
    description: "Create tasks from labeled Gmail threads and assign due dates from message hints.",
    providers: ["GOOGLE_WORKSPACE"],
    graph: {
      nodes: [
        {
          key: "trigger_gmail",
          type: "TRIGGER",
          label: "Gmail Labeled Thread",
          config: { provider: "google-workspace", eventType: "gmail.thread.labeled" },
          positionX: 80,
          positionY: 80,
        },
        {
          key: "create_task",
          type: "ACTION",
          label: "Create Task",
          config: {
            actionType: "create_task",
            titleTemplate: "Follow up: {{trigger.payload.subject}}",
            notesTemplate: "Source thread: {{trigger.payload.threadUrl}}",
            priority: "P2",
          },
          positionX: 340,
          positionY: 80,
        },
      ],
      edges: [{ source: "trigger_gmail", target: "create_task", priority: 0 }],
    },
  },
  {
    key: "slack-unanswered-sla",
    name: "Slack SLA Escalation",
    description: "Escalate unanswered Slack requests into triage tasks.",
    providers: ["SLACK"],
    graph: {
      nodes: [
        {
          key: "trigger_slack",
          type: "TRIGGER",
          label: "Slack SLA Breach",
          config: { provider: "slack", eventType: "slack.request.sla_breach" },
          positionX: 80,
          positionY: 80,
        },
        {
          key: "approval",
          type: "APPROVAL",
          label: "Manager Approval",
          config: { approverPolicy: { role: "admin" }, timeoutMinutes: 60 },
          positionX: 340,
          positionY: 80,
        },
        {
          key: "create_task",
          type: "ACTION",
          label: "Create Escalation Task",
          config: {
            actionType: "create_task",
            titleTemplate: "SLA Breach: {{trigger.payload.channelName}}",
            notesTemplate: "Thread: {{trigger.payload.threadUrl}}",
            priority: "P1",
            status: "QUEUED",
          },
          positionX: 620,
          positionY: 40,
        },
      ],
      edges: [
        { source: "trigger_slack", target: "approval", priority: 0 },
        { source: "approval", target: "create_task", conditionLabel: "approved", priority: 0 },
      ],
    },
  },
  {
    key: "hubspot-stage-checklist",
    name: "HubSpot Stage Checklist",
    description: "When a deal enters a stage, create a deterministic checklist task set.",
    providers: ["HUBSPOT"],
    graph: {
      nodes: [
        {
          key: "trigger_hubspot",
          type: "TRIGGER",
          label: "Deal Stage Changed",
          config: { provider: "hubspot", eventType: "hubspot.deal.stage_changed" },
          positionX: 80,
          positionY: 120,
        },
        {
          key: "create_checklist",
          type: "ACTION",
          label: "Create Checklist Tasks",
          config: {
            actionType: "create_checklist_tasks",
            titleTemplate: "{{trigger.payload.dealName}} • Stage Checklist",
            checklist: ["Owner alignment", "Follow-up email", "Next call scheduled"],
            priority: "P2",
          },
          positionX: 370,
          positionY: 120,
        },
      ],
      edges: [{ source: "trigger_hubspot", target: "create_checklist", priority: 0 }],
    },
  },
  {
    key: "coda-row-upsert",
    name: "Coda Row Upsert to Task",
    description: "Upsert a WIPGuard task whenever a tracked Coda row is created or updated.",
    providers: ["CODA"],
    graph: {
      nodes: [
        {
          key: "trigger_coda",
          type: "TRIGGER",
          label: "Coda Row Changed",
          config: { provider: "coda", eventType: "coda.row.changed" },
          positionX: 80,
          positionY: 120,
        },
        {
          key: "create_task",
          type: "ACTION",
          label: "Create Task",
          config: {
            actionType: "create_task",
            titleTemplate: "{{trigger.payload.row.title}}",
            notesTemplate: "Coda row: {{trigger.payload.rowUrl}}",
            priority: "P2",
            status: "QUEUED",
          },
          positionX: 360,
          positionY: 120,
        },
      ],
      edges: [{ source: "trigger_coda", target: "create_task", priority: 0 }],
    },
  },
  {
    key: "reddit-mention-followup",
    name: "Reddit Mention Follow-up",
    description: "Create follow-up tasks from Reddit mentions or inbox messages.",
    providers: ["REDDIT"],
    graph: {
      nodes: [
        {
          key: "trigger_reddit",
          type: "TRIGGER",
          label: "Reddit Mention",
          config: { provider: "reddit", eventType: "reddit.inbox.mention" },
          positionX: 80,
          positionY: 80,
        },
        {
          key: "create_task",
          type: "ACTION",
          label: "Create Follow-up Task",
          config: {
            actionType: "create_task",
            titleTemplate: "Reddit follow-up: {{trigger.payload.title}}",
            notesTemplate: "Source: {{trigger.payload.permalink}}",
            priority: "P1",
            status: "QUEUED",
          },
          positionX: 360,
          positionY: 80,
        },
      ],
      edges: [{ source: "trigger_reddit", target: "create_task", priority: 0 }],
    },
  },
];
