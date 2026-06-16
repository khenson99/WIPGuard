/**
 * One-time cleanup for the June 2026 Postgres disk incident.
 *
 * Drains the historical backlog that accumulated before the periodEnd fix
 * and the data-retention sweep shipped:
 *
 *   1. ImladrisMetricLineage rows attached to SUPERSEDED canonical metric
 *      values (every pre-fix sync run minted a new metric value with a full
 *      lineage copy — ~41.5M rows / ~15 GB as of 2026-06-11). The latest
 *      metric value per (organizationId, userId, metricKey) keeps its
 *      lineage; superseded values keep their computed value but lose the
 *      duplicated evidence rows.
 *   2. Superseded canonical metric value rows older than --keep-metric-days
 *      (their lineage is removed first so the ON DELETE CASCADE is a no-op).
 *   3. OutboxEvent DEAD_LETTER rows older than --outbox-dead-letter-days and
 *      DISPATCHED rows older than --outbox-dispatched-days (~905K rows /
 *      ~660 MB as of 2026-06-11).
 *
 * SAFETY
 *   - DRY-RUN BY DEFAULT: prints what would be deleted and exits.
 *     Pass --execute to actually delete. Run it against production only
 *     after explicit operator approval.
 *   - All deletes are batched (default 20K rows per statement) so locks and
 *     WAL stay bounded while the app is live.
 *   - Deleting rows does NOT shrink the volume: Postgres keeps the freed
 *     pages for reuse. To hand space back to the OS, run the VACUUM FULL
 *     step printed at the end during a maintenance window (it takes an
 *     ACCESS EXCLUSIVE lock; after this cleanup the surviving rows are
 *     small, so the rewrite is fast).
 *
 * USAGE
 *   npm run ops:db-disk-cleanup                       # dry run (counts only)
 *   npm run ops:db-disk-cleanup -- --execute          # delete with defaults
 *   npm run ops:db-disk-cleanup -- --execute \
 *     --keep-lineage-days 7 --outbox-dead-letter-days 30 --batch-size 20000
 *
 * See docs/runbooks/postgres-disk-incident-2026-06.md for the full runbook.
 */

import { prisma } from "@/lib/prisma";

interface CliOptions {
  execute: boolean;
  batchSize: number;
  /** Superseded metric values older than this keep no lineage. */
  keepLineageDays: number;
  /** Superseded metric values older than this are deleted entirely. */
  keepMetricDays: number;
  outboxDeadLetterDays: number;
  outboxDispatchedDays: number;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    execute: false,
    batchSize: 20_000,
    keepLineageDays: 7,
    keepMetricDays: 365,
    outboxDeadLetterDays: 30,
    outboxDispatchedDays: 14,
  };

  const numberFlag = (flag: string, current: number): number => {
    const index = argv.indexOf(flag);
    if (index === -1) return current;
    const parsed = Number(argv[index + 1]);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`${flag} expects a positive number, got "${argv[index + 1]}"`);
    }
    return Math.floor(parsed);
  };

  options.execute = argv.includes("--execute");
  options.batchSize = numberFlag("--batch-size", options.batchSize);
  options.keepLineageDays = numberFlag("--keep-lineage-days", options.keepLineageDays);
  options.keepMetricDays = numberFlag("--keep-metric-days", options.keepMetricDays);
  options.outboxDeadLetterDays = numberFlag(
    "--outbox-dead-letter-days",
    options.outboxDeadLetterDays,
  );
  options.outboxDispatchedDays = numberFlag(
    "--outbox-dispatched-days",
    options.outboxDispatchedDays,
  );
  return options;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function formatGb(bytes: number | null): string {
  if (bytes === null) return "n/a";
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

async function databaseSizeBytes(): Promise<number | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ size: bigint }>>(
      `SELECT pg_database_size(current_database())::bigint AS size`,
    );
    return rows.length > 0 ? Number(rows[0].size) : null;
  } catch {
    return null;
  }
}

async function countRows(sql: string, ...params: unknown[]): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(sql, ...params);
  return rows.length > 0 ? Number(rows[0].count) : 0;
}

/** Delete rows matching the predicate in batches; returns rows deleted. */
async function deleteInBatches(input: {
  table: string;
  predicateSql: string;
  params: unknown[];
  batchSize: number;
  label: string;
}): Promise<number> {
  let total = 0;
  for (;;) {
    const affected = await prisma.$executeRawUnsafe(
      `DELETE FROM "${input.table}" WHERE "id" IN (SELECT "id" FROM "${input.table}" WHERE ${input.predicateSql} LIMIT $${input.params.length + 1})`,
      ...input.params,
      input.batchSize,
    );
    total += affected;
    if (total > 0 && total % 200_000 < input.batchSize) {
      console.info(`[db-cleanup]   ${input.label}: ${total.toLocaleString()} rows deleted so far...`);
    }
    if (affected < input.batchSize) return total;
  }
}

const SUPERSEDED_PREDICATE = `
  "periodEnd" < $1
  AND EXISTS (
    SELECT 1 FROM "ImladrisCanonicalMetricValue" newer
    WHERE newer."metricKey" = "ImladrisCanonicalMetricValue"."metricKey"
      AND newer."organizationId" IS NOT DISTINCT FROM "ImladrisCanonicalMetricValue"."organizationId"
      AND newer."userId" IS NOT DISTINCT FROM "ImladrisCanonicalMetricValue"."userId"
      AND newer."periodEnd" > "ImladrisCanonicalMetricValue"."periodEnd"
  )
`;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const lineageCutoff = daysAgo(options.keepLineageDays);
  const metricCutoff = daysAgo(options.keepMetricDays);
  const deadLetterCutoff = daysAgo(options.outboxDeadLetterDays);
  const dispatchedCutoff = daysAgo(options.outboxDispatchedDays);

  console.info("[db-cleanup] mode:", options.execute ? "EXECUTE (will delete rows)" : "DRY RUN (counts only — pass --execute to delete)");
  console.info("[db-cleanup] options:", JSON.stringify(options));

  const sizeBefore = await databaseSizeBytes();
  console.info(`[db-cleanup] database size: ${formatGb(sizeBefore)}`);

  // ── 1. Superseded metric values and their lineage ────────────────────────
  const supersededValues = await countRows(
    `SELECT count(*)::bigint AS count FROM "ImladrisCanonicalMetricValue" WHERE ${SUPERSEDED_PREDICATE}`,
    lineageCutoff,
  );
  const supersededLineage = await countRows(
    `SELECT count(*)::bigint AS count FROM "ImladrisMetricLineage" l
     WHERE EXISTS (
       SELECT 1 FROM "ImladrisCanonicalMetricValue"
       WHERE "ImladrisCanonicalMetricValue"."id" = l."metricValueId" AND ${SUPERSEDED_PREDICATE}
     )`,
    lineageCutoff,
  );
  console.info(
    `[db-cleanup] superseded metric values (periodEnd < ${lineageCutoff.toISOString()}): ${supersededValues.toLocaleString()} rows, carrying ${supersededLineage.toLocaleString()} lineage rows`,
  );

  // Orphaned lineage (metric value no longer exists) — defensive sweep.
  const orphanedLineage = await countRows(
    `SELECT count(*)::bigint AS count FROM "ImladrisMetricLineage" l
     WHERE NOT EXISTS (SELECT 1 FROM "ImladrisCanonicalMetricValue" c WHERE c."id" = l."metricValueId")`,
  );
  console.info(`[db-cleanup] orphaned lineage rows: ${orphanedLineage.toLocaleString()}`);

  // ── 2. Outbox backlog ─────────────────────────────────────────────────────
  const deadLetters = await countRows(
    `SELECT count(*)::bigint AS count FROM "OutboxEvent" WHERE "status" = 'DEAD_LETTER' AND "createdAt" < $1`,
    deadLetterCutoff,
  );
  const dispatched = await countRows(
    `SELECT count(*)::bigint AS count FROM "OutboxEvent" WHERE "status" = 'DISPATCHED' AND "dispatchedAt" < $1`,
    dispatchedCutoff,
  );
  console.info(`[db-cleanup] outbox DEAD_LETTER older than ${options.outboxDeadLetterDays}d: ${deadLetters.toLocaleString()} rows`);
  console.info(`[db-cleanup] outbox DISPATCHED older than ${options.outboxDispatchedDays}d: ${dispatched.toLocaleString()} rows`);

  if (!options.execute) {
    console.info("[db-cleanup] DRY RUN complete. Re-run with --execute (after operator approval) to delete the rows above.");
    return;
  }

  // ── Execute ───────────────────────────────────────────────────────────────
  console.info("[db-cleanup] deleting lineage for superseded metric values (batched per metric value)...");
  let lineageDeleted = 0;
  for (;;) {
    // The candidate set shrinks as lineage is deleted (the EXISTS-lineage
    // clause stops matching), so plain LIMIT pagination converges.
    const candidates = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "ImladrisCanonicalMetricValue"
       WHERE ${SUPERSEDED_PREDICATE}
         AND EXISTS (SELECT 1 FROM "ImladrisMetricLineage" l WHERE l."metricValueId" = "ImladrisCanonicalMetricValue"."id")
       ORDER BY "periodEnd" ASC LIMIT 500`,
      lineageCutoff,
    );
    if (candidates.length === 0) break;
    for (const candidate of candidates) {
      lineageDeleted += await deleteInBatches({
        table: "ImladrisMetricLineage",
        predicateSql: `"metricValueId" = $1`,
        params: [candidate.id],
        batchSize: options.batchSize,
        label: "superseded lineage",
      });
    }
    console.info(`[db-cleanup]   superseded lineage: ${lineageDeleted.toLocaleString()} rows deleted so far`);
  }
  console.info(`[db-cleanup] superseded lineage deleted: ${lineageDeleted.toLocaleString()} rows`);

  console.info("[db-cleanup] deleting orphaned lineage...");
  const orphansDeleted = await deleteInBatches({
    table: "ImladrisMetricLineage",
    predicateSql: `NOT EXISTS (SELECT 1 FROM "ImladrisCanonicalMetricValue" c WHERE c."id" = "ImladrisMetricLineage"."metricValueId")`,
    params: [],
    batchSize: options.batchSize,
    label: "orphaned lineage",
  });
  console.info(`[db-cleanup] orphaned lineage deleted: ${orphansDeleted.toLocaleString()} rows`);

  console.info("[db-cleanup] deleting superseded metric values past the metric retention window...");
  // $1 = metricCutoff: only superseded values older than --keep-metric-days
  // are removed entirely; their lineage is already gone, so the ON DELETE
  // CASCADE has nothing to fan out to.
  const oldValuesDeleted = await deleteInBatches({
    table: "ImladrisCanonicalMetricValue",
    predicateSql: SUPERSEDED_PREDICATE,
    params: [metricCutoff],
    batchSize: 500, // cascade per row is tiny now, but keep batches small
    label: "superseded metric values",
  });
  console.info(`[db-cleanup] superseded metric values deleted: ${oldValuesDeleted.toLocaleString()} rows`);

  console.info("[db-cleanup] deleting outbox backlog...");
  const deadLettersDeleted = await deleteInBatches({
    table: "OutboxEvent",
    predicateSql: `"status" = 'DEAD_LETTER' AND "createdAt" < $1`,
    params: [deadLetterCutoff],
    batchSize: options.batchSize,
    label: "outbox dead letters",
  });
  const dispatchedDeleted = await deleteInBatches({
    table: "OutboxEvent",
    predicateSql: `"status" = 'DISPATCHED' AND "dispatchedAt" < $1`,
    params: [dispatchedCutoff],
    batchSize: options.batchSize,
    label: "outbox dispatched",
  });
  console.info(
    `[db-cleanup] outbox deleted: ${deadLettersDeleted.toLocaleString()} dead letters, ${dispatchedDeleted.toLocaleString()} dispatched`,
  );

  const sizeAfter = await databaseSizeBytes();
  console.info(`[db-cleanup] database size (logical): ${formatGb(sizeBefore)} -> ${formatGb(sizeAfter)}`);
  console.info(`
[db-cleanup] DONE. IMPORTANT — the volume is NOT smaller yet:
  Deleted pages are reusable by Postgres but are not returned to the OS,
  so Railway still reports the same volume usage. To reclaim the space,
  run during a quiet window (each statement takes an ACCESS EXCLUSIVE
  lock on its table while it rewrites; with the backlog gone each should
  finish in seconds to a few minutes):

    VACUUM (FULL, VERBOSE, ANALYZE) "ImladrisMetricLineage";
    VACUUM (FULL, VERBOSE, ANALYZE) "ImladrisCanonicalMetricValue";
    VACUUM (FULL, VERBOSE, ANALYZE) "OutboxEvent";

  Also consider dropping the leftover probe databases (wipguard_probe_*):
    SELECT datname FROM pg_database WHERE datname LIKE 'wipguard_probe_%';
    -- then for each: DROP DATABASE "wipguard_probe_<ts>";
`);
}

main()
  .catch((error) => {
    console.error("[db-cleanup] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
