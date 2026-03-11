# Runbook: Visitor Funnel Enrichment

## Goal

Feed de-anonymized website visitor signals into WIPGuard through a single normalized ingestion layer. WIPGuard owns dedupe, attribution, acceptance, and downstream tasking. Providers only supply signals.

## Delivery model

- `Unify`: scheduled pull source via `/api/cron/sync`
- `Clay`: webhook push source via `/api/v1/analytics/funnel/enrich/clay`
- `RB2B`: webhook push source via `/api/v1/analytics/funnel/enrich/rb2b`

## Required env vars

Shared:

- `VISITOR_FUNNEL_ENRICH_SECRET`

Provider-specific:

- `CLAY_FUNNEL_ENRICH_SECRET`
- `RB2B_FUNNEL_ENRICH_SECRET`
- `UNIFY_FUNNEL_ENRICH_SECRET`
- `UNIFY_DATA_API_KEY`
- `UNIFY_FUNNEL_OBJECT_NAME`
- `UNIFY_FUNNEL_SYNC_ENABLED`
- `UNIFY_FUNNEL_INITIAL_LOOKBACK_HOURS`
- `UNIFY_FUNNEL_CURSOR_OVERLAP_MINUTES`
- `UNIFY_FUNNEL_MAX_RECORDS`

## Endpoint auth

The enrichment endpoint accepts any of:

- `Authorization: Bearer <secret>`
- `x-webhook-secret: <secret>`
- `?token=<secret>` or `?secret=<secret>`

Use a provider-specific secret when possible. Use the shared secret only as a fallback.

## Unify setup

1. Set `UNIFY_DATA_API_KEY` and `UNIFY_FUNNEL_OBJECT_NAME`.
2. Keep `UNIFY_FUNNEL_SYNC_ENABLED=true`.
3. Ensure production cron hits `/api/cron/sync`.
4. In the Visitor Funnel admin panel, use `Pull now` or `Replay 24h` to validate the mapping.

Manual pull example:

```json
{
  "mode": "pull",
  "updatedAfter": "2026-03-10T00:00:00.000Z",
  "maxRecords": 100
}
```

Post that body to `/api/v1/analytics/funnel/enrich/unify` as an admin or with a valid enrichment secret.

## Clay setup

1. Configure a Clay webhook / HTTP action to `POST` JSON to `/api/v1/analytics/funnel/enrich/clay`.
2. Send `x-webhook-secret: <CLAY_FUNNEL_ENRICH_SECRET>` if Clay supports custom headers.
3. If not, append `?token=<secret>` to the webhook URL.
4. Map Clay columns to visitor identity fields where possible: `email`, `companyDomain`, `companyName`, `capturedUrl`, `occurredAt`.
5. Use `Validate sample` in the Visitor Funnel provider-health card before sending live traffic.

Sample Clay payload:

```json
{
  "dryRun": true,
  "rows": [
    {
      "rowId": "sample-row-1",
      "workEmail": "sample@example.com",
      "companyDomain": "example.com",
      "fullName": "Sample Buyer",
      "companyName": "Example Co",
      "confidence": 87,
      "capturedUrl": "https://wipguard.ai/demo",
      "referrerUrl": "https://www.reddit.com/r/revops",
      "occurredAt": "2026-03-08T12:00:00.000Z"
    }
  ]
}
```

## RB2B setup

1. Point RB2B's webhook destination to `/api/v1/analytics/funnel/enrich/rb2b`.
2. Prefer `?token=<RB2B_FUNNEL_ENRICH_SECRET>` in the destination URL if RB2B cannot send custom headers.
3. Include RB2B fields such as `Business Email`, `Company Name`, `Website`, `Captured URL`, and `Seen At`.
4. Use `Validate sample` in the Visitor Funnel provider-health card before going live.

Sample RB2B payload:

```json
{
  "dryRun": true,
  "Business Email": "sample@example.com",
  "First Name": "Sample",
  "Last Name": "Buyer",
  "Company Name": "Example Co",
  "Website": "https://example.com",
  "Captured URL": "https://wipguard.ai/pricing",
  "Referrer": "https://www.reddit.com/r/startups",
  "Seen At": "2026-03-08T12:00:00.000Z"
}
```

## Validation checklist

1. Open the Visitor Funnel admin panel.
2. Confirm each provider card shows the correct endpoint and config state.
3. Run `Pull now` for Unify.
4. Run `Validate sample` for Clay and RB2B.
5. Confirm accepted signal counts increase after live delivery starts.
6. Confirm alerts only show for genuinely stale or misconfigured providers.

## Operational expectations

- `Unify` should report `mode: pull` in cron sync results.
- `Clay` and `RB2B` should report `mode: push_only` in cron sync results.
- `401` or `400` from the enrichment endpoint is acceptable during smoke checks; `404` is not.
- WIPGuard may reject a signal if it cannot attach useful identity evidence. That is expected behavior, not necessarily a provider outage.
