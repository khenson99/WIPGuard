# Imladris Company Health Command Center Superprompt

Use this prompt to start an implementation session that turns Imladris into Arda's company-health and metrics command center for operators and investors.

```markdown
You are Codex, working in the existing `/Users/kylehenson/WIPGuard` repository.

Your mission is to implement Imladris as Arda's company-health command center: a hybrid operating system for internal operators and a restricted, board-final monthly reporting workspace for investors.

Do not treat this as a greenfield analytics app. Ground every change in the current Next.js/Prisma codebase and preserve the existing Imladris architecture:

- Next.js App Router, React, TypeScript, Prisma, NextAuth.
- Imladris raw source records, canonical metric values, metric lineage, confidence/trust status, and materialization services.
- Existing provider catalog: HubSpot, Stripe, Pylon, PostHog, Linear, Slack, Google Workspace, GitHub, Google Analytics, Google Search Console, Google Ads, Meta Ads, Reddit Ads, SEMrush, Coda, Webflow, Unify, and Mercury.
- Existing workspaces: Sources, Goals, Metrics, Reports, Automation Pipelines.
- Existing Company Tracker, CEO metric trust/readiness layer, report packs, investor dashboard export, unit-economics engine, automation runtime, and approval/recommendation infrastructure.

## Product North Star

Make **Healthy ARR Growth** the top-level company-health question.

Healthy ARR Growth is not just ARR. It is ARR/MRR growth interpreted through:

- runway, cash balance, net burn, and burn multiple
- pipeline coverage and sales efficiency
- activation and retention risk
- customer health and LIR-style leading indicators
- goal pacing and company priorities
- source coverage, freshness, confidence, trust state, and lineage
- recommendation/action status

Use best-in-class startup operating methodology as guidance:

- Bessemer-style cloud metrics: recurring revenue, cash flow/burn, CAC payback, CLTV, churn, retention, and capital efficiency.
- a16z-style growth metrics: growth, retention, margins, efficiency, and consistent definitions.
- Stage 2 Capital / Mark Roberge LIR thinking: a customer is healthy only when a defined percentage reaches meaningful product/customer-success behavior within a defined time.
- David Skok SaaS metrics: MRR/ARR movement, churn, LTV:CAC, CAC payback, gross margin, and segment-level unit economics.

Do not blindly add vanity dashboards. Every dashboard card must answer one of:

1. Is the company healthier than last period?
2. What changed?
3. Can we trust the number?
4. What source or calculation is blocking trust?
5. What action should an operator take next?
6. What is safe to show investors?

## Roles And Access

Add a restricted `investor` app role.

Current app roles are `admin`, `member`, and `observer`; extend the role model, permission helpers, auth/session projection, team role management, tests, and route/API guards as needed.

Investor users must only see board-final material:

- approved monthly investor/board pack
- approved metrics and trends
- trust labels and high-level freshness/readiness labels
- exportable artifacts such as markdown, CSV, and slide-ready JSON
- high-level narrative and deterministic notes

Investor users must not see:

- raw provider payloads
- source records with PII
- credentials or integration settings
- operator workflows, approvals, or draft recommendations
- internal task/WIP surfaces
- unapproved metrics or non-board-final report runs
- write actions

Only admins can mark a metric snapshot or report pack as board-final/investor-visible. Automatic readiness can recommend approval, but it must not publish to investors without admin approval.

## V1 Product Shape

Build a coherent v1 around a CEO/company-health command center first.

The command center should be the primary operating screen for admins and members. It should summarize:

- Healthy ARR Growth
- ARR, MRR, subscription revenue, services revenue
- cash balance, net burn, runway, burn multiple
- qualified pipeline and pipeline coverage
- CAC/payback/LTV:CAC/gross margin/magic number where source coverage supports it
- activation rate, retention risk, customer-health/LIR status
- delivery health from Linear/GitHub/PostHog
- marketing/website/ad/SEO/source efficiency
- goal pacing from configured company goals
- source coverage and freshness for the full provider catalog
- board readiness and blockers
- prioritized approval-gated recommendations

Keep supporting workspaces meaningful:

- **Sources**: every provider in the full catalog is visible with connection state, last sync, freshness SLA, error state, affected metrics, and retry/remediation actions. Missing providers degrade only dependent metrics.
- **Goals**: company goals and tracked Linear projects, tied back to company-health metrics where possible.
- **Metrics**: canonical definitions, current and historical values, formulas, source dependencies, confidence, trust state, lineage, warnings, and calculation version.
- **Reports**: monthly board/investor packs, CEO reports, weekly reports, custom packs, readiness gates, admin approval state, and exports.
- **Automation Pipelines**: ingestion, materialization, report generation, recommendations, approvals, failed runs, replay, and audit evidence.

## Investor Workspace

Create a dedicated investor workspace or investor-scoped route.

It should be read-only and monthly-pack-oriented:

- current approved monthly board pack
- Healthy ARR Growth snapshot
- period-over-period trend cards
- board-final metrics only
- trust/readiness summary in investor-safe language
- deterministic narrative notes
- exports: markdown, CSV, slide-ready JSON
- no source payloads, no raw lineage IDs if they expose sensitive data, no operator actions

If no board-final pack exists, show a safe empty state:

- "No approved investor pack is available yet."
- no leaked draft values
- no fallback to unapproved internal metrics

## Metrics And Data Model

Use canonical Imladris metric definitions as the source of truth.

Every board-grade metric must have:

- stable `metricKey`
- label and domain/department
- unit
- owner/audience
- source dependencies and optional dependencies
- freshness SLA
- deterministic formula
- calculation version
- period start/end
- computed at
- confidence
- trust state
- warnings
- source lineage
- board eligibility
- board-final approval state

Promote existing calculations into canonical metric surfaces instead of duplicating UI formulas:

- Company Tracker summary and health bands
- CEO metric trust/readiness
- investor dashboard export
- unit-economics engine
- retention/LIR/customer-health services
- materialized Imladris canonical metrics

Add missing canonical metrics carefully when needed. Prefer versioned deterministic calculators over ad hoc UI transforms.

At minimum, support these metric groups:

- Revenue: MRR, ARR, net new ARR, subscription revenue, services revenue, active subscriptions, expansion/contraction/churn where data exists.
- Finance: cash balance, gross burn, net burn, runway, burn multiple, gross margin.
- Sales: qualified pipeline, pipeline coverage, sales velocity or stage conversion when available, demo/meeting activity, pipeline creation.
- Marketing/Growth: website traffic, conversion rate, paid spend, pipeline efficiency, CAC, magic number, channel efficiency, SEO/source health.
- Product/Development: activation rate, delivery health, product usage, release/delivery confidence.
- Customer Success: retention risk, LIR attainment, support load, billing risk, onboarding risk, account health.
- Goals: ARR goal pacing, runway/burn goals, company goal completion/progress.

If a source is missing, stale, partial, conflicted, or errored, show that state on the affected metric and preserve the rest of the command center.

## Readiness, Trust, And Approval

Keep a strict distinction between:

- computed
- internally visible
- board-ready
- board-final / investor-visible

A metric can be internally visible when partial or stale if it clearly says so.

A metric can be board-ready only when it has:

- deterministic calculator
- non-empty value
- explicit source citations/lineage
- fresh required sources under SLA
- confidence/trust state above the chosen threshold
- formula/version present
- parity against source dashboard or canonical source where applicable

A metric becomes board-final only after admin approval.

Report packs inherit readiness from their included metrics. If any required metric is not board-ready, the pack is not board-final. Admins can approve only board-ready packs unless they explicitly record an override reason; investors must see the override label if an override is allowed.

## Recommendations And Actions

Make dashboards action-oriented, but keep risky execution approval-gated.

Recommendations should be derived from deterministic facts and source states. AI may generate narrative, drafts, and suggested actions only after canonical data has been assembled.

V1 recommendations should include:

- source remediation: reconnect, refresh, fix credentials, retry sync
- metric remediation: missing formula, stale source, low confidence, conflicting sources
- operating actions: pipeline review, burn reduction review, retention-risk review, onboarding intervention, ad/SEO optimization, customer-health follow-up
- report actions: approve board-ready pack, resolve readiness blockers, export monthly investor update

Do not auto-send outbound customer/investor communications, change ad spend, schedule meetings, or mutate external systems without explicit approval.

## API And Route Expectations

Prefer small, typed APIs that reuse existing services.

Likely surfaces include:

- internal company-health command center API
- investor workspace API
- board-final approval API
- metric readiness API
- source coverage API
- report export API
- recommendation/approval API reuse or extension

All APIs must be organization-scoped and permission-checked.

Investor APIs must redact:

- raw payloads
- raw source records
- credentials/secrets
- PII
- draft/unapproved metric values
- operator-only recommendations and workflow state

Avoid creating a parallel analytics stack. Use the existing Imladris service layer, canonical metrics, materialization, Company Tracker, CEO services, and report services wherever possible.

## UI Expectations

Build dense, operator-grade dashboards rather than marketing pages.

Design principles:

- first screen is the usable command center, not a landing page
- compact information architecture
- visible freshness/trust labels
- clear board-readiness blockers
- no decorative hero sections
- no card-in-card layouts
- use existing app design conventions and icons
- investor view should feel polished, calm, and read-only
- all text must fit at desktop and mobile sizes

## Phasing

Implement in phases.

### Phase 1: V1 Command Center

- Add investor role and permissions.
- Add CEO/company-health command center surface.
- Reconcile Company Tracker, CEO trust/readiness, investor export, and unit economics into canonical metric/report flows.
- Show full provider catalog source coverage with localized degradation.
- Add monthly investor workspace with board-final-only data.
- Add admin-only approval for investor-visible board packs.
- Add tests for permissions, redaction, readiness, source degradation, and main dashboards.

### Phase 2: Deeper Metrics And Benchmarks

- Expand metric definitions and calculators for retention, CAC payback, LTV:CAC, magic number, NRR/GRR where data supports it.
- Add cohort and segment views for customers, pipeline, channels, and retention.
- Add benchmark context carefully, always showing formulas and assumptions.

### Phase 3: Automation And Operating Cadence

- Expand approval-gated recommendations.
- Add recurring monthly board-pack generation.
- Add investor update narrative generation from approved facts.
- Add operator playbooks for source remediation, retention risk, burn risk, and pipeline risk.

## Testing Requirements

Add or update tests before claiming completion.

Required coverage:

- unit tests for metric formulas, readiness gates, confidence/trust, source degradation, and redaction helpers
- permission tests proving investors cannot access raw records, credentials, operator routes, or write endpoints
- API tests for investor workspace payloads, board-final approval, missing-provider behavior, and report-pack gating
- component tests for CEO command center, source coverage, board-readiness, investor workspace, and approval-gated recommendations
- focused E2E smoke tests for admin/operator command center and investor read-only monthly board pack access

Run focused tests first, then lint/typecheck/build as practical for the blast radius. Report any pre-existing unrelated failures separately.

## Non-Goals And Guardrails

- Do not resurrect WIPGuard task/Kanban as a primary product surface.
- Do not expose raw provider data to investors.
- Do not make AI-generated values authoritative.
- Do not create duplicate formula implementations in UI components.
- Do not let one missing provider break unrelated metrics.
- Do not mark metrics board-final automatically without admin approval.
- Do not revert unrelated user work in the repository.

## Acceptance Criteria

The implementation is complete when:

- Admin/member users can use a CEO/company-health command center centered on Healthy ARR Growth.
- Every provider in the current Imladris catalog appears in source coverage.
- Canonical metrics show value, formula/version, source dependencies, confidence, trust, warnings, and readiness.
- Missing/broken sources degrade only dependent metrics.
- Admins can approve a monthly board/investor pack.
- Investor users can sign in and see only board-final approved monthly reporting.
- Investor users cannot access raw payloads, source records, credentials, internal drafts, workflows, or write APIs.
- Report exports are generated from approved canonical facts.
- Tests cover role permissions, investor redaction, board-final gating, source degradation, metric trust, and the primary dashboard surfaces.

Start by reading the current repo files for workspaces, permissions, auth, Imladris catalog, Company Tracker, CEO services, investor export, materialization, and reports. Then produce a short implementation plan and execute it.
```
