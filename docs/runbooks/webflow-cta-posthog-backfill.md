# Webflow CTA to PostHog Backfill

Use this runbook to backfill the Webflow Analyze CTA click aggregates into
PostHog as `marketing_cta_clicked` events and refresh Imladris history.

## Inputs

- Source data: Webflow Analyze aggregate CTA counts and daily sessions for
  2026-03-19 through 2026-06-26.
- Destination event: `marketing_cta_clicked`.
- Required live secret: `POSTHOG_PROJECT_API_KEY`, a PostHog project/capture key
  accepted by `/batch/`.
- Optional host override: `POSTHOG_CAPTURE_HOST`; falls back to `POSTHOG_HOST`,
  then `https://us.posthog.com`.

Do not put PostHog keys in scripts. Keep them in the environment.

## Dry Run

```bash
npm run backfill:webflow-cta-posthog
npm run backfill:webflow-cta-posthog -- --json
```

Dry run prints the exact event count, CTA breakdown, batch count, and sample
events. It never sends data to PostHog.

## Live Run

```bash
POSTHOG_PROJECT_API_KEY=phc_... \
npm run backfill:webflow-cta-posthog -- --live
```

Events carry stable `$insert_id` values under
`webflow-cta-backfill-v1:<date>:<cta>:<index>`, plus
`$source=webflow_backfill`, `backfill_source=webflow_analyze`, and
`synthetic=true`. Re-running the same backfill is intended to be retry-safe.

## Refresh Imladris

Use the Imladris hook after a live send:

```bash
npm run backfill:webflow-cta-posthog -- --live --refresh-imladris-history
```

That hook:

1. Ingests PostHog journey events, including `marketing_cta_clicked`, into
   `ImladrisRawSourceRecord`.
2. Materializes Imladris marketing metrics for the backfill window.

Use one or more `--user-id <id>` options when you need to target specific integration
owners instead of the normal sync discovery path.

## Verify

```bash
npm run verify:daily-history
npm test -- src/lib/analytics/fetchers-development.test.ts src/lib/analytics/webflow-cta-backfill.test.ts
```

In PostHog, filter by `$source = "webflow_backfill"` or
`imladris_backfill_version = "webflow-cta-backfill-v1"`.
