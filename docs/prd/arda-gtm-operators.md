# Arda GTM Operators

## Objective

Extend WIPGuard into Arda's internal GTM operator platform. The system should ingest GTM events, persist source material, run AI analysis in the worker, create auditable artifacts and recommendations, and either auto-execute safe internal actions or route approval-gated actions to humans.

## Wave 0 Scope

- Add persisted automation source documents, artifacts, recommendations, and AI jobs.
- Extend workflow runtime with `ai_extract`, `ai_analyze`, `ai_generate`, and `execute_recommendation`.
- Add OpenAI Responses background-job submission, polling, and webhook completion handling.
- Add worker support for automation dispatch and AI job progression.
- Add operator templates for sales follow-up, customer health, GTM scrum, SEO growth, ads optimization, and roadmap intelligence.
- Add API surfaces for recommendation and artifact access plus recommendation approval and execution.
- Add a recommendation inbox next to the existing workflow approval inbox.
- Seed a dedicated Ralph execution surface separate from the existing WIPGuard board.

## Execution Model

1. Ingest event arrives through `/api/automations/ingest/[provider]`.
2. Matching workflow run is created and source documents are materialized from the payload.
3. Workflow runtime executes synchronously until it reaches:
   - `WAITING_APPROVAL` for classic step approvals.
   - `WAITING_EXTERNAL` for background AI work.
4. Worker submits queued AI jobs to OpenAI Responses in background mode.
5. Worker polling or webhook completion retrieves the final response, persists artifacts and recommendations, and resumes the workflow graph from the completed node.
6. Non-approval recommendations can be auto-executed through `execute_recommendation`.
7. Approval-gated recommendations surface in the recommendation inbox for later approval and explicit execution.

## Safety Defaults

- Internal drafts, tasks, digests, GitHub issues, and CRM notes may auto-execute.
- Outbound email sends, calendar scheduling, and ad-spend changes stay approval-gated.
- Every AI job, artifact, recommendation, approval, and execution result is stored on the workflow run for auditability.

## Operator Surfaces

### Sales Follow-up
- Trigger: demo transcript or demo-complete context.
- Outputs: coaching memo, deal next-step memo, follow-up email draft, CRM updates, reminder tasks, optional meeting draft recommendation.

### Customer Health
- Trigger: risk-detected event.
- Outputs: risk diagnosis, intervention memo, renewal-risk tasks, CRM notes, optional customer-outreach draft.

### GTM Scrum
- Trigger: aggregated GTM intake or digest request.
- Outputs: prioritized digest, GitHub issue recommendations, execution tasks, Slack digest.

### SEO Growth
- Trigger: Search Console or growth snapshot.
- Outputs: SEO backlog, content briefs, channel copy, implementation tickets.

### Ads Optimizer
- Trigger: paid-media snapshot.
- Outputs: anomaly memo, experiment proposals, spend-shift recommendations, landing-page work items.

### Roadmap Intelligence
- Trigger: roadmap intake event.
- Outputs: roadmap memo, reprioritization rationale, GitHub issue recommendations.

## Success Metrics

- Demo-to-ready follow-up median under 10 minutes.
- 80% or more of follow-up drafts require only minor edits.
- No duplicate run side effects on replay.
- GTM scrum backlog creation materially reduces manual grooming time.
