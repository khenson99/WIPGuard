-- Pre-build the ImladrisRawSourceRecord.updatedAt retention index WITHOUT
-- blocking sync writes.
--
-- WHY: production deploys auto-run migrate.cjs on push to main, which applies
-- Prisma migrations inside a transaction. An in-transaction `CREATE INDEX` on
-- this large, continuously-written table takes an ACCESS EXCLUSIVE lock for the
-- entire build, and migrate.cjs additionally refuses any migration containing
-- the CONCURRENTLY keyword. So build the index here first; the migration
-- 20260615120000_add_imladris_raw_source_record_retention_index uses
-- `CREATE INDEX IF NOT EXISTS`, so it then no-ops instead of taking the lock.
--
-- HOW: run against the production database BEFORE that migration deploys
-- (i.e. before merging to main). CONCURRENTLY cannot run inside a transaction,
-- so run it via psql, which autocommits each statement:
--
--   psql "$DATABASE_URL" -f scripts/ops/20260615120000_imladris_raw_source_record_updatedat_index.lockfree.sql
--
-- If the build is interrupted, Postgres can leave an INVALID index behind.
-- Drop it and re-run:
--   DROP INDEX IF EXISTS "ImladrisRawSourceRecord_updatedAt_idx";

CREATE INDEX CONCURRENTLY IF NOT EXISTS "ImladrisRawSourceRecord_updatedAt_idx"
  ON "ImladrisRawSourceRecord" ("updatedAt");
