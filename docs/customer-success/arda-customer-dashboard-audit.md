# Arda Customer Dashboard Audit for WIPGuard Customer Success

Audited live deployment: 2026-03-07

Legacy app under review: [arda-customer-dashboard.vercel.app](https://arda-customer-dashboard.vercel.app/)

This document turns the legacy Arda customer dashboard into a repo-grounded specification for WIPGuard's Customer Success section. It is not a UI port plan. It is a route-by-route audit, a failure analysis, and an implementation blueprint for a WIPGuard-native customer success surface.

## Decision Summary

- Reuse concepts, workflows, and page structure from the legacy app.
- Do not reuse Arda-specific visuals, terminology, browser auth, or client-side persistence patterns.
- Build customer success in two phases:
  1. Portfolio cockpit at `/analytics/customer-success`
  2. Account workspace at `/analytics/customer-success/accounts/[accountId]`
- Keep `/api/analytics?section=customer-success` as a summary feed. Do not turn it into the account workspace payload.
- Add dedicated internal APIs for customer success data assembly:
  - `GET /api/customer-success/portfolio`
  - `GET /api/customer-success/accounts/[accountId]`
  - `GET /api/customer-success/alerts`
  - `GET /api/customer-success/activity`

## Resolved Product Decisions

These decisions were confirmed after the initial audit.

- The canonical customer-success account identifier should be a WIPGuard-owned merged customer record.
- Customer success notes, plans, alerts, and outreach history should persist in dedicated customer-success tables, not in `Task.notes`, `Deal.notes`, or ad hoc metadata blobs.
- WIPGuard should send outbound customer-success messages in-product.
- Existing `Task`, `LogbookEntry`, `DealCompany`, `DealContact`, `Deal`, `DealMeeting`, and `OutboxEvent` models should be reused as inputs and linked records, not replaced.

## Current WIPGuard Baseline

WIPGuard already has a Customer Success entry inside Analytics, but it is a provider-and-ops summary, not an account-centric workspace.

Relevant code paths:

- `src/components/analytics/customer-success-tab.tsx`
- `src/app/api/analytics/route.ts`
- `src/lib/analytics/section-registry.ts`
- `docs/dashboard-walkthrough.md`

Current behavior of `/analytics/customer-success`:

- Renders support KPI cards from Pylon.
- Renders product adoption and throughput panels from the analytics pipeline.
- Renders integration delivery status for Google Workspace, Slack, and Coda.
- Derives a short list of recommended actions from thresholds.
- Does not expose:
  - account-level health rollups,
  - attention queues,
  - customer drill-through,
  - alert workflow,
  - account 360 tabs,
  - success plans,
  - outreach templates/history.

Implication: WIPGuard already has some data sources needed for customer success, but the current surface is too monolithic and too provider-centric to absorb the Arda concepts directly.

## Audit Inputs

The audit is grounded in three sources:

1. Live route inspection of the deployed Arda dashboard on 2026-03-07.
2. Live API probes against the deployed app's `/api/cs/*` and `/api/v1/*` surfaces.
3. Public source maps from the deployed bundle, including:
   - `assets/index-DMvgcK_2.js.map`
   - `assets/forecasting-kYPw2rQ2.js.map`
   - `assets/InsightsDashboard-B_B-m0Qt.js.map`
   - `assets/Account360-CMgZhRDs.js.map`
   - `assets/ChartsSection-zxL5ZJJ-.js.map`

## Validated Live API Surfaces

The deployed app still exposes enough of its newer customer-success API to confirm which parts of the product were successfully replatformed and which parts were left on the legacy path.

Validated on 2026-03-07:

- `GET /api/cs/accounts/:id`
  - working
  - sample responses returned complete account detail objects, health grades, lifecycle stage, alerts, and timeline data
- `GET /api/cs/alerts`
  - working
  - observed 11 open alerts in the live dataset, mostly opportunity alerts with a smaller risk slice
- `GET /api/cs/activity?mode=aggregate&days=30`
  - working
  - returned chart-friendly activity buckets and top-customer rollups
- `GET /api/cs/activity?mode=events&limit=5`
  - working
  - returned feed-style event rows
- `GET /api/cs/portfolio`
  - implemented but protected
  - when called with the app's bundled header pattern, it returned a 15-account portfolio with an average health score of 71
- `GET /api/ping`
  - working

Legacy raw entity path:

- `POST /api/v1/tenant/tenant/query`
  - failing in the deployed app
- `POST /api/v1/user-account/user-account/query`
  - failing in the deployed app

Takeaway:

- The newer `/api/cs/*` layer is the real product direction.
- The broken pages are broken because they never fully moved onto that layer.

## Route-by-Route Audit

### `/` Customers

Status: Broken

What the route was designed to be:

- A top-level customer portfolio dashboard rendered by `src/App.tsx`
- Summary metrics grid
- Alert section
- Customer table
- Charts section

Charts and sections confirmed from source maps:

- Onboarding Funnel
- Activity by Customer
- Stage Distribution
- Health Distribution

Observed live behavior:

- UI shows `Failed to load customer data. Please try again.`

Reuse value:

- Medium for layout ideas
- Low for implementation approach

Recommendation:

- Do not port this screen as-is.
- Replace it with a WIPGuard-native portfolio cockpit inside `/analytics/customer-success`.

### `/insights`

Status: Broken

What the route was designed to be:

- Portfolio-level insights dashboard rendered by `src/components/InsightsDashboard.tsx`
- Views for overview, forecast, and accounts
- Portfolio health summary
- Total ARR
- At-risk ARR
- Expansion pipeline
- Average health
- Active insights
- Health distribution
- 6-month forecast
- Needs-attention account list

Observed live behavior:

- UI shows `Failed to load portfolio data for insights.`

Insights engine concepts confirmed from source maps:

- Insight types: `trend`, `anomaly`, `prediction`, `recommendation`, `benchmark`
- Categories: `usage`, `health`, `commercial`, `engagement`, `risk`

Forecasting concepts confirmed from source maps:

- Churn model factors:
  - health score: 25%
  - health trend: 15%
  - days since activity: 20%
  - support issues: 15%
  - payment status: 15%
  - feature adoption: 10%

Reuse value:

- High for metric categories and forecast framing
- Low for direct implementation

Recommendation:

- Absorb the portfolio summary and "needs attention" concepts into WIPGuard's customer success portfolio page.
- Treat forecasting as a later extension after the core account workspace exists.

### `/alerts`

Status: Working

What exists:

- Alert inbox with severity, category, and status rollups
- Search
- Filters
- Sort by urgency / ARR-at-risk style priorities
- Expandable alert detail
- Direct customer links

Observed live signals:

- Alerts API was working.
- The live dataset was dominated by opportunity alerts, with a smaller risk slice.

Reuse value:

- Very high

Recommendation:

- This is one of the strongest concepts to port.
- Rebuild it on WIPGuard persistence and WIPGuard identifiers.
- Preserve the inbox model, filtering model, severity model, and drill-through behavior.

### `/activity`

Status: Working

What exists:

- Activity overview with 7d / 30d / 90d range switch
- Platform activity chart
- Activity-by-customer table
- Trend displays

Observed live signals:

- Aggregate activity endpoint worked.
- Event mode also worked.

Reuse value:

- High

Recommendation:

- Keep the "activity by account" concept for the WIPGuard portfolio page.
- Translate manufacturing activity into WIPGuard-native work, support, and customer-touch events.

### `/feed`

Status: Working

What exists:

- Live feed
- Refresh controls
- Filter drawer
- Daily comparison stats
- Expandable event rows
- Quick jump into the linked account

Reuse value:

- Medium to high

Recommendation:

- Fold the feed concept into `GET /api/customer-success/activity` and the account timeline.
- Do not preserve the exact standalone screen unless WIPGuard later needs a dedicated live operations view.

### `/status`

Status: Working

What exists:

- API base
- API key / auth header diagnostics
- Health probe
- API probe utility

Reuse value:

- Low for end users
- Medium for internal debugging

Recommendation:

- Do not ship this as part of customer success.
- Keep the idea as an internal runbook/debug surface only if CS APIs become complex enough to justify it.

### `/account/:tenantId`

Status: Working

What exists:

- Full Account 360 workspace
- Strongest artifact in the legacy app
- Tabs confirmed from source maps and live inspection:
  - Overview
  - Health Details
  - Commercial
  - Timeline
  - Stakeholders
  - Tasks
  - Success Plan
  - Outreach

Other confirmed concepts:

- AI insights widget
- Recommended actions
- Commercial panel
- Stakeholder coverage analysis
- Success plan templates
- Outreach templates and history

Template categories confirmed from source maps:

- Outreach:
  - onboarding
  - check_in
  - at_risk
  - expansion
  - renewal
  - reactivation
- Success plans:
  - Standard Onboarding
  - Enterprise Onboarding
  - Adoption Acceleration
  - Renewal Success
  - At-Risk Recovery

Reuse value:

- Extremely high

Recommendation:

- Use this route as the structural reference for WIPGuard's account-level customer success workspace.
- Translate every tab into WIPGuard-native entities and language.

## Why the Legacy Customers and Insights Routes Break

The failure is not random. It is caused by a production build that still executes the legacy browser-side data path.

### Root cause

The deployed bundle exposes an environment object with:

- `MODE: "production"`
- `DEV: true`
- `PROD: false`

Source maps show the legacy data layer relies on `import.meta.env.PROD` to decide whether to use the newer `/api/cs/*` path or the older browser-side raw entity path.

That is the wrong seam to copy into WIPGuard.

Observed legacy behavior:

- The root dashboard still executes legacy client queries from `src/lib/arda-client.ts`.
- Those legacy queries hit raw entity endpoints such as:
  - `/api/v1/tenant/tenant/query`
  - `/api/v1/user-account/user-account/query`
- Those raw queries fail in the deployed app.
- Meanwhile, the newer customer success APIs exist and work:
  - `/api/cs/accounts/:id`
  - `/api/cs/alerts`
  - `/api/cs/activity`
  - `/api/cs/portfolio` exists but is guarded and not wired correctly into the broken routes

Why account detail still works:

- The Account 360 hook attempts the newer CS API first and has a fallback path.
- The broken top-level routes remain tied to the older legacy portfolio fetch path.

Implementation lesson for WIPGuard:

- Do not branch runtime data source selection on fragile build-time env flags.
- Do not let the browser decide between raw source queries and normalized internal APIs.
- Normalize once on the server, then render from stable internal view models.

## Legacy Concepts Worth Reusing

Highest value concepts to carry into WIPGuard:

- Account-centered customer success, not provider-centered customer success
- Alert inbox with severity, category, SLA state, and account drill-through
- Portfolio attention queue
- Activity-by-account rollup
- Account 360 tab model
- Stakeholder coverage analysis
- Recommended next actions
- Success plan templates
- Outreach template library and history

Concepts to discard:

- Arda-specific visual language and copy
- Manufacturing-specific metrics like `items`, `kanban cards`, and `orders` as first-class product language
- Browser-side raw `/api/v1/*` queries
- localStorage notes/tasks/overrides
- Supabase-only persistence assumptions
- Publicly embedded auth-header patterns

## WIPGuard-Native Domain Layer

The customer success layer should be explicit and stable. It should not be inferred from the generic analytics payload.

Suggested core types:

```ts
export interface CustomerSuccessHealthComponent {
  score: number;
  weight: number;
  weightedScore: number;
  trend: "improving" | "stable" | "declining";
  status: "healthy" | "watch" | "risk";
  evidence: string[];
  lastUpdatedAt: string;
}

export interface CustomerSuccessHealth {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  trend: "improving" | "stable" | "declining";
  confidence: number;
  updatedAt: string;
  components: {
    adoption: CustomerSuccessHealthComponent;
    engagement: CustomerSuccessHealthComponent;
    relationship: CustomerSuccessHealthComponent;
    support: CustomerSuccessHealthComponent;
    commercial: CustomerSuccessHealthComponent;
  };
}

export interface CustomerSuccessAlert {
  id: string;
  accountId: string;
  title: string;
  category: "risk" | "opportunity" | "action_required";
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "dismissed";
  slaStatus: "none" | "on_track" | "at_risk" | "breached";
  source: "health" | "support" | "commercial" | "relationship" | "workflow";
  evidence: string[];
  suggestedAction?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerSuccessEvent {
  id: string;
  accountId: string;
  type:
    | "support"
    | "product"
    | "workflow"
    | "commercial"
    | "relationship"
    | "lifecycle";
  title: string;
  description?: string;
  actorName?: string;
  occurredAt: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface CustomerSuccessPortfolio {
  generatedAt: string;
  summary: {
    totalAccounts: number;
    avgHealthScore: number;
    atRiskAccounts: number;
    openAlerts: number;
  };
  healthDistribution: Array<{ label: "A" | "B" | "C" | "D" | "F"; count: number }>;
  attentionAccounts: Array<{
    accountId: string;
    name: string;
    ownerName?: string;
    health: CustomerSuccessHealth;
    openAlertCount: number;
    lifecycleStage: string;
    nextAction?: string;
  }>;
  alerts: CustomerSuccessAlert[];
  recentActivity: CustomerSuccessEvent[];
  accounts: Array<{
    accountId: string;
    name: string;
    segment?: string;
    tier?: string;
    ownerName?: string;
    health: CustomerSuccessHealth;
    lastActivityAt?: string;
    activeUsers30d?: number;
    renewalDate?: string;
    openAlertCount: number;
  }>;
}

export interface CustomerSuccessAccountDetail {
  accountId: string;
  name: string;
  segment?: string;
  tier?: string;
  lifecycleStage: string;
  ownerName?: string;
  health: CustomerSuccessHealth;
  alerts: CustomerSuccessAlert[];
  timeline: CustomerSuccessEvent[];
  stakeholders: Array<{
    id: string;
    name: string;
    email?: string;
    role: string;
    coverageStatus?: "covered" | "missing" | "stale";
    lastTouchAt?: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    dueDate?: string;
    priority?: string;
  }>;
  successPlan: {
    templateKey?: string;
    milestones: Array<{
      id: string;
      title: string;
      status: string;
      dueDate?: string;
    }>;
  };
  outreach: {
    recommendedTemplates: string[];
    recentMessages: Array<{
      id: string;
      subject: string;
      sentAt?: string;
      status: string;
    }>;
  };
  commercial?: {
    arr?: number;
    renewalDate?: string;
    paymentStatus?: string;
    expansionPotential?: string;
  };
}
```

## Persistence Recommendation

WIPGuard already has useful primitives in Prisma:

- `Organization` for tenant scoping
- `Task` for execution and ownership
- `LogbookEntry` for historical completion records
- `DealCompany`, `DealContact`, `Deal`, and `DealMeeting` for CRM context
- `OutboxEvent` for reliable dispatch

That is enough to avoid creating a second workflow system, but it is not enough to make customer success state explicit. The recommended approach is to add a customer-success aggregate rooted in a merged customer record.

### Canonical root: `CustomerRecord`

Recommendation:

- Add a new org-scoped `CustomerRecord` model.
- Make `CustomerRecord.id` the canonical `accountId` used across `/api/customer-success/*`.
- Use it to merge multiple external representations of the same customer into one WIPGuard record.

Suggested responsibilities:

- stable account identity
- owner assignment
- segment and tier
- lifecycle stage
- link to primary CRM company/deal context
- link to external system identifiers

Suggested fields:

- `id`
- `organizationId`
- `name`
- `ownerId`
- `segment`
- `tier`
- `lifecycleStage`
- `status`
- `dealCompanyId` nullable
- `primaryDealId` nullable
- `createdAt`
- `updatedAt`

### External identity mapping

Do not treat HubSpot company ID, Stripe customer ID, Pylon account ID, or tenant ID as the canonical key.

Recommendation:

- Add `CustomerRecordExternalRef` rows under `CustomerRecord`.
- Use one row per provider/id pair.

Suggested fields:

- `customerRecordId`
- `provider`
- `externalId`
- `label` nullable
- `isPrimary`
- `metadata`

This cleanly handles:

- multiple tenant IDs rolling up to one customer
- one company with several product workspaces
- future provider additions without schema churn

### Where customer success notes should persist

Recommendation:

- Add a dedicated `CustomerSuccessNote` model linked to `CustomerRecord`.
- Do not overload `Task.notes` or `Deal.notes`.

Reasoning:

- task notes describe execution work
- deal notes describe pipeline state
- customer-success notes capture relationship context, risk context, meeting takeaways, and account strategy

Suggested fields:

- `id`
- `customerRecordId`
- `authorUserId`
- `title` nullable
- `body`
- `source` such as `manual`, `meeting`, `support`, `crm`, `ai`
- `visibility`
- `createdAt`
- `updatedAt`

### Where success plans and milestones should persist

Recommendation:

- Add `CustomerSuccessPlan` and `CustomerSuccessPlanMilestone` as first-class models under `CustomerRecord`.
- Keep tasks as execution items that may be linked to milestones, not as the milestones themselves.

Reasoning:

- milestones need durable status even when there is no single task driving them
- plans need template identity and health context
- milestones should survive task completion, deletion, or replanning

Suggested `CustomerSuccessPlan` fields:

- `id`
- `customerRecordId`
- `templateKey`
- `name`
- `status`
- `ownerUserId`
- `startedAt`
- `targetDate`
- `completedAt`
- `createdAt`
- `updatedAt`

Suggested `CustomerSuccessPlanMilestone` fields:

- `id`
- `planId`
- `title`
- `description`
- `status`
- `dueDate`
- `completedAt`
- `linkedTaskId` nullable
- `sortOrder`

### Where alerts should persist

Recommendation:

- Persist alerts in a `CustomerSuccessAlertRecord` table keyed to `CustomerRecord`.
- Generate candidate alerts from current signals, then upsert/resolve them into persisted records so ownership, status, and history survive refreshes.

Suggested fields:

- `id`
- `customerRecordId`
- `alertKey`
- `title`
- `category`
- `severity`
- `status`
- `slaStatus`
- `evidence`
- `suggestedAction`
- `ownerUserId` nullable
- `openedAt`
- `resolvedAt` nullable
- `updatedAt`

### How existing models should be reused

Recommendation:

- Keep `Task` as the action engine.
- Link tasks to customer-success context with a nullable `customerRecordId` foreign key instead of burying that link in `metadata`.
- Derive stakeholder lists from `DealContact` plus HubSpot sync.
- Derive relationship timeline entries from `DealMeeting`, notes, support events, and outbound outreach logs.
- Continue using `LogbookEntry` as the completed-work archive for customer-success tasks.

Minimum schema links to add:

- nullable `customerRecordId` on `Task`
- nullable `customerRecordId` on `DealMeeting`
- optional relation from `CustomerRecord` to `DealCompany`
- optional relation from `CustomerRecord` to a primary `Deal`

## Write API Requirements

The original plan only listed read endpoints. That is not sufficient once notes, plans, alert workflow, and outbound outreach are first-class.

Required write endpoints:

- `POST /api/customer-success/accounts/[accountId]/notes`
- `POST /api/customer-success/accounts/[accountId]/alerts/[alertId]/status`
- `POST /api/customer-success/accounts/[accountId]/tasks`
- `POST /api/customer-success/accounts/[accountId]/success-plan`
- `POST /api/customer-success/accounts/[accountId]/outreach/send`
- `POST /api/customer-success/accounts/[accountId]/outreach/drafts`

## Internal API Blueprint

### `GET /api/customer-success/portfolio`

Purpose:

- Power the main portfolio cockpit at `/analytics/customer-success`

Should include:

- Summary cards
- Health distribution
- Attention queue
- Account table rows
- Alert rollup
- Recent activity slice

Should not include:

- Full timeline history
- Full stakeholder detail
- Full outreach history
- Full success plan detail

### `GET /api/customer-success/accounts/[accountId]`

Purpose:

- Power the account workspace route

Should include:

- Header summary
- Full health breakdown
- Alerts
- Timeline
- Commercial state
- Stakeholders
- Tasks
- Success plan
- Outreach history and recommendations

### `GET /api/customer-success/alerts`

Purpose:

- Back the alert inbox and alert counts on the portfolio page

Should include:

- Filterable alert list
- Severity/category/status/SLA counts
- Account identity needed for drill-through

### `GET /api/customer-success/activity`

Purpose:

- Feed the portfolio activity chart, recent feed, and account timeline slices

Should support:

- aggregate mode for charts
- event mode for feed/timeline rows
- date range filtering
- account filtering

## Signal Translation: Legacy Health Model to WIPGuard Health Model

The legacy app used a manufacturing-flavored activity model. WIPGuard should translate those signals into customer-success language immediately.

| Health component | WIPGuard signal family | Primary sources |
|---|---|---|
| Adoption | Product usage, Coda/task completion, feature completion, workflow completion | internal tasks/projects, Coda, product telemetry |
| Engagement | Recency, active collaborators, Slack/Workspace/workflow activity | Slack, Google Workspace, internal activity, logbook |
| Relationship | Contact coverage, owner/champion presence, recent CS touches | HubSpot contacts/companies, meetings, notes, communication history |
| Support | Backlog, urgency, SLA pressure, escalations | Pylon, support-linked tasks, escalation markers |
| Commercial | Renewal, payment, expansion, ARR movement | Stripe, HubSpot, deal/revenue objects |

Recommended behavior:

- Keep the five components explicit in the UI and API.
- Publish the final score and grade, but always preserve component-level evidence.
- Treat missing providers as reduced confidence, not as automatic failure.

## Operational Module Translation

### Alerts

Legacy concept:

- Alert inbox with severity, category, status, and recommended action

WIPGuard implementation:

- Persist alerts in WIPGuard data storage.
- Link alerts to accounts, tasks, and timeline entries.
- Allow status transitions like `open -> in_progress -> resolved`.

### Playbooks and recommended actions

Legacy concept:

- Recommended actions and playbook-style responses

WIPGuard implementation:

- Convert playbook actions into first-class WIPGuard tasks.
- Allow tasks to be created from alerts or account detail context.

### Timeline

Legacy concept:

- Product events, commercial events, and account activity in one place

WIPGuard implementation:

- Merge logbook entries, tasks, support events, lifecycle changes, meeting/contact activity, and commercial milestones into one timeline.

### Success Plan

Legacy concept:

- Template-driven plans for onboarding, adoption, renewal, and recovery

WIPGuard implementation:

- Persist plans and milestones in WIPGuard.
- Seed from the legacy template taxonomy:
  - onboarding
  - adoption
  - renewal
  - recovery

### Outreach

Legacy concept:

- Outreach templates and history scoped to account state

WIPGuard implementation:

- Store template recommendations and message history against the account.
- Seed template categories from the legacy app:
  - onboarding
  - check-in
  - at-risk
  - expansion
  - renewal
  - reactivation
- Send outbound messages through WIPGuard rather than treating outreach as read-only history.
- Record outbound state transitions like `draft -> queued -> sent -> failed`.
- Persist provider message IDs, send timestamps, and failure reasons.
- Dispatch message sends through the existing outbox so retries and delivery telemetry use the current platform model.

Recommended outbound channels for V1:

- email via Google Workspace
- Slack direct message or channel thread reply where appropriate

Required platform changes:

- extend Google Workspace scopes beyond read-only to include `https://www.googleapis.com/auth/gmail.send`
- extend the outbox dispatcher beyond `automation.slack.notify` to handle customer-success outreach events
- add a dedicated outreach message store so the account workspace can show drafts, queued sends, sent history, and failures

## Phased Product Plan

### Phase 1: Portfolio cockpit

Target route:

- `/analytics/customer-success`

Goal:

- Replace the current provider summary with an account-centered CS cockpit

Must include:

- Health distribution
- Attention queue
- Alert summary and alert inbox entry point
- Activity-by-account summary
- Account table with drill-through
- Short recent activity feed

Can reuse from current WIPGuard page:

- Existing analytics framing and range controls where useful
- Existing provider fetchers as inputs, not as the final UI model

### Phase 2: Account workspace

Target route:

- `/analytics/customer-success/accounts/[accountId]`

Goal:

- Add the full customer success workspace modeled on the legacy Account 360 structure

Tabs to ship:

- Overview
- Health Details
- Commercial
- Timeline
- Stakeholders
- Tasks
- Success Plan
- Outreach

Priority order inside the route:

1. Overview
2. Health Details
3. Timeline
4. Tasks
5. Stakeholders
6. Commercial
7. Success Plan
8. Outreach

## Suggested WIPGuard File Layout

This document does not implement the code, but it does define the shape of the implementation.

Suggested additions:

- `prisma/schema.prisma` customer-success models and relations
- `src/lib/customer-success/types.ts`
- `src/lib/customer-success/customer-record.ts`
- `src/lib/customer-success/health.ts`
- `src/lib/customer-success/portfolio.ts`
- `src/lib/customer-success/account-detail.ts`
- `src/lib/customer-success/alerts.ts`
- `src/lib/customer-success/activity.ts`
- `src/lib/customer-success/outreach.ts`
- `src/lib/customer-success/notes.ts`
- `src/lib/customer-success/success-plan.ts`
- `src/lib/integrations/google-gmail-send.ts`
- `src/app/api/customer-success/portfolio/route.ts`
- `src/app/api/customer-success/accounts/[accountId]/route.ts`
- `src/app/api/customer-success/alerts/route.ts`
- `src/app/api/customer-success/activity/route.ts`
- `src/app/api/customer-success/accounts/[accountId]/notes/route.ts`
- `src/app/api/customer-success/accounts/[accountId]/outreach/send/route.ts`
- `src/components/customer-success/portfolio/*`
- `src/components/customer-success/account/*`
- `src/app/(dashboard)/analytics/customer-success/accounts/[accountId]/page.tsx`

Suggested refactor boundary:

- Keep `src/app/api/analytics/route.ts` focused on analytics summary sections.
- Move customer-success normalization into `src/lib/customer-success/*`.
- Let the analytics summary page call the portfolio endpoint or a thin shared builder, not the reverse.

## Test Plan

### Fixture coverage

Create at least four fixtures:

1. Stalled onboarding account
2. Healthy active account
3. Expansion-ready account
4. Partial-data account with missing providers

### Assertions

Portfolio:

- Health distribution renders correctly.
- Attention queue ranks at-risk accounts above healthy accounts.
- Alert counts, severity counts, and SLA counts are correct.
- Account rows drill into the account workspace route.

Health model:

- The final health score is composed from the five WIPGuard components.
- Grade mapping is deterministic.
- Missing providers reduce confidence but do not crash the score builder.

Alerts:

- Alert generation uses WIPGuard data only.
- Filtering by severity/category/status works.
- SLA ordering is stable.

Account workspace:

- Every tab renders without breaking when commercial, HubSpot, or Pylon data is missing.
- Timeline merges events from multiple sources in descending time order.
- Success plan and outreach sections tolerate empty-state accounts.

Outbound messaging:

- Sending an outreach message creates a persisted outreach record before dispatch.
- Email and Slack sends queue outbox events rather than performing fragile inline dispatch from the request handler.
- Success updates provider message IDs and timestamps on the outreach record.
- Failed sends remain visible in the account workspace with retryable status.

Architecture:

- No customer-success route depends on raw Arda-style browser queries.
- No customer-success route depends on env-flag branching to decide between legacy and new data paths.

## Non-Goals

- Porting the old Arda visuals or copy
- Porting raw `/api/v1/*` browser calls
- Porting embedded auth-header patterns
- Porting localStorage notes/tasks/overrides
- Porting Supabase-specific persistence as the customer success storage model
- Preserving manufacturing-specific metrics as WIPGuard product language

## Final Architecture Call

The right implementation is:

- a new `CustomerRecord` aggregate as the canonical CS account ID,
- dedicated customer-success persistence for notes, plans, alerts, and outreach,
- existing `Task`, `Deal*`, and `LogbookEntry` models reused as linked operational records,
- and outbound outreach sent through the existing outbox infrastructure.

## Final Recommendation

The legacy Arda dashboard should be treated as a pattern library for customer success operations, not as a codebase to port.

The best assets are:

- the alert workflow,
- the attention queue,
- the activity framing,
- and especially the Account 360 workspace.

The broken top-level routes are useful mainly as a warning: customer-success pages should render from server-built, WIPGuard-native view models, never from fragile client-side source switching.
