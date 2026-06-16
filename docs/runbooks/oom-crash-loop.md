# Runbook: WIPGuard-app OOM crash loop (cron sync memory)

**Status:** code fix shipped. If prod is currently hard-down, redeploy to restore
service (operator action) — the fix prevents the loop from recurring.

## Symptom

`WIPGuard-app` OOMs (`FATAL ERROR: Reached heap limit Allocation failed -
JavaScript heap out of memory`, heap ~4 GB) after ~19–25 minutes of uptime,
**even overnight with no user traffic**. Logs show `integration.orchestrator.rule_failed`
and other sync activity firing continuously right up to each crash. After the
`ON_FAILURE` restart retries (`railway.json`, 10) are exhausted, prod serves only
502s until someone redeploys. Observed 2026-06-11 22:37 → 2026-06-12 00:03 UTC.

This is distinct from the deploy-time outage in
[deploy-downtime.md](deploy-downtime.md) (that one is about the volume blocking
overlapped deploys). PR #578 ("Fix CI gate + WIPGuard-app OOM crash loop")
bounded *two* analyticsSnapshot loads but did not fully resolve the OOM.

## Root cause (verified by code analysis)

The periodic sync (`POST /api/cron/sync`, fired by Railway cron
`railway/cron-sync/railway.json` every 10 minutes) had two compounding problems:

1. **No overlap guard.** The route returns `202` immediately and runs the heavy
   work in a Next.js `after()` background task. With no lock, a cycle that runs
   longer than the 10-minute interval overlaps the next one. Because each cycle
   holds large data in memory, stacked cycles make the heap climb **monotonically**
   (not sawtooth) to the V8 limit — hence OOM after ~2 cycles regardless of user
   traffic.
2. **Unbounded internal concurrency over large payloads.** Per cycle, for every
   connected user, `materializeImladrisCanonicalMetrics` ran **6 metric calculators
   concurrently** (`Promise.all`), each doing `ImladrisRawSourceRecord.findMany`
   over a 30-day window **with full JSON payloads** (no `select`). And
   `runImladrisMaterializationSync` ran that **concurrently across all users**
   (`Promise.all(contexts.map(...))`). Peak resident set ≈
   `users × 6 × (30-day payload window)` — multiple gigabytes.

(The earlier `HEAP_CAPTURE_RUNBOOK.md` note that the app "leaks only on
authenticated `/api/analytics`" was incomplete — the dominant pressure is the
background cron sync, which is why crashes happen overnight.)

## Fix (this PR)

| Change | Effect |
| --- | --- |
| `src/lib/sync/sync-lock.ts` (new) + `src/lib/prisma.ts` (`getConnectionPool`) | `withSyncAdvisoryLock()` — a global Postgres `pg_try_advisory_lock` (keyed `WIPG`/`SYNC`, distinct from migrate.cjs's `WIPG`/`MIGR`) on a single pinned pool connection. Bounds concurrent sync cycles to **one**, converting the monotonic heap climb into a sawtooth. |
| `src/app/api/cron/sync/route.ts` | Runs `executeCronSync` under the lock; an overlapping cycle returns `{ ok: true, skipped: true }` instead of stacking. |
| `src/lib/imladris/materialization.ts` | The 6 metric calculators now run **sequentially** — only one 30-day payload window is resident at a time (≈6× peak reduction per user). |
| `src/lib/sync/analytics.ts` | Users materialize **sequentially** instead of all at once (removes the per-user multiplier). |
| `src/lib/integrations/slack-notifications.ts` | Secondary: the in-memory Slack throttle `Map` now evicts idle channels in `recordSend`, so it can't grow unbounded over the process lifetime. |

Trade-off: sequencing makes a cycle slower in wall-clock; the advisory lock
absorbs this by skipping overlapping cron fires. Correctness (no OOM) over
freshness.

## Verification

After deploying the fix (and, if prod is down, an operator redeploy):

```bash
# 1) liveness should hold steady, not flap on a ~20-min cycle
while true; do
  printf '%s %s\n' "$(date -u +%H:%M:%S)" \
    "$(curl -s -o /dev/null -w '%{http_code}' https://wipguard-app-production.up.railway.app/api/health)"
  sleep 30
done
```

- Watch `railway logs --service WIPGuard-app`: heap RSS should **sawtooth** (rise
  during a sync, fall after GC), never march monotonically toward ~4 GB.
- Expect occasional `POST /api/cron/sync skipped: another sync cycle is already
  running` when a cycle overruns 10 min — that is the guard working, not an error.
- No `FATAL ERROR: Reached heap limit` for >1 hour across several cron cycles.
- `/api/health` connection-pool block stays `healthy`/`warning`, never `critical`.

## Emergency levers (operator)

- **Restore service now:** `railway redeploy --service WIPGuard-app -y`. Without
  this fix it resumes the ~20-min crash cycle; with it, it stays up.
- **Temporary headroom (stopgap only):** raising `NODE_OPTIONS=--max-old-space-size=<MB>`
  only helps if the container has spare RAM and merely delays OOM — prefer the
  memory-bounding fix above.

## Follow-ups (not in this PR)

- **`ImladrisRawSourceRecord` is never pruned** — it grows forever. The
  materialization read is 30-day-bounded so this isn't the acute OOM driver, but
  it inflates table size and the steady-state 30-day window. Add a pruning step
  (mirroring `pruneAnalyticsSnapshots`) **after** auditing all readers
  (`company-goals.ts`, `investor-dashboard-export.ts`, `expense-dashboard.ts`,
  monthly history back to 2025-01-01) so longer-range features don't lose data.
- **Worker service** (`Dockerfile.worker`) also runs sync; if it is enabled,
  wrap its sync entrypoint in `withSyncAdvisoryLock` so it can't run a cycle
  concurrently with the web cron.
- Consider `select`-projecting only the payload fields the calculators use, to
  cut per-row weight further (larger refactor — calculators read payloads deeply).
