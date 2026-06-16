-- Indexes supporting the database retention/pruning job (src/lib/db-pruning/).
-- Each prune predicate filters a single timestamp (createdAt / startedAt) <
-- cutoff, but no existing index on these tables leads with a plain timestamp
-- column, so the prune would otherwise seq-scan.
--
-- IF NOT EXISTS makes this migration idempotent: on the large existing tables
-- an operator MAY pre-create these indexes by hand with
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "<name>" ON "<table>"("<col>");
-- during a low-traffic window to avoid the brief write-lock a non-concurrent
-- CREATE INDEX takes (this migration runs inside a transaction — the custom
-- runner in migrate.cjs refuses CONCURRENTLY — so the build holds a SHARE
-- lock for its duration). If pre-created, the statements below no-op.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SecurityAuditEvent_createdAt_idx" ON "SecurityAuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ImladrisSourceSyncRun_startedAt_idx" ON "ImladrisSourceSyncRun"("startedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ImladrisRawSourceRecord_createdAt_idx" ON "ImladrisRawSourceRecord"("createdAt");
