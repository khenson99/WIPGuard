-- Indexes supporting the database retention/pruning job (src/lib/db-pruning/).
-- Each prune predicate filters a single timestamp (createdAt / startedAt) <
-- cutoff, but no existing index on these tables leads with a plain timestamp
-- column, so the prune would otherwise seq-scan.
--
-- These build CONCURRENTLY so creating them on the (large, post-incident)
-- target tables does NOT take a write-blocking lock. CONCURRENTLY cannot run
-- inside a transaction, and the custom runner (migrate.cjs) wraps each
-- migration in BEGIN/COMMIT — so the runner DEFERS this migration: it is
-- skipped at preDeploy/boot (never blocks a deploy) and must be applied
-- OUT-OF-BAND, then recorded in _prisma_migrations.
-- See docs/runbooks/concurrent-index-migrations.md.
--
-- IF NOT EXISTS keeps it idempotent so an out-of-band run (or re-run) no-ops.

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SecurityAuditEvent_createdAt_idx" ON "SecurityAuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ImladrisSourceSyncRun_startedAt_idx" ON "ImladrisSourceSyncRun"("startedAt");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ImladrisRawSourceRecord_createdAt_idx" ON "ImladrisRawSourceRecord"("createdAt");
