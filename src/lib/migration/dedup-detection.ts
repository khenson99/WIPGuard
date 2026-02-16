/**
 * Duplicate and Orphan Detection
 *
 * Detects:
 * 1. Duplicate records: rows that would create duplicate tasks
 *    (same title, same project, same owner)
 * 2. Orphan records: tasks whose parent references don't resolve
 * 3. Cross-batch duplicates: rows that match existing DB records
 *
 * Used both during migration dry-run and as a post-migration audit.
 */

import type { NormalizedImportRecord } from "./coda-import";
import { buildMigrationDedupeKey } from "./coda-import";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DuplicateGroup {
  /** Fingerprint key that identifies this group. */
  fingerprint: string;
  /** The records that share this fingerprint. */
  records: Array<{
    sourceRowId: string;
    title: string;
    projectName: string | null;
    ownerEmail: string | null;
    contentHash: string;
  }>;
  /** Description of the duplicate condition. */
  reason: string;
}

export interface OrphanRecord {
  sourceRowId: string;
  title: string;
  parentSourceId: string;
  reason: string;
}

export interface CrossBatchDuplicate {
  sourceRowId: string;
  title: string;
  existingDedupeKey: string;
  existingContentHash: string | null;
  newContentHash: string;
  isDifferent: boolean;
}

export interface DedupDetectionResult {
  /** Groups of records that would create duplicates within the batch. */
  withinBatchDuplicates: DuplicateGroup[];
  /** Records whose parent references cannot be resolved. */
  orphanRecords: OrphanRecord[];
  /** Records that already exist in the destination. */
  crossBatchDuplicates: CrossBatchDuplicate[];
  /** Summary counts. */
  summary: {
    totalRecords: number;
    duplicateGroups: number;
    duplicateRecords: number;
    orphanCount: number;
    crossBatchCount: number;
    crossBatchChanged: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a fingerprint for duplicate detection within a batch.
 * Two records with the same fingerprint are considered potential duplicates.
 *
 * Fingerprint = normalized(title) + normalized(projectName) + normalized(ownerEmail)
 */
export function buildDuplicateFingerprint(
  title: string,
  projectName: string | null,
  ownerEmail: string | null,
): string {
  const parts = [
    title.toLowerCase().trim(),
    (projectName ?? "").toLowerCase().trim(),
    (ownerEmail ?? "").toLowerCase().trim(),
  ];
  return parts.join("||");
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Detect duplicates within a batch of normalized import records.
 * Groups records that share the same fingerprint.
 */
export function detectWithinBatchDuplicates(
  records: NormalizedImportRecord[],
): DuplicateGroup[] {
  const groups = new Map<string, NormalizedImportRecord[]>();

  for (const record of records) {
    const fp = buildDuplicateFingerprint(
      record.title,
      record.projectName,
      record.ownerEmail,
    );

    const existing = groups.get(fp);
    if (existing) {
      existing.push(record);
    } else {
      groups.set(fp, [record]);
    }
  }

  const duplicateGroups: DuplicateGroup[] = [];

  for (const [fingerprint, groupRecords] of groups) {
    if (groupRecords.length > 1) {
      duplicateGroups.push({
        fingerprint,
        records: groupRecords.map((r) => ({
          sourceRowId: r.sourceRowId,
          title: r.title,
          projectName: r.projectName,
          ownerEmail: r.ownerEmail,
          contentHash: r.contentHash,
        })),
        reason: `${groupRecords.length} records share the same title, project, and owner`,
      });
    }
  }

  // Sort deterministically
  duplicateGroups.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));

  return duplicateGroups;
}

/**
 * Detect orphan records whose parent references cannot be resolved
 * within the current batch.
 */
export function detectOrphans(
  records: NormalizedImportRecord[],
  existingSourceIds?: Set<string>,
): OrphanRecord[] {
  const batchSourceIds = new Set(records.map((r) => r.sourceRowId));
  const orphans: OrphanRecord[] = [];

  for (const record of records) {
    if (!record.parentSourceId) continue;

    const inBatch = batchSourceIds.has(record.parentSourceId);
    const inExisting = existingSourceIds?.has(record.parentSourceId) ?? false;

    if (!inBatch && !inExisting) {
      orphans.push({
        sourceRowId: record.sourceRowId,
        title: record.title,
        parentSourceId: record.parentSourceId,
        reason: `Parent row ${record.parentSourceId} not found in batch or existing records`,
      });
    }
  }

  // Sort deterministically
  orphans.sort((a, b) => a.sourceRowId.localeCompare(b.sourceRowId));

  return orphans;
}

/**
 * Detect records that already exist in the destination database.
 * Compares by dedupe key and optionally by content hash to detect drift.
 */
export function detectCrossBatchDuplicates(
  records: NormalizedImportRecord[],
  sourceLabel: string,
  existingDedupeKeys: Set<string>,
  existingContentHashes: Map<string, string>,
): CrossBatchDuplicate[] {
  const crossBatch: CrossBatchDuplicate[] = [];

  for (const record of records) {
    const dedupeKey = buildMigrationDedupeKey(sourceLabel, record.sourceRowId);

    if (existingDedupeKeys.has(dedupeKey)) {
      const existingHash = existingContentHashes.get(dedupeKey) ?? null;
      const isDifferent = existingHash !== null && existingHash !== record.contentHash;

      crossBatch.push({
        sourceRowId: record.sourceRowId,
        title: record.title,
        existingDedupeKey: dedupeKey,
        existingContentHash: existingHash,
        newContentHash: record.contentHash,
        isDifferent,
      });
    }
  }

  // Sort deterministically
  crossBatch.sort((a, b) => a.sourceRowId.localeCompare(b.sourceRowId));

  return crossBatch;
}

/**
 * Run the full dedup and orphan detection pipeline.
 */
export function runDedupDetection(input: {
  records: NormalizedImportRecord[];
  sourceLabel: string;
  existingDedupeKeys: Set<string>;
  existingContentHashes: Map<string, string>;
  existingSourceIds?: Set<string>;
}): DedupDetectionResult {
  const withinBatchDuplicates = detectWithinBatchDuplicates(input.records);
  const orphanRecords = detectOrphans(
    input.records,
    input.existingSourceIds,
  );
  const crossBatchDuplicates = detectCrossBatchDuplicates(
    input.records,
    input.sourceLabel,
    input.existingDedupeKeys,
    input.existingContentHashes,
  );

  const duplicateRecords = withinBatchDuplicates.reduce(
    (sum, g) => sum + g.records.length,
    0,
  );
  const crossBatchChanged = crossBatchDuplicates.filter(
    (d) => d.isDifferent,
  ).length;

  return {
    withinBatchDuplicates,
    orphanRecords,
    crossBatchDuplicates,
    summary: {
      totalRecords: input.records.length,
      duplicateGroups: withinBatchDuplicates.length,
      duplicateRecords,
      orphanCount: orphanRecords.length,
      crossBatchCount: crossBatchDuplicates.length,
      crossBatchChanged,
    },
  };
}

/**
 * Format dedup detection results as a human-readable text report.
 */
export function formatDedupReport(result: DedupDetectionResult): string {
  const lines: string[] = [];

  lines.push("=".repeat(72));
  lines.push("DUPLICATE & ORPHAN DETECTION REPORT");
  lines.push("=".repeat(72));
  lines.push("");

  lines.push("-".repeat(72));
  lines.push("SUMMARY");
  lines.push("-".repeat(72));
  lines.push(`Total records analyzed:      ${result.summary.totalRecords}`);
  lines.push(`Duplicate groups:            ${result.summary.duplicateGroups}`);
  lines.push(`Duplicate records:           ${result.summary.duplicateRecords}`);
  lines.push(`Orphan records:              ${result.summary.orphanCount}`);
  lines.push(`Cross-batch duplicates:      ${result.summary.crossBatchCount}`);
  lines.push(`Cross-batch with changes:    ${result.summary.crossBatchChanged}`);
  lines.push("");

  const clean =
    result.summary.duplicateGroups === 0 &&
    result.summary.orphanCount === 0;

  lines.push(
    clean
      ? "RESULT: CLEAN -- No duplicates or orphans detected."
      : "RESULT: ISSUES FOUND -- Review details below.",
  );
  lines.push("");

  if (result.withinBatchDuplicates.length > 0) {
    lines.push("-".repeat(72));
    lines.push("WITHIN-BATCH DUPLICATES");
    lines.push("-".repeat(72));

    for (const group of result.withinBatchDuplicates) {
      lines.push(`  Group: ${group.reason}`);
      for (const rec of group.records) {
        lines.push(
          `    - ${rec.sourceRowId}: "${rec.title}" [hash: ${rec.contentHash}]`,
        );
      }
      lines.push("");
    }
  }

  if (result.orphanRecords.length > 0) {
    lines.push("-".repeat(72));
    lines.push("ORPHAN RECORDS");
    lines.push("-".repeat(72));

    for (const orphan of result.orphanRecords) {
      lines.push(
        `  [!] ${orphan.sourceRowId}: "${orphan.title}" -> parent: ${orphan.parentSourceId}`,
      );
      lines.push(`      ${orphan.reason}`);
    }
    lines.push("");
  }

  if (result.crossBatchDuplicates.length > 0) {
    lines.push("-".repeat(72));
    lines.push("CROSS-BATCH DUPLICATES (already in DB)");
    lines.push("-".repeat(72));

    for (const dup of result.crossBatchDuplicates) {
      const icon = dup.isDifferent ? "~" : "=";
      lines.push(
        `  [${icon}] ${dup.sourceRowId}: "${dup.title}"`,
      );
      lines.push(
        `      Existing hash: ${dup.existingContentHash ?? "none"}, New hash: ${dup.newContentHash}`,
      );
    }
    lines.push("");
  }

  lines.push("=".repeat(72));
  lines.push("END OF DETECTION REPORT");
  lines.push("=".repeat(72));

  return lines.join("\n");
}
