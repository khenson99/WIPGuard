# CEO Metric Production Rollout

This runbook validates the CEO Metric Trust Layer before a Railway production deploy.

## Readiness Rule

The CEO command center is visible to authenticated users, but generated metrics and reports must remain `not_board_final` until every default report-pack metric has:

- an explicit calculator
- a source-system citation
- source lineage
- a fresh source under its metric-specific SLA
- a non-empty value
- parity coverage against the source dashboard or snapshot calculation

Metrics that are stale, partial, missing, errored, conflicted, or unverified can be shown only with the trust state and failing readiness gate.

## Pre-Deploy Gate

Run these checks from the repository root:

```bash
npm test
npx tsc --noEmit --pretty false
npm run lint
npm run build
MIGRATIONS_MODE=strict node migrate.cjs
```

The production container defaults to strict migrations when the CEO metric migration is present. Do not deploy this phase with `MIGRATIONS_MODE=best-effort` unless rolling back the CEO feature is the explicit incident response.

## Railway Deploy

1. Confirm the target Railway service is production.
2. Confirm `DATABASE_URL` points at the production Postgres service.
3. Confirm `MIGRATIONS_MODE` is unset or set to `strict`.
4. Deploy the app service.
5. Watch startup logs for `Running migrations (MIGRATIONS_MODE=strict)...`.
6. Stop the rollout if migrations fail; the app should not start in this phase.

## Smoke Checks

After deployment, verify:

```bash
curl -fsS https://<production-host>/api/health/live
curl -fsS https://<production-host>/api/ceo/metrics
curl -fsS https://<production-host>/api/ceo/reports
```

Then sign in and verify:

- `/analytics/ceo` loads for an authenticated user.
- The production readiness banner is visible.
- Any failing gates are shown as `not_board_final`.
- Weekly Exec, Board Meeting, Investor Update, and Custom Metric Snapshot report packs can generate report runs.
- Markdown, CSV, and slide-ready JSON exports include readiness status, failing gates, trust labels, source lineage, and freshness warnings.

## Rollback

If metrics are unavailable but the app is otherwise healthy, leave the route visible and investigate the failing gates. If strict migration failure blocks startup, roll back to the last known-good Railway deployment and inspect the failed migration against production-like data before retrying.
