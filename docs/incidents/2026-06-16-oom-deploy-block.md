# Post-incident: WIPGuard-app OOM crash loop + silent deploy block (2026-06-16)

**Status:** Resolved 2026-06-16 ~05:44 UTC.
**Severity:** P0 — production crash-cycling (~every 20 min), login repeatedly broken.
**Duration of the leaky window:** the fix existed on `main` from ~04:21 UTC but did not reach production until ~05:44 UTC (~1.5h) because deploys silently failed.

## Impact

`WIPGuard-app` hit `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory` roughly every 20 minutes. Each cycle: GC thrash (requests crawl) → fatal → restart (~10–30s outage + Prisma reconnect burst). The operator's login broke repeatedly.

## Root cause (two stacked failures)

1. **The leak.** Authenticated analytics requests performed unbounded `ImladrisMetricLineage` reads, growing the V8 heap ~3.4 MB/s until it hit the ~4 GB default cap. Fixed by **#599** (bound lineage reads + add a DB-disk health check), with **#582/#584** adding retention/pruning for the tables behind the related 2026-06-10 ENOSPC disk outage, and **#600** stopping the pool-monitor from latching `/api/health` to a permanent false 503.

2. **The fix could not deploy.** Every deploy carrying #599 failed in Railway's `preDeployCommand` (`node migrate.cjs`):

   ```
   Migration 20260615120000_add_retention_prune_indexes contains CONCURRENTLY;
   refusing to run outside a transaction
   ```

   `migrate.cjs` applies each migration inside a `BEGIN/COMMIT`, so it (correctly) refuses `CREATE INDEX CONCURRENTLY`. But it tested the **raw migration text — comments included** — and the retention-index migration only *mentioned* `CONCURRENTLY` in an operator note; its executable statements were plain `CREATE INDEX IF NOT EXISTS`. The false match aborted the deploy. Railway kept the last-good **pre-#599** image serving (deploy `28d5185c`, built 03:57 UTC), so production stayed on leaky code while `main` already had the fix.

## Why it wasn't worse

`restartPolicyMaxRetries` had been raised to **250** (#593) before the crash window. That kept the service self-reviving (~seconds of downtime per cycle) instead of exhausting the default 10 retries and sitting hard-down until a manual redeploy — which is exactly what had happened in an earlier window.

## Resolution

**#606** fixed the migration runner to detect `CONCURRENTLY` only in executable SQL (strip comments first) **and** to *defer* genuine `CONCURRENTLY` migrations — skip them at preDeploy/boot so a deploy is never blocked, then apply them out-of-band and record them in `_prisma_migrations` (runbook: `docs/runbooks/concurrent-index-migrations.md`). The retention migration was also rewritten to use real `CREATE INDEX CONCURRENTLY IF NOT EXISTS` (no write-blocking lock on the large post-incident tables). Deploy `d11f98af` (built from #606, carrying #599) went live at ~05:44 UTC.

**Verified recovered:** `/api/health` `status: ok`; process uptime climbed cleanly past the ~20-min OOM cadence with no reset; connection pool healthy (0 errors, 0 exhaustion); storage back to **5.3%** of the 20 GB volume (down from the 91% / 8.1 GB ENOSPC that started the disk side of the incident).

## Lessons

- **A merged fix is not a deployed fix.** Production can silently lag `main` when a deploy fails in a pre-deploy gate. Incident verification must check the *running deploy's commit* (`railway status --json` → `activeDeployments[].meta.commitHash`) against `main`, not just "did the PR merge."
- **Deploy gates need loud, specific failures.** The migration refusal printed to deploy logs but did not page; the crash loop masked it. Consider alerting when consecutive deploys fail in `preDeployCommand`.
- **Keyword guards over SQL must be quote/comment-aware.** Matching a keyword against raw migration text caused this; the inverse (matching a keyword inside a string literal) would *silently defer* a safe migration. Detection now neutralizes comments and quoted text and matches `CONCURRENTLY` only as a bare keyword (see `stripCommentsAndQuotedText` in `migrate.cjs`).
- **Keep the self-revive cushion until the real fix is confirmed deployed.** The high restart-retry cap is a band-aid, but it bought the time to land #606.

## Follow-ups

- [x] Detect `CONCURRENTLY` only in executable SQL; defer genuine cases (#606).
- [x] Harden detection against `CONCURRENTLY` inside string literals / quoted identifiers / dollar-quoted bodies (this PR) — prevents *false deferral* of transaction-safe migrations.
- [ ] Alert on repeated `preDeployCommand` failures so a stuck deploy pages instead of hiding behind a crash loop.
- [ ] Confirm the deferred retention indexes are applied out-of-band on the production volume (runbook `concurrent-index-migrations.md`) and recorded in `_prisma_migrations`.
