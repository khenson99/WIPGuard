import type {
  AutomationOperatorKey,
  Prisma,
} from "@/generated/prisma/client";

export interface AutomationTemplate {
  key: string;
  name: string;
  description: string;
  operatorKey?: AutomationOperatorKey | null;
  providers: string[];
  graph: Prisma.JsonObject;
}

function operatorExecutionNode(positionX: number, positionY: number) {
  return {
    key: "execute_recommendations",
    type: "ACTION" as const,
    label: "Execute Approved Recommendations",
    config: {
      actionType: "execute_recommendation",
      limit: 50,
    },
    positionX,
    positionY,
  };
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
    key: "hubspot-demo-followup",
    name: "HubSpot Demo Follow-up",
    description:
      "Analyze post-demo context, draft follow-up assets, and prepare CRM updates for the deal owner.",
    operatorKey: "SALES_FOLLOWUP",
    providers: ["HUBSPOT", "GOOGLE_WORKSPACE"],
    graph: {
      nodes: [
        {
          key: "trigger_demo_complete",
          type: "TRIGGER",
          label: "Demo Context Ready",
          config: { provider: "hubspot", eventType: "hubspot.deal.demo_completed" },
          positionX: 80,
          positionY: 120,
        },
        {
          key: "analyze_demo",
          type: "ACTION",
          label: "Analyze Demo",
          config: {
            actionType: "ai_analyze",
            promptVersion: "2026-03-08",
            instructionsTemplate: [
              "Create durable post-demo follow-up outputs for Arda.",
              "Use the transcript, CRM context, and meeting notes to produce:",
              "1. A rep coaching memo.",
              "2. A deal next-step memo.",
              "3. Recommendations for HubSpot updates, CRM reminder task creation, internal follow-up tasks, Gmail draft creation, and calendar invite drafting when a next meeting was agreed.",
              "Use action types create_task, create_hubspot_task, update_hubspot, create_gmail_draft, and create_calendar_draft.",
              "Mark calendar drafting recommendations as approval-worthy when the meeting is not already confirmed.",
            ].join("\n"),
          },
          positionX: 360,
          positionY: 120,
        },
        operatorExecutionNode(650, 120),
      ],
      edges: [
        { source: "trigger_demo_complete", target: "analyze_demo", priority: 0 },
        { source: "analyze_demo", target: "execute_recommendations", priority: 0 },
      ],
    },
  },
  {
    key: "sales-followup-operator",
    name: "Sales Follow-up Operator",
    description:
      "Turn sales demo transcripts into coaching, CRM actions, follow-up drafts, and reminder tasks.",
    operatorKey: "SALES_FOLLOWUP",
    providers: ["GOOGLE_WORKSPACE", "HUBSPOT", "WIPGUARD"],
    graph: {
      nodes: [
        {
          key: "trigger_sales_transcript",
          type: "TRIGGER",
          label: "Transcript Ready",
          config: {
            provider: "google-workspace",
            eventType: "google-workspace.meet.transcript_ready",
          },
          positionX: 80,
          positionY: 120,
        },
        {
          key: "analyze_followup",
          type: "ACTION",
          label: "Analyze Follow-up",
          config: {
            actionType: "ai_analyze",
            promptVersion: "2026-03-08",
            instructionsTemplate: [
              "You are Arda's revenue operations copilot.",
              "Review the sales demo context and produce artifacts for coaching and deal progression.",
              "Recommendations should cover create_task, create_hubspot_task, update_hubspot, create_gmail_draft, create_calendar_draft, and post_slack_digest when internal visibility is required.",
              "Use create_hubspot_task for CRM reminder tasks and create_task for internal follow-up reminders over the coming days and weeks.",
              "When next meeting scheduling is not explicitly confirmed, keep it as a recommendation instead of assuming it is safe to execute.",
            ].join("\n"),
          },
          positionX: 360,
          positionY: 120,
        },
        operatorExecutionNode(650, 120),
      ],
      edges: [
        { source: "trigger_sales_transcript", target: "analyze_followup", priority: 0 },
        { source: "analyze_followup", target: "execute_recommendations", priority: 0 },
      ],
    },
  },
  {
    key: "customer-health-operator",
    name: "Customer Health Operator",
    description:
      "Translate churn-risk signals into intervention plans, renewal tasks, and internal alerts.",
    operatorKey: "CUSTOMER_HEALTH",
    providers: ["WIPGUARD", "STRIPE", "PYLON", "HUBSPOT", "SLACK", "GOOGLE_WORKSPACE"],
    graph: {
      nodes: [
        {
          key: "trigger_health_risk",
          type: "TRIGGER",
          label: "Health Risk Detected",
          config: {
            provider: "wipguard",
            eventType: "customer.health.risk_detected",
          },
          positionX: 80,
          positionY: 120,
        },
        {
          key: "analyze_health",
          type: "ACTION",
          label: "Analyze Account Health",
          config: {
            actionType: "ai_analyze",
            promptVersion: "2026-03-08",
            instructionsTemplate: [
              "Diagnose the leading indicators of churn from the supplied account-health signals.",
              "Create at least one intervention artifact and actionable recommendations.",
              "Use create_task for internal intervention work, create_hubspot_task for CRM reminder tasks, update_hubspot for CRM notes, and create_gmail_draft only when customer outreach is warranted.",
              "Prefer internal actions unless the supplied context clearly calls for customer communication.",
            ].join("\n"),
          },
          positionX: 360,
          positionY: 120,
        },
        operatorExecutionNode(650, 120),
      ],
      edges: [
        { source: "trigger_health_risk", target: "analyze_health", priority: 0 },
        { source: "analyze_health", target: "execute_recommendations", priority: 0 },
      ],
    },
  },
  {
    key: "gtm-scrum-operator",
    name: "GTM Scrum Operator",
    description:
      "Aggregate GTM recommendations into a prioritized execution digest and GitHub ticket backlog.",
    operatorKey: "GTM_SCRUM",
    providers: ["WIPGUARD", "GOOGLE_ANALYTICS", "HUBSPOT", "STRIPE", "SLACK"],
    graph: {
      nodes: [
        {
          key: "trigger_gtm_scrum",
          type: "TRIGGER",
          label: "GTM Scrum Intake Ready",
          config: {
            provider: "wipguard",
            eventType: "gtm.scrum.digest_requested",
          },
          positionX: 80,
          positionY: 120,
        },
        {
          key: "synthesize_scrum",
          type: "ACTION",
          label: "Synthesize Priorities",
          config: {
            actionType: "ai_generate",
            promptVersion: "2026-03-08",
            instructionsTemplate: [
              "Aggregate the current GTM inputs into a prioritized execution backlog.",
              "Artifacts should include a daily or weekly digest memo.",
              "Recommendations should use create_github_issue, create_task, and post_slack_digest.",
              "Use labels that include operator:sales, operator:cs, operator:growth, operator:roadmap, or operator:scrum when creating GitHub issues.",
            ].join("\n"),
          },
          positionX: 360,
          positionY: 120,
        },
        operatorExecutionNode(650, 120),
      ],
      edges: [
        { source: "trigger_gtm_scrum", target: "synthesize_scrum", priority: 0 },
        { source: "synthesize_scrum", target: "execute_recommendations", priority: 0 },
      ],
    },
  },
  {
    key: "seo-growth-operator",
    name: "SEO Growth Operator",
    description:
      "Convert Search Console, analytics, and Webflow signals into SEO fixes and content briefs.",
    operatorKey: "SEO_GROWTH",
    providers: ["GOOGLE_SEARCH_CONSOLE", "GOOGLE_ANALYTICS", "WEBFLOW", "SEMRUSH"],
    graph: {
      nodes: [
        {
          key: "trigger_search_console",
          type: "TRIGGER",
          label: "Search Snapshot Ready",
          config: {
            provider: "google-search-console",
            eventType: "search-console.snapshot.ready",
          },
          positionX: 80,
          positionY: 120,
        },
        {
          key: "analyze_growth",
          type: "ACTION",
          label: "Analyze SEO Growth",
          config: {
            actionType: "ai_analyze",
            promptVersion: "2026-03-08",
            instructionsTemplate: [
              "Produce SEO optimization artifacts and execution recommendations for Arda's website.",
              "Artifacts should include page-fix backlogs, content briefs, and repurposed channel copy.",
              "Recommendations should prefer create_task and create_github_issue for implementation work.",
              "Only recommend create_gmail_draft when explicit outreach to partners or customers is clearly justified by the context.",
            ].join("\n"),
          },
          positionX: 360,
          positionY: 120,
        },
        operatorExecutionNode(650, 120),
      ],
      edges: [
        { source: "trigger_search_console", target: "analyze_growth", priority: 0 },
        { source: "analyze_growth", target: "execute_recommendations", priority: 0 },
      ],
    },
  },
  {
    key: "ads-optimizer-operator",
    name: "Ads Optimizer",
    description:
      "Review paid channel snapshots and recommend spend shifts, landing-page tests, and messaging changes.",
    operatorKey: "ADS_OPTIMIZER",
    providers: ["GOOGLE_ADS", "META_ADS", "REDDIT", "GOOGLE_ANALYTICS", "WEBFLOW", "WIPGUARD"],
    graph: {
      nodes: [
        {
          key: "trigger_ads_snapshot",
          type: "TRIGGER",
          label: "Ads Snapshot Ready",
          config: {
            provider: "wipguard",
            eventType: "ads.snapshot.ready",
          },
          positionX: 80,
          positionY: 120,
        },
        {
          key: "optimize_ads",
          type: "ACTION",
          label: "Optimize Ads",
          config: {
            actionType: "ai_analyze",
            promptVersion: "2026-03-08",
            instructionsTemplate: [
              "Identify channel-level anomalies, experiment opportunities, and landing-page fixes.",
              "Spend changes should remain recommendations and should never be auto-executed.",
              "Use create_task and create_github_issue for internal implementation work.",
              "If a spend adjustment is recommended, express it as actionType adjust_ad_spend so it remains approval-gated.",
            ].join("\n"),
          },
          positionX: 360,
          positionY: 120,
        },
        operatorExecutionNode(650, 120),
      ],
      edges: [
        { source: "trigger_ads_snapshot", target: "optimize_ads", priority: 0 },
        { source: "optimize_ads", target: "execute_recommendations", priority: 0 },
      ],
    },
  },
  {
    key: "funnel-dropoff-operator",
    name: "Funnel Dropoff Operator",
    description:
      "Triage funnel dropoff alerts into explainable diagnostics, landing-page experiments, and GTM follow-up work.",
    operatorKey: "ADS_OPTIMIZER",
    providers: ["WIPGUARD", "GOOGLE_ANALYTICS", "WEBFLOW", "GOOGLE_ADS", "META_ADS", "REDDIT"],
    graph: {
      nodes: [
        {
          key: "trigger_funnel_dropoff",
          type: "TRIGGER",
          label: "Funnel Dropoff Detected",
          config: {
            provider: "wipguard",
            eventType: "analytics.funnel.dropoff_detected",
          },
          positionX: 80,
          positionY: 120,
        },
        {
          key: "triage_dropoff",
          type: "ACTION",
          label: "Triage Funnel Dropoff",
          config: {
            actionType: "ai_analyze",
            promptVersion: "2026-03-10",
            instructionsTemplate: [
              "Analyze the funnel dropoff event and explain the most likely source of the conversion loss.",
              "Artifacts should include a diagnostic memo, root-cause summary, and experiment brief when there is a plausible recovery path.",
              "Recommendations should favor create_task, create_github_issue, and post_slack_digest for internal follow-up.",
              "If paid-media budget reallocation is warranted, express it as actionType adjust_ad_spend so it remains recommendation-only and approval-gated.",
            ].join("\n"),
          },
          positionX: 360,
          positionY: 120,
        },
        operatorExecutionNode(650, 120),
      ],
      edges: [
        { source: "trigger_funnel_dropoff", target: "triage_dropoff", priority: 0 },
        { source: "triage_dropoff", target: "execute_recommendations", priority: 0 },
      ],
    },
  },
  {
    key: "roadmap-intelligence-operator",
    name: "Roadmap Intelligence",
    description:
      "Synthesize customer, sales, product, and competitor inputs into roadmap proposals and reprioritization guidance.",
    operatorKey: "ROADMAP_INTELLIGENCE",
    providers: ["WIPGUARD", "PYLON", "GOOGLE_WORKSPACE", "HUBSPOT"],
    graph: {
      nodes: [
        {
          key: "trigger_roadmap_intake",
          type: "TRIGGER",
          label: "Roadmap Intake Ready",
          config: {
            provider: "wipguard",
            eventType: "roadmap.intake.ready",
          },
          positionX: 80,
          positionY: 120,
        },
        {
          key: "analyze_roadmap",
          type: "ACTION",
          label: "Analyze Roadmap Inputs",
          config: {
            actionType: "ai_generate",
            promptVersion: "2026-03-08",
            instructionsTemplate: [
              "Create roadmap memos, reprioritization rationale, and implementation-ready issue recommendations.",
              "Recommendations should use create_github_issue and create_task.",
              "Every recommendation should state which customer or market signal it addresses and why it matters now.",
            ].join("\n"),
          },
          positionX: 360,
          positionY: 120,
        },
        operatorExecutionNode(650, 120),
      ],
      edges: [
        { source: "trigger_roadmap_intake", target: "analyze_roadmap", priority: 0 },
        { source: "analyze_roadmap", target: "execute_recommendations", priority: 0 },
      ],
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
