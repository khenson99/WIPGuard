WIPGuard
Standalone GTM Workflow Automation Platform

Product Requirements Document
Version 1.0  |  February 2026

Arda Cards, Inc.
Prepared for internal product planning

# Executive Summary
WIPGuard is Arda Cards' internal Kanban task management system, currently implemented as a Coda prototype, that enforces work-in-progress limits for the company's 5-person go-to-market team. This PRD defines the requirements for rebuilding WIPGuard as a standalone web application purpose-built for B2B SaaS GTM teams.
The product's unique positioning lies at the intersection of three capabilities no existing tool combines: WIP-limited Kanban methodology, GTM-specific workflows (sales, marketing, customer success, RevOps), and automatic record-keeping through deep integration with HubSpot, Google Calendar, Gmail, and Slack. The meta-narrative is powerful: Arda Cards sells manufacturing Kanban to factories, and WIPGuard applies that same discipline to their own revenue motion.
The current Coda prototype validates the core workflow but surfaces significant friction: drag-and-drop failures, missing views, column ordering issues, and the gap between WIP awareness and WIP enforcement. A standalone product will resolve these usability issues while unlocking event-driven integrations that make record-keeping an invisible byproduct of doing the work.

# Problem Statement
## The Problem
Small B2B SaaS GTM teams (5–25 people) are chronically overcommitted. They say yes to too many initiatives without realizing what they displace, resulting in work that is started but never finished, customers who are promised deliverables that slip, and team members who feel perpetually behind. The root cause is a lack of WIP visibility: there is no system that makes the cost of adding new work visually and structurally apparent.
As Uriel Eisen (co-founder, Arda Cards) captured it: "Just minimizing how many things we're actively putting work into and making sure ideally that they get over the line as soon as possible so they can start benefiting everyone."
## Who Experiences This
Every member of a startup GTM team: the CEO juggling fundraising and customer demos, the marketer balancing conference prep with content calendars, the sales rep torn between onboarding existing customers and chasing new ones, and the ops lead trying to keep everyone aligned. At Arda, this is a 5-person core team generating revenue while simultaneously raising a $5.5M round.
## Evidence
Uriel (Jan 28, 2026): "So far it has not guarded against [adding to WIP]. It just is more aware of adding to WIP." The current Coda prototype increases awareness but cannot enforce limits.
Standup patterns: Customer success tasks are repeatedly pushed off. Uriel warned the team is "indexed on our next customer" while failing to deliver promises to existing clients.
Usability friction: Drag-and-drop fails when accessed through the team hub. The Kanban view was initially missing. Columns display in wrong order. Mat acknowledges the tool is in "rough state."
Integration gap: Sales pipeline lives in HubSpot, tasks in Coda, meetings in Google Calendar, and conversations in Slack. Updating all four systems for every deal action creates friction that kills adoption.
## Cost of Not Solving
Revenue delay: Deals stall when tasks pile up and customer deliverables slip
Team burnout: The 5-person team reports feeling "spread really thin"
Pipeline opacity: No single view connects tasks to deal stages to revenue impact
Lost institutional knowledge: Without automatic record-keeping, completed work vanishes into scattered Google Docs and Slack threads

# Goals
## User Goals
Reduce context switching by 50%: Team members should be able to see their priorities, update task status, and check deal context without leaving WIPGuard
Make WIP violations visible and costly: When someone exceeds their WIP limit, the board should make this structurally obvious (not just a number in a corner) so the team can address it in standup
Eliminate duplicate data entry: Moving a card from "Active" to "Done" should automatically update HubSpot deal stage, log the completion in the audit trail, and notify relevant stakeholders
Surface scope creep in real time: Unplanned work should be instantly distinguishable from sprint-committed work via the "Whip View"
## Business Goals
Reduce average deal cycle time by 20%: By limiting WIP and ensuring tasks get completed rather than started, deals should move through the pipeline faster
Achieve 100% daily active usage from the GTM team: WIPGuard should replace the current mix of Coda + HubSpot + Slack as the primary daily workflow tool
Build pipeline analytics from task data: Time-in-stage, velocity, and throughput metrics should emerge automatically from card movement, creating a data asset for fundraising and board reporting
Validate product-market fit for external launch: Internal dogfooding should produce enough evidence (and the product itself) to offer WIPGuard to other B2B SaaS teams

# Non-Goals
Replace HubSpot as the CRM of record: WIPGuard integrates with HubSpot bidirectionally but does not store deal records, contact databases, or reporting. HubSpot remains the system of record for pipeline data.
Build a general-purpose project management tool: WIPGuard is opinionated about GTM workflows. It will not support dev sprints, bug tracking, or software development lifecycles. Miguel's engineering team uses GitHub.
Support teams larger than 25 people in V1: The data model and real-time collaboration are designed for small teams. Multi-team hierarchy and enterprise permissions are P2.
Build a mobile app in V1: The web application will be responsive, but a native mobile experience is deferred. Elisha's field-based workflow is a strong motivator for mobile, but it's a separate initiative.
Automate standup or sprint review meetings: The tool will surface data for these ceremonies but will not replace human facilitation. AI-generated standup summaries are P2.

# User Stories
## Mat Hager — Operations Lead / Scrum Master
Role: Builds and maintains WIPGuard, runs all ceremonies, manages Pylon support platform
As the ops lead, I want to configure WIP limits per person and per column so that the board enforces our "one active project, one active task" philosophy structurally
As the scrum master, I want to see a sprint-level view comparing planned vs. actual work completed so that I can facilitate meaningful retrospectives
As the Pylon admin, I want customer support tickets to appear as cards on a dedicated swimlane so that support work is visible alongside GTM tasks
As the tool builder, I want a drag-and-drop Kanban board that works reliably from any entry point (not just direct URL) so that the team can trust the interface
## Kyle Henson — CEO / Founder
Role: Leads fundraising ($5.5M committed), investor relations, key customer relationships (Nike)
As the CEO, I want a dashboard view of all active projects mapped to company priorities so that I can verify our work aligns with strategic goals during board meetings
As a frequently traveling executive, I want to update task status from a responsive web view on my phone so that I can participate in standups remotely
As the fundraising lead, I want pipeline velocity metrics generated automatically from task movement so that I can include operational data in investor updates
## Uriel Eisen — Co-Founder / Product & Strategy
Role: Product strategy, marketing oversight, brand voice, conference presentations, sales calls
As the WIP discipline advocate, I want a "Whip View" that highlights scope creep by showing unplanned additions to the current sprint so that the team can discuss what to cut
As a product strategist, I want cards linked to HubSpot deals so that I can see which tasks directly impact revenue when making prioritization decisions
As a conference presenter, I want completed tasks automatically logged with timestamps so that I can generate "what we shipped" summaries without manual tracking
## Madi Perkins — Marketing
Role: Social media, conference logistics, brand voice, website updates, design coordination
As a marketer with recurring workflows, I want task templates for recurring projects (weekly social posts, monthly reports) so that I don't recreate the same subtasks every sprint
As the heaviest daily user, I want a minimal card view showing just task titles on the board so that I can scan my workload without scrolling through metadata
As someone coordinating with design, I want to @mention Darren in task comments and have him notified via Slack so that handoffs don't require switching tools
## Elisha Eisen — Sales & Customer Success
Role: On-site implementations, customer demos, inventory scoping, reactive field work
As a field-based team member, I want WIPGuard to pull my upcoming customer meetings from Google Calendar as task context so that I can prep without manual lookup
As someone with highly reactive work, I want to quickly log unplanned tasks after the fact and mark them complete so that my actual work appears in sprint reports
As the sales lead, I want my HubSpot deal stages to sync bidirectionally with WIPGuard task status so that I don't have to update both systems

# Requirements
## P0 — Must Have (V1 Launch)
The feature cannot ship without these. They represent the minimum viable product for internal dogfooding at Arda.
### Kanban Board Engine
Drag-and-drop Kanban board with configurable columns: Backlog, Queued, Working on Today, Active, Not Done, Done
Real-time collaboration via WebSockets: card movements visible instantly to all connected users
WIP limits per column with visual enforcement (column turns red when limit is exceeded; drag blocked with override option)
Card detail modal with: task name, status, project, RACI assignments, sprint, dates, priority (P0–P3), effort sizing, notes (rich text), Slack thread link, dependencies
"Advance" button on cards: one-click state progression (Backlog → Queued → Active → Done)
Card filtering by: assignee, project, priority, sprint, status
### Task Hierarchy
Five-level hierarchy: Company Priority → Project → Epic → Task → Subtask
Self-referential parent/child relationships with inherited fields (RACI, due dates default from parent)
Company Priorities: Acquisition, Retention, Expansion, Product, Company Scale (configurable)
Project types: Recurring, Perpetual, One-Off
Projects linked to Business Functions and Company Priorities
### RACI Assignment Model
Four assignment roles per task: Responsible, Accountable, Consulted, Informed
Inheritance from parent tasks (Responsible defaults to current user if no parent; otherwise inherits)
Project Sponsor field at the project level
@mention support for all person fields with notification hooks
### Sprint Management
Sprint entity with: name, start date, end date
Tasks assigned to sprints; due dates calculated from sprint end date
Sprint-level views showing committed vs. completed work
"Not Done" status for incomplete sprint items, carried forward automatically
### Views
Taskboard: full Kanban view of all tasks grouped by status
My Tasks: personal Kanban filtered to the current user
Working on Today: dedicated view for daily standup
Table view: sortable, filterable table with all task metadata
Logbook: date-range filtered view of completed work (audit trail)
### Logbook & Audit Trail
Completed tasks automatically archived to logbook with full metadata preserved
Status history tracking: every status change recorded with timestamp
Completion date, assigned date, and timeline data persisted for reporting
### Authentication & Team Management
Google OAuth SSO (matching current Arda workflow)
Team member profiles with roles and avatar
Invite flow for adding new team members

## P1 — Should Have (Fast Follow)
Significantly improves the experience. Core use case works without them, but these drive adoption and retention.
### HubSpot CRM Integration (Bidirectional)
Sync deal stages from HubSpot to WIPGuard task status (and vice versa)
Link tasks to HubSpot contacts and companies
Surface deal value and pipeline stage on task cards
Auto-create tasks when deal reaches specific stages
### Google Workspace Integration
Google Calendar: surface upcoming meetings as task context; create calendar events from cards
Gmail: link email threads to tasks; compose emails from task context
Google Drive: attach documents to tasks
### Slack Integration
Post notifications when cards change status, are assigned, or are commented on
Create tasks from Slack messages
Daily standup bot that posts each person's Working on Today cards
### Unplanned Work Tracking
"Unplanned" checkbox on tasks to distinguish ad-hoc from sprint-committed work
"Whip View": dedicated visualization showing planned vs. unplanned work per sprint
"Planning Session" marker for work added during formal sprint planning vs. mid-sprint
### Advanced Board Features
Aging indicators: cards change color based on time in column (3+ days yellow, 7+ days red)
Dependency visualization: see which tasks block other tasks
Collapsed card view: show only task titles for dense scanning
Epic color coding: visual grouping of related subtasks
"Waiting on Third Party" and "Expedited" swimlanes for reactive work
### Analytics & Reporting
Cumulative flow diagram: visualize WIP over time
Sprint velocity: story points committed vs. completed per sprint
Throughput metrics: tasks completed per person per sprint
Time-in-stage tracking: how long cards spend in each column

## P2 — Future Considerations
Explicitly out of scope for V1 but the architecture should accommodate them.
GitHub two-way connector: pull dev ticket status into a read-only GTM visibility pane
AI-powered standup summaries: auto-generate daily/weekly reports from card movement and meeting notes
Task templates and recurring task automation
Multi-team hierarchy: support multiple GTM teams with cross-team visibility
Customer-facing portal: share project status with external stakeholders
Native mobile application (iOS/Android)
API for third-party integrations and custom workflows
Pylon customer support integration: route support tickets as Kanban cards
OpenBOM-style webhook integrations for manufacturing workflow data

# Data Model
The following data model is derived from the complete Coda schema mapping of the current WIPGuard prototype (doc ID: lE7mWZbZCk). The standalone application should replicate this structure in PostgreSQL with the following core entities:
## Core Entities
### CompanyTasks (43 fields in Coda)
The central entity. Each task carries structured metadata including RACI assignments, sprint binding, parent/child hierarchy, dependency chains, status history, and action buttons.

### CompanyProjects (30 fields)
Projects are the primary organizational unit below Company Priorities. Each project has RACI assignments, a type classification, priority level, linked tasks, and a project overview page.

### CompanyPriorities (8 fields)
The five strategic priority areas that organize all GTM work: Acquisition, Retention, Expansion, Product, and Company Scale.

### Sprints (3 fields)

### Logbook (22 fields)
Archive of completed tasks. Mirrors the CompanyTasks structure with completion metadata. Tasks are copied here by the "Completed" button action before being deleted from the active board.

### Status History (3 fields)
Append-only log of status transitions. Every time a task changes status, a row is created linking the task, the new status, and a timestamp. This enables time-in-stage analytics.

## Entity Relationships
CompanyPriorities 1:N CompanyProjects (via Linked Projects)
CompanyProjects 1:N CompanyTasks (via Project/Business Focus Area)
CompanyTasks 1:N CompanyTasks (self-referential via Parent/Subitems for epic/task/subtask hierarchy)
CompanyTasks N:N CompanyTasks (via Depends On for dependency chains)
Sprints 1:N CompanyTasks (via Sprint assignment)
CompanyTasks 1:N StatusHistory (every status change logged)
CompanyTasks → Logbook (one-way copy on completion; original deleted)

# Integration Architecture
The standalone WIPGuard application should implement an event-driven integration model where card movements automatically trigger actions in connected systems. This eliminates the "update the CRM" tax that kills adoption.
## Event-Driven Design Principle
Core insight: Record-keeping should be a byproduct of doing the work, never a separate data-entry step. When a user drags a card from "Active" to "Done," the system should:
Archive the task to the logbook with full metadata (P0)
Update the linked HubSpot deal stage if mapped (P1)
Post a completion notification to the relevant Slack channel (P1)
Log the status transition in status history with timestamp (P0)

## Integration Priority

## HubSpot Sync Model
The HubSpot integration is the highest-value integration and the most architecturally complex. The mapping between WIPGuard entities and HubSpot objects:

# Technical Architecture
Recommended technology stack for a standalone WIPGuard application, informed by the real-time collaboration requirements and integration-heavy nature of the product:
## Recommended Stack

## Key Architectural Decisions
### WebSockets over Server-Sent Events
Kanban boards require true bidirectional communication. When User A drags a card, User B must see it move in real time. SSE only supports server-to-client; WebSockets (via Socket.IO) enable the client to emit card-move events that the server can broadcast to all connected clients.
### PostgreSQL over NoSQL
The WIPGuard data model is deeply relational: tasks reference projects, sprints, priorities, and other tasks (parent/child and dependencies). PostgreSQL's foreign keys, recursive CTEs (for hierarchy traversal), and JSONB columns (for flexible metadata like notes) make it the natural fit.
### Event Sourcing for Status History
Every status change is stored as an append-only event in the StatusHistory table. This enables time-in-stage analytics, cumulative flow diagrams, and complete audit trails without complex change-data-capture infrastructure.
### Webhook-Based Integration Pattern
External integrations (HubSpot, Slack, etc.) should use a webhook pattern: WIPGuard emits events to a queue (Redis), which are processed by integration workers. This decouples the core application from integration latency and failures.

# Success Metrics
## Leading Indicators (Days to Weeks Post-Launch)

## Lagging Indicators (Weeks to Months)
## Evaluation Timeline
Week 1: Daily active usage + task creation rate (adoption)
Week 4: Sprint completion rate + WIP violation trend (process)
Month 3: Deal cycle time + unplanned work ratio (business impact)
Month 6: Full metric review; decide on external launch

# Competitive Landscape
No existing product combines WIP-limited Kanban methodology with GTM-specific workflows and automatic CRM record-keeping. Competitors address one or two of these dimensions:

Key differentiator: WIPGuard is the only product that treats WIP limits as a first-class feature (not a setting buried in a menu), applies them specifically to GTM team workflows (not generic project management), and generates CRM/calendar/communication records as a byproduct of card movement (not a manual sync or automation rule).

# Open Questions
## Blocking (Must Answer Before Development)
[Product] WIP limit enforcement model: Should exceeding WIP limits be a hard block (cannot drag) or soft warning (drag allowed, visual alert)? The team debate suggests starting soft and hardening over time.
[Product] HubSpot pipeline mapping: Which HubSpot pipelines and stages should map to which WIPGuard statuses? This requires a mapping workshop with Elisha and Mat.
[Architecture] Self-hosted vs. cloud-hosted: For V1 dogfooding, is cloud-hosted sufficient? Or does Arda need self-hosting for customer data sensitivity?
[Product] Personal task sync model: The current Coda system has a SyncToPersonal feature that pushes tasks to individual team members' personal Coda docs. Does the standalone version need a personal workspace concept?
## Non-Blocking (Can Resolve During Development)
[Design] Card density: How minimal can the default card view be? Madi wants titles only; Mat wants enough metadata for standup context.
[Engineering] Real-time conflict resolution: What happens when two users drag the same card simultaneously? Last-write-wins vs. operational transform.
[Product] Milestone vs. Epic distinction: The Coda model has both. Are milestones tasks with a special status, or a separate entity?
[Product] Degree of Difficulty vs. Story Points: The current system uses a DegreeOfDifficulty lookup (Low/Medium/High/Epic). Should V1 also support numeric story points?

# Timeline & Phasing
## Phase 1: Core Board (Weeks 1–6)
Replicate the essential Coda functionality as a standalone web app.
Kanban board with drag-and-drop and real-time WebSocket updates
Task CRUD with full hierarchy (Priority → Project → Task → Subtask)
RACI assignment model with inheritance
Sprint management and Working on Today view
Logbook archival and status history tracking
Google OAuth authentication
Exit criteria: Arda GTM team can run daily standup entirely from WIPGuard, with no Coda fallback.
## Phase 2: Integrations (Weeks 7–12)
Add the integration layer that makes record-keeping automatic.
HubSpot bidirectional sync (deal stage ↔ task status)
Google Calendar meeting context on task cards
Slack notifications for status changes and assignments
Gmail thread linking
Unplanned work tracking with Whip View
Exit criteria: Team members update HubSpot deal stages by moving WIPGuard cards, not by visiting HubSpot directly.
## Phase 3: Analytics & Polish (Weeks 13–16)
Surface the data that card movement generates.
Cumulative flow diagram and sprint velocity charts
Time-in-stage analytics and aging indicators
Collapsed card views and advanced filtering
Epic color coding and dependency visualization
Sprint retrospective view (planned vs. actual with unplanned breakdown)
Exit criteria: Mat can run sprint retrospectives using only WIPGuard analytics. Kyle can pull pipeline metrics for investor updates from WIPGuard dashboards.
## Phase 4: External Readiness (Weeks 17–20)
Prepare WIPGuard for use by other B2B SaaS GTM teams.
Multi-tenant architecture and onboarding flow
Configurable WIP limits, column names, and priority structures
Documentation and setup wizard
Pricing and packaging decisions
Exit criteria: One external beta team can set up and use WIPGuard independently with documentation alone.
