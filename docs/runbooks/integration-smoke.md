# Runbook: Integration Smoke Check (Production)

## Trigger
- After deploying integration/auth changes.
- After reconnecting a provider in production.
- After an incident involving integrations (webhooks, OAuth refresh, analytics snapshots).

## Checklist (5-10 minutes)
### Webhook endpoints (must not 404)
- HubSpot webhook (v1): `curl -i https://wipguard-app-production.up.railway.app/api/v1/integrations/hubspot/webhook`
  - Expect: `405` (method not allowed) or `400` (validation), but **not** `404`.
- Slack events (v1): `curl -i https://wipguard-app-production.up.railway.app/api/v1/integrations/slack/events`
  - Expect: `405` or `400`, but **not** `404`.
- Visitor funnel enrichment (v1): `curl -i https://wipguard-app-production.up.railway.app/api/v1/analytics/funnel/enrich/rb2b`
  - Expect: `401` or `400`, but **not** `404`.

### Settings UI (Integrations)
- Open: `https://wipguard-app-production.up.railway.app/settings?tab=integrations`
- Confirm the provider cards show:
  - **Stored Connection** health (CONNECTED / ERROR / DISCONNECTED).
  - **Data Health** (sync health + latest snapshot status).

### Provider-specific quick checks
- Visitor funnel enrichment
  - Confirm `VISITOR_FUNNEL_ENRICH_SECRET` or the provider-specific secret is set in production.
  - If Unify pull mode is enabled, confirm `UNIFY_DATA_API_KEY` and `UNIFY_FUNNEL_OBJECT_NAME` are present.
  - Trigger `POST /api/cron/sync` with `x-cron-secret`; response should include `visitorFunnelEnrichment`.
  - Expected status:
    - `unify.ok = true` when pull mode is configured.
    - `clay.skipped = true` and `rb2b.skipped = true` because those providers are push-only.
- HubSpot
  - No connection error mentioning `propertiesWithHistory` object limit (>50).
  - Rules can scan up to configured `maxResults` (e.g. 500) without silently capping at 100.
- Stripe
  - No provider “Last Error” mentioning `rev30d is not defined`.
- Pylon
  - No provider “Last Error” mentioning `Pylon request failed (404)`.

## Follow-ups
- If a provider is missing required OAuth scopes, disconnect and reconnect from the Integrations settings page.
- If a provider is stuck in `ERROR`, wait for the next health check / refresh cycle or manually reconnect to restore `CONNECTED`.
