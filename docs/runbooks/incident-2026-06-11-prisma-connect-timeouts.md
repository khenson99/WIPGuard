# Incident: Prisma connect timeouts break sign-in (2026-06-11 07:49–07:54 UTC)

**Status:** root-caused. Connection-path mitigations in this PR; disk growth (#584) and restart cap (#593) already merged to main; volume resize + OOM leak still open.
**Impact:** ~3 minutes of failed DB-dependent requests on the freshly deployed app container: NextAuth `jwt` callback (every session evaluation), `POST /api/analytics/funnel/collect`, at least one server render (Next digest `3283727050`). Google sign-in failed after a successful token exchange because the adapter could not persist the sign-in.
**Separately discovered during investigation:** the app OOM-crashed 11× the same day (heap → 4 GB limit, ~every 40–50 min) and exhausted `restartPolicyMaxRetries: 10` at 15:56 UTC, leaving the service hard-down until a manual redeploy at 19:42 UTC. The OOM leak that #578/#579 declared fixed is not fixed.

## Timeline (UTC, 2026-06-11)

| Time | Event |
|---|---|
| 07:40:59 | Deploy `33105597` created (commit `8c745e20`, "Close Imladris dashboards handoff gaps") |
| 07:42:28 | Postgres time-based checkpoint starts (wrote 70.9% of shared buffers) |
| 07:46:00 | **Old container stopped** (deploy `2f7cfe98`) — before the new pool ever initialized |
| 07:46:01 | New container: migrations already applied (DB reachable), `Starting server...`, Ready in 60ms, `/api/health/live` passes (no DB dependency) — traffic flips |
| 07:49:30 | First DB-touching request → lazy pool init: `[Prisma] Initialized with pool size: 25 ... connection timeout: 10000ms` |
| ~07:50 | `wipguard-cron-sync` fires (`*/10` schedule); morning dashboard/analytics traffic arrives |
| 07:51:03 | First `Error: timeout exceeded when trying to connect` (pg-pool checkout timeout, 10s) |
| 07:51:09–07:53+ | Burst: `jwt callback error`, `POST /api/analytics/funnel/collect error`, server-render failure — all the same pg-pool error |
| 07:51:57–07:52:24 | **Postgres: `ERROR: could not write to file "base/pgsql_tmp/..." : No space left on device`** across 6 backend PIDs |
| ~07:54 | Failed queries release their temp files; connects succeed again; errors stop |
| 07:54:07 / 07:57:34 | Next deploys (`24b11e35`, `2d1ebbbf`) — unrelated to recovery (their containers weren't live yet) |

## Root cause

**Postgres data-volume exhaustion, not connection-count pressure.**

The Railway Postgres volume (19.5 GB) was at ~95–96% (18.6–18.8 GB peak that day). Concurrent analytics/sync queries spilled sort/hash temp files into `base/pgsql_tmp`, hit `No space left on device`, and saturated volume I/O. While the disk was thrashing, *new* backend establishment (fork + auth + first catalog reads) stalled past the pg pool's 10 s `connectionTimeoutMillis`, so every checkout of a fresh connection failed with `timeout exceeded when trying to connect`. Established connections were unaffected (`pool.on('error')` never fired) — but the new container had none yet.

The dominant disk consumer is one table: **`ImladrisMetricLineage` = 15 GB** of the 18.6 GB used, for 1,202,264 live rows (~98 metric values × ~12 K lineage rows each). `last_autovacuum` is NULL — autovacuum has never completed on it — and it is rewritten via delete-all + `createMany` (`replaceLineage()` in `src/lib/imladris/materialization.ts`) on every worker/cron materialization pass. `pg_stat_database` shows 23 GB of cumulative temp-file writes, i.e. big sorts against this table are routine. Live data is plausibly a few hundred MB; the rest is bloat.

### Why it hit the new container so hard

1. `/api/health/live` (the Railway deploy gate) is deliberately DB-free. Railway flipped traffic to the new container at 07:46 and stopped the old one, while the new container's pool was **cold** — it didn't even initialize until the first DB request at 07:49:30.
2. First user requests then had to pay fresh TCP+TLS+auth handshakes *during* the I/O stall. A 25-max pool under burst load issues many simultaneous establishment attempts against a struggling server.
3. There was **no retry**: a single 10 s checkout timeout propagated straight into the NextAuth `jwt` callback (which runs `prisma.user.findUnique` on every session evaluation), the funnel collector, and SSR.

### Hypotheses ruled out

- **Deploy-overlap connection stampede:** No. The old container stopped at 07:46:00, ~3.5 min before the new pool initialized. `max_connections = 100`; steady-state usage is ~5 connections; sum of all pools (app 25 + worker 5 + cron) never approaches it; Postgres logged zero "too many clients" errors.
- **Postgres redeploy reduced capacity:** No. The 2026-06-10 17:16 UTC redeploy kept the same image (`postgres-ssl:17.10`) and settings; the volume limit was unchanged.
- **Crash restart at 07:49:** No. The container start was deploy `33105597` going live (created 07:40:59 + build time). The OOM crash loop is real but distinct — it began after the 07:57 deploy and is tracked separately.

## Fixes in this PR

| Change | File | Effect |
|---|---|---|
| Bounded retry (default 2, exp backoff + jitter) for transient connection-acquisition failures | `src/lib/db-connect-retry.ts`, `src/lib/prisma.ts` (`ResilientPool`) | A 10 s stall no longer instantly fails sign-in; acquisition is idempotent so retrying is always safe. Tunable via `DB_CONNECT_RETRIES`, `DB_CONNECT_RETRY_BASE_DELAY_MS`. |
| Pool floor `min: 1` (`DB_POOL_MIN`) | `src/lib/prisma.ts` | The idle reaper keeps ≥1 established connection once the pool is in use, so quiet periods don't force cold handshakes. |
| Un-latch sticky "critical" pool status (60 s recency window) | `src/lib/pool-monitor.ts` | Previously one >5 s wait latched `/api/health` to a false 503 for the life of the process — wrong for any monitor/alert consuming it. Now tracks live conditions. Adds a `totalConnectRetries` counter. |

**Considered and dropped — boot-time pool warm-up:** an `instrumentation.ts` `register()` hook would establish the pool at boot so the first connection isn't created inside a user request. Next compiles `instrumentation.ts` for **both** the Node and Edge runtimes, and `serverExternalPackages` externalizes `pg` only for the Node server — so any path from instrumentation to `pg` (even a `NEXT_RUNTIME`-guarded dynamic `import()`, and even one extra file deep) makes the Edge build fail to resolve `pg`'s `require('fs'/'path'/'stream')`. Verified locally with `next build --webpack`. The connect **retry** already lets a cold container ride out a startup stall instead of failing, so warm-up was net-negative here. (Note: unit tests don't catch this — only `next build` exercises the Edge compilation.)

**Deliberately *not* changed — deploy-gate `healthcheckPath` stays `/api/health/live`** (DB-free). Gating it on the DB-dependent `/api/health` was considered — it would stop traffic flipping to a container that can't reach the DB — but the app is currently in an active OOM-restart loop (see #593) where revival speed is paramount, and a DB-dependent gate risks slowing crash-revival during a compound DB+process failure. With the connect retry in place, a cold container now recovers gracefully instead of failing, so the gate change isn't needed to prevent this incident. Revisit once the OOM leak is fixed.

**Verification:** `/api/health` (DB + pool status) and `/api/health/auth` (sign-in readiness) on https://wipguard-app-production.up.railway.app, plus `[Prisma] Initialized with pool size: 25 (min: 1) ... connect retries: 2` in deploy logs. A future stall should surface as `[Prisma] Transient DB connect failure (attempt 1/3)...` warnings with requests succeeding, and `totalConnectRetries` in `/api/health` output.

## Related work already merged to main

These landed independently while this fix was in flight and address the *causes* this PR only mitigates:

- **#584** — DB growth controls: `ImladrisMetricLineage` TTL + per-source write cap (bounds the delete-all+reinsert churn), `OutboxEvent` retention, metric-value thinning. Ops runbook `docs/db-growth-controls.md` covers VACUUM/pg_repack reclaim of existing bloat.
- **#593** — `restartPolicyMaxRetries` 10 → 250, so OOM cycles self-revive instead of stranding prod down (this is why this PR no longer touches `railway.json`).
- **#590 / #592** — gate the custom next-auth debug logger on `NEXTAUTH_DEBUG` so provider secrets stop leaking into production logs.

## Follow-ups (still open)

1. **Resize the Postgres volume** — owner action, Railway dashboard (paid; agent will not do this). Most urgent: still ~95% full until #584's retention drains the backlog and the space is reclaimed.
2. **OOM leak hunt** (`HEAP_CAPTURE_RUNBOOK.md`): heap grows to the 4 GB limit in ~20–50 min of serving. #578's fix was insufficient; #593 is only a stopgap.
3. Optional: set `DB_POOL_MAX` lower (e.g. 10) via Railway env to cap simultaneous cold handshakes; current default 25 is generous for one replica.
