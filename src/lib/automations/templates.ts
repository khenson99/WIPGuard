import type { AutomationOperatorKey, Prisma } from "@/generated/prisma/client";

export interface AutomationTemplate {
  key: string;
  name: string;
  description: string;
  providers: string[];
  operatorKey?: AutomationOperatorKey;
  graph: Prisma.JsonObject;
}

function executeApprovedRecommendationsNode(key: string, positionX: number, positionY: number) {
  return {
    key,
    type: "ACTION" as const,
    label: "Execute Safe Recommendations",
    config: {
      actionType: "execute_recommendation",
      actionTypes: ["create_task", "update_hubspot", "create_github_issue", "post_slack_digest"],
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
              "1. A demo_quality_scorecard artifact with contentJson containing overallScore (0-100), strengths, gaps, customerSignals, nextSteps, and outcomeConfidence (low|medium|high).",
              "2. A demo_coaching_memo artifact for the rep.",
              "3. A deal_next_step_memo artifact for deal progression.",
              "4. Recommendations for HubSpot updates, CRM reminder task creation, internal follow-up tasks, Gmail draft creation, and calendar invite drafting when a next meeting was agreed.",
              "Use action types create_task, create_hubspot_task, update_hubspot, create_gmail_draft, and create_calendar_draft.",
              "Mark calendar drafting recommendations as approval-worthy when the meeting is not already confirmed.",
            ].join("\n"),
          },
          positionX: 360,
          positionY: 120,
        },
        executeApprovedRecommendationsNode("execute_demo_actions", 650, 120),
      ],
      edges: [
        { source: "trigger_demo_complete", target: "analyze_demo", priority: 0 },
        { source: "analyze_demo", target: "execute_demo_actions", priority: 0 },
      ],
    },
  },
  {
    key: "funnel-dropoff-operator",
    name: "Funnel Dropoff Operator",
    description:
      "Triage funnel dropoff alerts into diagnostics, experiment briefs, and GTM follow-up work.",
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
        executeApprovedRecommendationsNode("execute_dropoff_actions", 650, 120),
      ],
      edges: [
        { source: "trigger_funnel_dropoff", target: "triage_dropoff", priority: 0 },
        { source: "triage_dropoff", target: "execute_dropoff_actions", priority: 0 },
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
  {
    key: "arda-sales-followup-operator",
    operatorKey: "SALES_FOLLOWUP",
    name: "Arda Sales Follow-up Operator",
    description:
      "Turn post-demo meeting signals into an account brief, safe internal follow-up tasks, CRM updates, and approval-gated customer drafts.",
    providers: ["HUBSPOT", "GOOGLE_WORKSPACE", "WIPGUARD"],
    graph: {
      nodes: [
        {
          key: "trigger_sales",
          type: "TRIGGER",
          label: "Demo Completed",
          config: { provider: "hubspot", eventType: "hubspot.meeting.completed" },
          positionX: 80,
          positionY: 100,
        },
        {
          key: "analyze_followup",
          type: "ACTION",
          label: "Draft Follow-up Plan",
          config: {
            actionType: "ai_generate",
            promptVersion: "arda-sales-followup-v1",
            instructionsTemplate: [
              "You are Arda's sales follow-up operator.",
              "Review the trigger payload, source documents, and prior workflow state.",
              "Produce a durable account brief artifact and only concrete next-step recommendations.",
              "Internal workflow or CRM updates can auto-execute.",
              "Any customer-facing email draft must require approval.",
            ].join("\n"),
            inputTemplate: [
              "Generate a post-demo follow-up package for this account.",
              "",
              "Execution context:",
              "{{trigger.payload}}",
            ].join("\n"),
            tools: [
              {
                name: "create_followup_task",
                description: "Create an internal follow-up task for the account owner.",
                actionType: "create_task",
                recommendationType: "task",
                requiresApproval: false,
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    summary: { type: "string" },
                    priority: { type: "string" },
                    actionPayload: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        notes: { type: "string" },
                        priority: { type: "string" },
                        status: { type: "string" },
                        responsibleId: { type: "string" },
                      },
                    },
                  },
                  required: ["title", "summary", "actionPayload"],
                },
              },
              {
                name: "update_hubspot_next_step",
                description: "Update the HubSpot deal with a clear next step and meeting summary.",
                actionType: "update_hubspot",
                recommendationType: "crm_update",
                requiresApproval: false,
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    summary: { type: "string" },
                    actionPayload: {
                      type: "object",
                      properties: {
                        dealId: { type: "string" },
                        stage: { type: "string" },
                        noteBody: { type: "string" },
                      },
                    },
                  },
                  required: ["title", "summary", "actionPayload"],
                },
              },
              {
                name: "draft_customer_followup_email",
                description: "Prepare a customer-facing follow-up email draft for approval.",
                actionType: "create_gmail_draft",
                recommendationType: "email_draft",
                requiresApproval: true,
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    summary: { type: "string" },
                    actionPayload: {
                      type: "object",
                      properties: {
                        to: {
                          type: "array",
                          items: { type: "string" },
                        },
                        subject: { type: "string" },
                        body: { type: "string" },
                      },
                    },
                  },
                  required: ["title", "summary", "actionPayload"],
                },
              },
            ],
          },
          positionX: 360,
          positionY: 100,
        },
        executeApprovedRecommendationsNode("execute_sales_actions", 680, 100),
      ],
      edges: [
        { source: "trigger_sales", target: "analyze_followup", priority: 0 },
        { source: "analyze_followup", target: "execute_sales_actions", priority: 0 },
      ],
    },
  },
  {
    key: "arda-customer-health-operator",
    operatorKey: "CUSTOMER_HEALTH",
    name: "Arda Customer Health Operator",
    description:
      "Analyze account health events, create intervention briefs, auto-queue internal saves, and gate outreach drafts behind approval.",
    providers: ["STRIPE", "HUBSPOT", "SLACK", "WIPGUARD"],
    graph: {
      nodes: [
        {
          key: "trigger_health",
          type: "TRIGGER",
          label: "Customer Health Changed",
          config: { provider: "wipguard", eventType: "wipguard.customer.health.changed" },
          positionX: 80,
          positionY: 100,
        },
        {
          key: "analyze_health",
          type: "ACTION",
          label: "Plan Intervention",
          config: {
            actionType: "ai_generate",
            promptVersion: "arda-customer-health-v1",
            instructionsTemplate: [
              "You are Arda's customer health operator.",
              "Assess expansion risk, churn indicators, usage signals, and renewal urgency.",
              "Always produce an artifact summarizing account health and recommended interventions.",
              "Internal tasks and Slack digests may auto-execute. Customer email drafts require approval.",
            ].join("\n"),
            tools: [
              {
                name: "create_intervention_task",
                description: "Create an internal task for the account team to address a health risk.",
                actionType: "create_task",
                recommendationType: "task",
                requiresApproval: false,
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    summary: { type: "string" },
                    actionPayload: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        notes: { type: "string" },
                        priority: { type: "string" },
                        status: { type: "string" },
                      },
                    },
                  },
                  required: ["title", "summary", "actionPayload"],
                },
              },
              {
                name: "post_health_digest",
                description: "Send an internal Slack digest summarizing the health issue and next steps.",
                actionType: "post_slack_digest",
                recommendationType: "slack_digest",
                requiresApproval: false,
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    summary: { type: "string" },
                    actionPayload: {
                      type: "object",
                      properties: {
                        message: { type: "string" },
                        slackUserId: { type: "string" },
                      },
                    },
                  },
                  required: ["title", "summary", "actionPayload"],
                },
              },
              {
                name: "draft_customer_checkin",
                description: "Draft a proactive customer check-in email for approval.",
                actionType: "create_gmail_draft",
                recommendationType: "email_draft",
                requiresApproval: true,
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    summary: { type: "string" },
                    actionPayload: {
                      type: "object",
                      properties: {
                        to: { type: "array", items: { type: "string" } },
                        subject: { type: "string" },
                        body: { type: "string" },
                      },
                    },
                  },
                  required: ["title", "summary", "actionPayload"],
                },
              },
            ],
          },
          positionX: 360,
          positionY: 100,
        },
        executeApprovedRecommendationsNode("execute_health_actions", 680, 100),
      ],
      edges: [
        { source: "trigger_health", target: "analyze_health", priority: 0 },
        { source: "analyze_health", target: "execute_health_actions", priority: 0 },
      ],
    },
  },
  {
    key: "arda-gtm-scrum-operator",
    operatorKey: "GTM_SCRUM",
    name: "Arda GTM Scrum Operator",
    description:
      "Convert daily GTM signal bundles into a ranked scrum brief, internal Slack digest, backlog tasks, and board-ready follow-ups.",
    providers: ["WIPGUARD", "SLACK", "HUBSPOT"],
    graph: {
      nodes: [
        {
          key: "trigger_scrum",
          type: "TRIGGER",
          label: "Daily GTM Signal Bundle",
          config: { provider: "wipguard", eventType: "wipguard.gtm.daily_bundle" },
          positionX: 80,
          positionY: 100,
        },
        {
          key: "analyze_scrum",
          type: "ACTION",
          label: "Compile GTM Scrum Brief",
          config: {
            actionType: "ai_generate",
            promptVersion: "arda-gtm-scrum-v1",
            instructionsTemplate: [
              "You are Arda's GTM scrum operator.",
              "Synthesize cross-functional GTM changes into a short daily brief.",
              "Recommend only concrete internal actions with explicit owners and rationale.",
              "Tasks, GitHub issues, and Slack digests may auto-execute when clearly internal.",
            ].join("\n"),
            tools: [
              {
                name: "create_alignment_task",
                description: "Create a task to resolve a GTM dependency or follow-up before the next scrum.",
                actionType: "create_task",
                recommendationType: "task",
                requiresApproval: false,
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    summary: { type: "string" },
                    actionPayload: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        notes: { type: "string" },
                        priority: { type: "string" },
                        status: { type: "string" },
                      },
                    },
                  },
                  required: ["title", "summary", "actionPayload"],
                },
              },
              {
                name: "post_scrum_digest",
                description: "Publish an internal scrum digest to Slack.",
                actionType: "post_slack_digest",
                recommendationType: "slack_digest",
                requiresApproval: false,
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    summary: { type: "string" },
                    actionPayload: {
                      type: "object",
                      properties: {
                        message: { type: "string" },
                        slackUserId: { type: "string" },
                      },
                    },
                  },
                  required: ["title", "summary", "actionPayload"],
                },
              },
              {
                name: "open_gtm_issue",
                description: "Create a GitHub issue for a durable GTM or process gap.",
                actionType: "create_github_issue",
                recommendationType: "github_issue",
                requiresApproval: false,
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    summary: { type: "string" },
                    actionPayload: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        body: { type: "string" },
                        labels: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                    },
                  },
                  required: ["title", "summary", "actionPayload"],
                },
              },
            ],
          },
          positionX: 360,
          positionY: 100,
        },
        executeApprovedRecommendationsNode("execute_scrum_actions", 680, 100),
      ],
      edges: [
        { source: "trigger_scrum", target: "analyze_scrum", priority: 0 },
        { source: "analyze_scrum", target: "execute_scrum_actions", priority: 0 },
      ],
    },
  },
  {
    key: "arda-seo-growth-operator",
    operatorKey: "SEO_GROWTH",
    name: "Arda SEO Growth Operator",
    description:
      "Translate search and traffic changes into content briefs, internal growth tasks, and GitHub-ready follow-ups for execution.",
    providers: ["GOOGLE_SEARCH_CONSOLE", "GOOGLE_ANALYTICS", "SEMRUSH", "WIPGUARD"],
    graph: {
      nodes: [
        {
          key: "trigger_seo",
          type: "TRIGGER",
          label: "Weekly Search Delta",
          config: { provider: "google_search_console", eventType: "gsc.weekly.delta" },
          positionX: 80,
          positionY: 100,
        },
        {
          key: "analyze_seo",
          type: "ACTION",
          label: "Build SEO Action Plan",
          config: {
            actionType: "ai_generate",
            promptVersion: "arda-seo-growth-v1",
            instructionsTemplate: [
              "You are Arda's SEO growth operator.",
              "Look for ranking losses, opportunity pages, and content expansion themes.",
              "Produce an artifact that explains the search movement and specific next actions.",
              "Internal tasks and GitHub issues may auto-execute.",
            ].join("\n"),
            tools: [
              {
                name: "create_growth_task",
                description: "Create a task for a growth experiment or content update.",
                actionType: "create_task",
                recommendationType: "task",
                requiresApproval: false,
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    summary: { type: "string" },
                    actionPayload: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        notes: { type: "string" },
                        priority: { type: "string" },
                        status: { type: "string" },
                      },
                    },
                  },
                  required: ["title", "summary", "actionPayload"],
                },
              },
              {
                name: "open_seo_issue",
                description: "Open a GitHub issue for a durable SEO or site-structure change.",
                actionType: "create_github_issue",
                recommendationType: "github_issue",
                requiresApproval: false,
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    summary: { type: "string" },
                    actionPayload: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        body: { type: "string" },
                        labels: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                    },
                  },
                  required: ["title", "summary", "actionPayload"],
                },
              },
            ],
          },
          positionX: 360,
          positionY: 100,
        },
        executeApprovedRecommendationsNode("execute_seo_actions", 680, 100),
      ],
      edges: [
        { source: "trigger_seo", target: "analyze_seo", priority: 0 },
        { source: "analyze_seo", target: "execute_seo_actions", priority: 0 },
      ],
    },
  },
  {
    key: "arda-ads-optimizer-operator",
    operatorKey: "ADS_OPTIMIZER",
    name: "Arda Ads Optimizer Operator",
    description:
      "Review paid-channel anomalies, summarize findings, and auto-queue internal investigations while keeping external comms approval-gated.",
    providers: ["GOOGLE_ADS", "META_ADS", "GOOGLE_ANALYTICS", "WIPGUARD"],
    graph: {
      nodes: [
        {
          key: "trigger_ads",
          type: "TRIGGER",
          label: "Campaign Anomaly",
          config: { provider: "google_ads", eventType: "google_ads.campaign.anomaly" },
          positionX: 80,
          positionY: 100,
        },
        {
          key: "analyze_ads",
          type: "ACTION",
          label: "Draft Ads Investigation",
          config: {
            actionType: "ai_generate",
            promptVersion: "arda-ads-optimizer-v1",
            instructionsTemplate: [
              "You are Arda's ads optimizer operator.",
              "Explain what changed, the likely cause, and the recommended investigation path.",
              "Do not recommend spend adjustments because those are not directly executable in WIPGuard yet.",
              "Internal tasks and Slack digests may auto-execute. External stakeholder drafts require approval.",
            ].join("\n"),
            tools: [
              {
                name: "create_ads_investigation_task",
                description: "Create an internal task to investigate a paid media anomaly.",
                actionType: "create_task",
                recommendationType: "task",
                requiresApproval: false,
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    summary: { type: "string" },
                    actionPayload: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        notes: { type: "string" },
                        priority: { type: "string" },
                        status: { type: "string" },
                      },
                    },
                  },
                  required: ["title", "summary", "actionPayload"],
                },
              },
              {
                name: "post_ads_digest",
                description: "Send an internal digest describing the anomaly and recommended checks.",
                actionType: "post_slack_digest",
                recommendationType: "slack_digest",
                requiresApproval: false,
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    summary: { type: "string" },
                    actionPayload: {
                      type: "object",
                      properties: {
                        message: { type: "string" },
                        slackUserId: { type: "string" },
                      },
                    },
                  },
                  required: ["title", "summary", "actionPayload"],
                },
              },
              {
                name: "draft_ads_status_email",
                description: "Draft an external status email for approval if a customer or stakeholder needs an update.",
                actionType: "create_gmail_draft",
                recommendationType: "email_draft",
                requiresApproval: true,
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    summary: { type: "string" },
                    actionPayload: {
                      type: "object",
                      properties: {
                        to: { type: "array", items: { type: "string" } },
                        subject: { type: "string" },
                        body: { type: "string" },
                      },
                    },
                  },
                  required: ["title", "summary", "actionPayload"],
                },
              },
            ],
          },
          positionX: 360,
          positionY: 100,
        },
        executeApprovedRecommendationsNode("execute_ads_actions", 680, 100),
      ],
      edges: [
        { source: "trigger_ads", target: "analyze_ads", priority: 0 },
        { source: "analyze_ads", target: "execute_ads_actions", priority: 0 },
      ],
    },
  },
  {
    key: "arda-roadmap-intelligence-operator",
    operatorKey: "ROADMAP_INTELLIGENCE",
    name: "Arda Roadmap Intelligence Operator",
    description:
      "Synthesize product signals into a roadmap memo, GitHub-ready opportunities, and internal follow-up tasks without losing auditability.",
    providers: ["HUBSPOT", "SLACK", "WIPGUARD"],
    graph: {
      nodes: [
        {
          key: "trigger_roadmap",
          type: "TRIGGER",
          label: "Product Signal Bundle",
          config: { provider: "wipguard", eventType: "wipguard.product.signal.bundle" },
          positionX: 80,
          positionY: 100,
        },
        {
          key: "analyze_roadmap",
          type: "ACTION",
          label: "Generate Roadmap Brief",
          config: {
            actionType: "ai_generate",
            promptVersion: "arda-roadmap-intelligence-v1",
            instructionsTemplate: [
              "You are Arda's roadmap intelligence operator.",
              "Synthesize sales, support, and product signals into a roadmap-ready brief.",
              "Recommend internal issues or tasks when the evidence is strong and recurring.",
              "Customer-facing follow-up drafts require approval.",
            ].join("\n"),
            tools: [
              {
                name: "create_product_issue",
                description: "Create a GitHub issue capturing a validated roadmap opportunity.",
                actionType: "create_github_issue",
                recommendationType: "github_issue",
                requiresApproval: false,
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    summary: { type: "string" },
                    actionPayload: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        body: { type: "string" },
                        labels: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                    },
                  },
                  required: ["title", "summary", "actionPayload"],
                },
              },
              {
                name: "create_product_followup_task",
                description: "Create an internal task to collect more evidence or align stakeholders.",
                actionType: "create_task",
                recommendationType: "task",
                requiresApproval: false,
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    summary: { type: "string" },
                    actionPayload: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        notes: { type: "string" },
                        priority: { type: "string" },
                        status: { type: "string" },
                      },
                    },
                  },
                  required: ["title", "summary", "actionPayload"],
                },
              },
              {
                name: "draft_customer_response",
                description: "Draft a customer-facing response summarizing how the request is being handled.",
                actionType: "create_gmail_draft",
                recommendationType: "email_draft",
                requiresApproval: true,
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    summary: { type: "string" },
                    actionPayload: {
                      type: "object",
                      properties: {
                        to: { type: "array", items: { type: "string" } },
                        subject: { type: "string" },
                        body: { type: "string" },
                      },
                    },
                  },
                  required: ["title", "summary", "actionPayload"],
                },
              },
            ],
          },
          positionX: 360,
          positionY: 100,
        },
        executeApprovedRecommendationsNode("execute_roadmap_actions", 680, 100),
      ],
      edges: [
        { source: "trigger_roadmap", target: "analyze_roadmap", priority: 0 },
        { source: "analyze_roadmap", target: "execute_roadmap_actions", priority: 0 },
      ],
    },
  },
];
