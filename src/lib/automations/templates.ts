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
      actionTypes: ["update_hubspot", "create_github_issue", "post_slack_digest"],
    },
    positionX,
    positionY,
  };
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
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
              "4. Recommendations for HubSpot updates, CRM notes, internal alerts, Gmail draft creation, and calendar invite drafting when a next meeting was agreed.",
              "Use action types update_hubspot, create_gmail_draft, and create_calendar_draft.",
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
    providers: ["IMLADRIS", "GOOGLE_ANALYTICS", "WEBFLOW", "GOOGLE_ADS", "META_ADS", "REDDIT"],
    graph: {
      nodes: [
        {
          key: "trigger_funnel_dropoff",
          type: "TRIGGER",
          label: "Funnel Dropoff Detected",
          config: {
            provider: "imladris",
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
              "Recommendations should favor create_github_issue and post_slack_digest for internal follow-up.",
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
    key: "arda-sales-followup-operator",
    operatorKey: "SALES_FOLLOWUP",
    name: "Arda Sales Follow-up Operator",
    description:
      "Turn post-demo meeting signals into an account brief, CRM updates, internal alerts, and approval-gated customer drafts.",
    providers: ["HUBSPOT", "GOOGLE_WORKSPACE", "IMLADRIS"],
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
                name: "post_followup_digest",
                description: "Post an internal follow-up summary for the account owner.",
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
    providers: ["STRIPE", "HUBSPOT", "SLACK", "IMLADRIS"],
    graph: {
      nodes: [
        {
          key: "trigger_health",
          type: "TRIGGER",
          label: "Customer Health Changed",
          config: { provider: "imladris", eventType: "imladris.customer.health.changed" },
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
              "Internal Slack digests may auto-execute. Customer email drafts require approval.",
            ].join("\n"),
            tools: [
              {
                name: "post_health_alert",
                description: "Post an internal alert for the account team to address a health risk.",
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
    key: "arda-gtm-brief-operator",
    operatorKey: "GTM_SCRUM",
    name: "Arda GTM Brief Operator",
    description:
      "Convert daily GTM signal bundles into a ranked brief, internal Slack digest, and GitHub-ready follow-ups.",
    providers: ["IMLADRIS", "SLACK", "HUBSPOT"],
    graph: {
      nodes: [
        {
          key: "trigger_gtm_brief",
          type: "TRIGGER",
          label: "Daily GTM Signal Bundle",
          config: { provider: "imladris", eventType: "imladris.gtm.daily_bundle" },
          positionX: 80,
          positionY: 100,
        },
        {
          key: "analyze_gtm_brief",
          type: "ACTION",
          label: "Compile GTM Brief",
          config: {
            actionType: "ai_generate",
            promptVersion: "arda-gtm-brief-v1",
            instructionsTemplate: [
              "You are Arda's GTM brief operator.",
              "Synthesize cross-functional GTM changes into a short daily brief.",
              "Recommend only concrete internal actions with explicit owners and rationale.",
              "GitHub issues and Slack digests may auto-execute when clearly internal.",
            ].join("\n"),
            tools: [
              {
                name: "post_gtm_digest",
                description: "Publish an internal GTM digest to Slack.",
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
        executeApprovedRecommendationsNode("execute_gtm_actions", 680, 100),
      ],
      edges: [
        { source: "trigger_gtm_brief", target: "analyze_gtm_brief", priority: 0 },
        { source: "analyze_gtm_brief", target: "execute_gtm_actions", priority: 0 },
      ],
    },
  },
  {
    key: "arda-seo-growth-operator",
    operatorKey: "SEO_GROWTH",
    name: "Arda SEO Growth Operator",
    description:
      "Translate search and traffic changes into content briefs and GitHub-ready follow-ups for execution.",
    providers: ["GOOGLE_SEARCH_CONSOLE", "GOOGLE_ANALYTICS", "SEMRUSH", "IMLADRIS"],
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
              "Internal GitHub issues may auto-execute.",
            ].join("\n"),
            tools: [
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
    providers: ["GOOGLE_ADS", "META_ADS", "GOOGLE_ANALYTICS", "IMLADRIS"],
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
              "Do not recommend spend adjustments unless they remain recommendation-only and approval-gated.",
              "Internal Slack digests may auto-execute. External stakeholder drafts require approval.",
            ].join("\n"),
            tools: [
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
      "Synthesize product signals into a roadmap memo, GitHub-ready opportunities, and internal recommendations without losing auditability.",
    providers: ["HUBSPOT", "SLACK", "IMLADRIS"],
    graph: {
      nodes: [
        {
          key: "trigger_roadmap",
          type: "TRIGGER",
          label: "Product Signal Bundle",
          config: { provider: "imladris", eventType: "imladris.product.signal.bundle" },
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
              "Recommend internal GitHub issues when the evidence is strong and recurring.",
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
