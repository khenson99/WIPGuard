# Runbook: deferred `CONCURRENTLY` migrations

## Why this exists

The custom migration runner (`migrate.cjs`) wraps every migration in a
`BEGIN/COMMIT` transaction. Postgres forbids `CREATE INDEX CONCURRENTLY` (and
other `CONCURRENTLY` DDL) inside a transaction, so the runner **defers** any
migration whose SQL uses `CONCURRENTLY`:

- It is **skipped** at `preDeployCommand` / boot (logged as `defer: <name> uses
  CONCURRENTLY …`) and **never recorded** as applied — so a deploy is never
  blocked by it.
- `migrate.cjs --check` excludes it from the "pending" set (reported separately
  as `deferred CONCURRENTLY migration(s)`), so the fast boot path stays "current".
- It must be applied **out-of-band** (below), then recorded.

> Detection strips SQL comments first, so a migration that merely *mentions*
> `CONCURRENTLY` in a comment is **not** deferred. (That false positive once
> blocked a transaction-safe migration and took down every deploy.)

## Applying a deferred migration out-of-band

These index builds are non-locking (`CONCURRENTLY`) and idempotent
(`IF NOT EXISTS`), so they are safe to run on the live database during normal
traffic.

1. Open a psql session on the production database (Railway dashboard → Postgres
   → Connect, or `railway connect Postgres`).
2. Run the statements from the migration file, e.g.
   `prisma/migrations/20260615120000_add_retention_prune_indexes/migration.sql`:
   ```sql
   CREATE INDEX CONCURRENTLY IF NOT EXISTS "SecurityAuditEvent_createdAt_idx" ON "SecurityAuditEvent"("createdAt");
   CREATE INDEX CONCURRENTLY IF NOT EXISTS "ImladrisSourceSyncRun_startedAt_idx" ON "ImladrisSourceSyncRun"("startedAt");
   CREATE INDEX CONCURRENTLY IF NOT EXISTS "ImladrisRawSourceRecord_createdAt_idx" ON "ImladrisRawSourceRecord"("createdAt");
   ```
   Run each on its own (CONCURRENTLY can't be inside a transaction/`psql -1`).
3. If a build fails it can leave an `INVALID` index — drop it and retry:
   ```sql
   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
   -- DROP INDEX CONCURRENTLY "<invalid_index>"; then re-run the CREATE.
   ```
4. (Optional) Record it so `--check` stops listing it as deferred:
   ```sql
   INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
   VALUES (gen_random_uuid(), 'out-of-band', now(), '20260615120000_add_retention_prune_indexes', 1);
   ```
   (Idempotent `IF NOT EXISTS` means skipping this step is harmless — the
   deploy is never blocked either way.)

## Authoring new index migrations

- Prefer `CREATE INDEX CONCURRENTLY IF NOT EXISTS` for any index on a large
  table — it avoids the write-blocking `SHARE` lock a plain `CREATE INDEX`
  takes. Accept that it will be **deferred** and applied out-of-band per above.
- Use a plain `CREATE INDEX` only for small/new tables where a brief lock is
  fine and you want it applied automatically at deploy.
