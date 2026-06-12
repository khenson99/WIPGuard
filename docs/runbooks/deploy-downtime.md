# Runbook: Deploy-time 502 outage (volume blocks overlapped deploys)

**Status:** waiting on one operator dashboard action (volume detach). All repo-side changes shipped.

## Symptom

Every production deploy of `WIPGuard-app` (Railway project `WIPGuard`) causes a brief
full outage: public 502s, broken Google sign-in, and a burst of Prisma
`timeout exceeded when trying to connect` errors. Confirmed live twice on
2026-06-11 (~07:49–07:58 UTC and ~19:44 UTC) — it reproduces on **every** deploy,
not just bad ones.

## Root cause (verified)

1. **A Railway volume forces stop-then-start deploys.** The volume
   `wipguard-app-volume` is attached to `WIPGuard-app` at `/app/snapshots`.
   Railway volumes are single-attach: the old container must release the volume
   before the new one can mount it, so Railway stops the old deploy *before*
   starting the new one. The configured healthcheck (`/api/health/live`,
   `railway.json`) gates when the new deploy is considered ready, but it cannot
   create overlap — there is always a window with zero serving containers.
2. **The boot sequence stretches that window.** `docker-entrypoint.sh` ran the
   full strict-mode migration pass (`migrate.cjs`: connect → advisory lock →
   table bootstrap → per-migration loop) before `node server.js`, and the
   healthcheck only passes after Next.js is up.
3. **The reconnect stampede causes the Prisma error burst.** The new container
   boots with a cold pg pool (max 25, connect timeout 10s — `src/lib/prisma.ts`).
   The first wave of traffic makes every request open a fresh TCP+TLS socket at
   once; checkouts that wait >10s surface as `timeout exceeded when trying to
   connect` (and sign-in callbacks die mid-flight, see commit `2e0513d1`).

## What is on the volume, and why it is safe to detach

- Contents: ~1 GB of V8 heap snapshots captured during the June 2026 OOM/leak
  investigation ([HEAP_CAPTURE_RUNBOOK.md](../../HEAP_CAPTURE_RUNBOOK.md),
  PR #578). The volume existed only so snapshots survived redeploys long enough
  to copy out.
- **Nothing in the app reads or writes `/app/snapshots`.** Verified:
  - `git log --all -S "app/snapshots"` → zero commits; the mount path was never
    referenced in code, only in the Railway dashboard volume config.
  - `grep -r snapshots src/ scripts/ Dockerfile docker-entrypoint.sh` → only
    analytics-domain "snapshots" (database rows), no filesystem use.
  - Current capture tooling (`capture-leak.sh`) writes to `/tmp` and copies out
    immediately via `railway ssh` — it does not need a volume.
- The investigation those snapshots served is closed (unbounded
  `analyticsSnapshot` loads fixed in #578), so they are only worth keeping as
  historical baselines.

### Salvage the snapshots first (optional)

```bash
railway link                                   # WIPGuard project, production env
railway ssh --service WIPGuard-app "ls -lah /app/snapshots"
railway ssh --service WIPGuard-app "tar czf - -C /app snapshots" \
  > wipguard-heap-snapshots-$(date +%Y%m%d).tgz
tar tzf wipguard-heap-snapshots-*.tgz          # verify before detaching
```

Heap snapshots are JSON and compress well; expect the transfer to be much
smaller than the 1 GB on disk. If the baselines aren't worth keeping, skip
this and delete the volume outright.

## Operator checklist (dashboard actions — intentionally not automated)

1. *(Optional)* Salvage the snapshots as above.
2. Railway dashboard → project **WIPGuard** → service **WIPGuard-app** →
   volume **wipguard-app-volume** → **Disconnect** (or delete the volume if the
   snapshots are not worth keeping). This is the step that unlocks overlapped
   deploys.
3. While in service settings, check **Variables** for debugging leftovers that
   point at the mount (e.g. `NODE_OPTIONS` containing `--diagnostic-dir` or
   `--heapsnapshot-signal`). Remove if present.
4. Deploy (any deploy after the detach picks up overlap). Merge order vs. the
   detach does not matter: the `railway.json` overlap settings are inert while
   a volume is attached, and `preDeployCommand` is beneficial either way.
5. Verify (below) across **two** consecutive deploys, since the outage
   reproduced on every deploy.

## Repo-side changes that pair with the detach

| Change | Effect |
| --- | --- |
| `railway.json` → `preDeployCommand: node /app/migrate.cjs` | Migrations run in a one-off container **while the previous deploy is still serving**. A failed migration now aborts the deploy and leaves the old version up (previously the old container was already gone and the new one crash-looped through the outage). |
| `railway.json` → `overlapSeconds: 60`, `drainingSeconds: 30` | Once volume-free: the previous deploy keeps serving 60s after the new one passes its healthcheck, then gets SIGTERM with a 30s drain before SIGKILL. |
| `docker-entrypoint.sh` strict mode | Boot now runs `migrate.cjs --check` (one connection, one read-only query) and skips the full lock+apply pass when the schema is current — which is always, on Railway, because preDeploy applied it. Pending/unverifiable schema still falls through to the full strict run; failures still abort boot, so `MIGRATIONS_MODE=strict` semantics are unchanged. |
| `src/lib/prisma.ts` + `src/lib/prisma-connect-retry.ts` | Boot stampede softening: the pool pre-warms a few connections (`DB_POOL_WARMUP`, default 4) and every operation retries **only** connection-acquisition timeouts (pool checkout / TLS handshake — failures that occur before a query is dispatched, so retries can never double-apply a write). `DB_CONNECT_ACQUIRE_RETRIES` (default 2) tunes it. |

## Verification

Run a probe loop in one terminal while triggering a redeploy in another:

```bash
while true; do
  printf '%s %s\n' "$(date -u +%H:%M:%S)" \
    "$(curl -s -o /dev/null -w '%{http_code}' https://wipguard-app-production.up.railway.app/api/health)"
  sleep 2
done
```

- Expect an unbroken run of `200`s through the entire deploy — no `502`s.
- Deploy logs should show the pre-deploy migration step, then
  `Schema check: current (...)` and `Migrations current; skipping apply` at boot,
  then `[Prisma] Warmed 4 pool connection(s)` shortly after.
- Sign-in readiness: `curl -s https://wipguard-app-production.up.railway.app/api/health/auth`
  → `status: "ok"`, `checks.migrations.failed: 0`; do one real Google sign-in.
- No `timeout exceeded when trying to connect` burst in logs during cutover.

## Rollback

- Remove `overlapSeconds` / `drainingSeconds` / `preDeployCommand` from
  `railway.json` to restore the previous deploy lifecycle.
- The entrypoint fast path needs no rollback: without preDeploy, the `--check`
  finds pending migrations and the full strict run applies them at boot exactly
  as before.
- If heap capture is ever needed again, prefer the volume-less flow in
  [HEAP_CAPTURE_RUNBOOK.md](../../HEAP_CAPTURE_RUNBOOK.md) (`/tmp` + immediate
  copy-out). Re-attaching a volume reintroduces deploy downtime.
