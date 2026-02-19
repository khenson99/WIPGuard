/**
 * Reconciliation Report
 *
 * Compares source (Coda export) against destination (WIPGuard DB)
 * to produce a report of counts, hashes, and discrepancies.
 *
 * Output is structured for attachment to release artifacts.
 */

import { createHash } from "crypto";
import type {
  CodaExportRow,
  CodaImportColumnMap,
  NormalizedImportRecord,
} from "./coda-import";
import { buildMigrationDedupeKey } from "./coda-import";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A record on the destination side for comparison. */
export interface DestinationRecord {
  id: string;
  dedupeKey: string;
  contentHash: string | null;
  title: string;
  status: string;
  sourceRowId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Per-record reconciliation status. */
export type ReconciliationStatus =
  | "matched"           // source and destination match by hash
  | "content_drift"     // same dedupe key, different content hash
  | "source_only"       // exists in source but not in destination
  | "destination_only"  // exists in destination but not in source
  | "hash_missing";     // destination exists but has no content hash

export interface ReconciliationRecord {
  sourceRowId: string | null;
  destinationId: string | null;
  dedupeKey: string;
  status: ReconciliationStatus;
  sourceHash: string | null;
  destinationHash: string | null;
  title: string;
  details?: string;
}

export interface ReconciliationSummary {
  matched: number;
  contentDrift: number;
  sourceOnly: number;
  destinationOnly: number;
  hashMissing: number;
}

export interface ReconciliationReport {
  reportId: string;
  sourceLabel: string;
  generatedAt: string;

  sourceCounts: {
    totalRows: number;
    normalizedRows: number;
    aggregateHash: string;
  };

  destinationCounts: {
    totalRecords: number;
    withDedupeKey: number;
    aggregateHash: string;
  };

  summary: ReconciliationSummary;
  records: ReconciliationRecord[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute an aggregate hash over a sorted list of individual hashes.
 * This provides a single checksum for the entire dataset.
 */
export function computeAggregateHash(hashes: string[]): string {
  const sorted = [...hashes].sort();
  return createHash("sha256")
    .update(sorted.join("\n"))
    .digest("hex")
    .slice(0, 32);
}

/**
 * Generate a deterministic report ID.
 */
function generateReportId(sourceLabel: string, timestamp: Date): string {
  const ts = timestamp.toISOString().replace(/[:.]/g, "-");
  return `recon-${sourceLabel}-${ts}`;
}

// ---------------------------------------------------------------------------
// Core Reconciliation
// ---------------------------------------------------------------------------

/**
 * Build a reconciliation report comparing source rows against destination records.
 *
 * This is a pure function (no DB calls). The caller is responsible for
 * fetching destination records and passing them in.
 */
export function buildReconciliationReport(input: {
  sourceLabel: string;
  sourceRows: CodaExportRow[];
  normalizedRecords: NormalizedImportRecord[];
  destinationRecords: DestinationRecord[];
  columnMap: CodaImportColumnMap;
}): ReconciliationReport {
  const now = new Date();
  const reportId = generateReportId(input.sourceLabel, now);

  // Index source records by dedupe key
  const sourceByDedupeKey = new Map<
    string,
    { row: CodaExportRow; normalized: NormalizedImportRecord }
  >();
  for (const normalized of input.normalizedRecords) {
    const dedupeKey = buildMigrationDedupeKey(
      input.sourceLabel,
      normalized.sourceRowId,
    );
    const row = input.sourceRows.find((r) => r.id === normalized.sourceRowId);
    if (row) {
      sourceByDedupeKey.set(dedupeKey, { row, normalized });
    }
  }

  // Index destination records by dedupe key
  const destByDedupeKey = new Map<string, DestinationRecord>();
  for (const dest of input.destinationRecords) {
    destByDedupeKey.set(dest.dedupeKey, dest);
  }

  // Collect all unique dedupe keys
  const allDedupeKeys = new Set<string>([
    ...sourceByDedupeKey.keys(),
    ...destByDedupeKey.keys(),
  ]);

  const records: ReconciliationRecord[] = [];
  const summary: ReconciliationSummary = {
    matched: 0,
    contentDrift: 0,
    sourceOnly: 0,
    destinationOnly: 0,
    hashMissing: 0,
  };

  for (const dedupeKey of allDedupeKeys) {
    const source = sourceByDedupeKey.get(dedupeKey);
    const dest = destByDedupeKey.get(dedupeKey);

    if (source && dest) {
      const sourceHash = source.normalized.contentHash;

      if (!dest.contentHash) {
        summary.hashMissing += 1;
        records.push({
          sourceRowId: source.normalized.sourceRowId,
          destinationId: dest.id,
          dedupeKey,
          status: "hash_missing",
          sourceHash,
          destinationHash: null,
          title: source.normalized.title,
          details: "Destination record has no content hash for comparison",
        });
      } else if (sourceHash === dest.contentHash) {
        summary.matched += 1;
        records.push({
          sourceRowId: source.normalized.sourceRowId,
          destinationId: dest.id,
          dedupeKey,
          status: "matched",
          sourceHash,
          destinationHash: dest.contentHash,
          title: source.normalized.title,
        });
      } else {
        summary.contentDrift += 1;
        records.push({
          sourceRowId: source.normalized.sourceRowId,
          destinationId: dest.id,
          dedupeKey,
          status: "content_drift",
          sourceHash,
          destinationHash: dest.contentHash,
          title: source.normalized.title,
          details: `Hash mismatch: source=${sourceHash}, dest=${dest.contentHash}`,
        });
      }
    } else if (source && !dest) {
      summary.sourceOnly += 1;
      records.push({
        sourceRowId: source.normalized.sourceRowId,
        destinationId: null,
        dedupeKey,
        status: "source_only",
        sourceHash: source.normalized.contentHash,
        destinationHash: null,
        title: source.normalized.title,
        details: "Record exists in source but not in destination",
      });
    } else if (!source && dest) {
      summary.destinationOnly += 1;
      records.push({
        sourceRowId: dest.sourceRowId,
        destinationId: dest.id,
        dedupeKey,
        status: "destination_only",
        sourceHash: null,
        destinationHash: dest.contentHash,
        title: dest.title,
        details: "Record exists in destination but not in source",
      });
    }
  }

  // Sort records deterministically
  records.sort((a, b) => a.dedupeKey.localeCompare(b.dedupeKey));

  // Compute aggregate hashes
  const sourceHashes = input.normalizedRecords.map((r) => r.contentHash);
  const destHashes = input.destinationRecords
    .map((r) => r.contentHash)
    .filter((h): h is string => h !== null);

  return {
    reportId,
    sourceLabel: input.sourceLabel,
    generatedAt: now.toISOString(),

    sourceCounts: {
      totalRows: input.sourceRows.length,
      normalizedRows: input.normalizedRecords.length,
      aggregateHash: computeAggregateHash(sourceHashes),
    },

    destinationCounts: {
      totalRecords: input.destinationRecords.length,
      withDedupeKey: destByDedupeKey.size,
      aggregateHash: computeAggregateHash(destHashes),
    },

    summary,
    records,
  };
}

/**
 * Format a reconciliation report as human-readable text,
 * suitable for attachment to release artifacts.
 */
export function formatReconciliationReport(
  report: ReconciliationReport,
): string {
  const lines: string[] = [];

  lines.push("=".repeat(72));
  lines.push("CODA MIGRATION RECONCILIATION REPORT");
  lines.push("=".repeat(72));
  lines.push("");
  lines.push(`Report ID:     ${report.reportId}`);
  lines.push(`Source:        ${report.sourceLabel}`);
  lines.push(`Generated:     ${report.generatedAt}`);
  lines.push("");

  lines.push("-".repeat(72));
  lines.push("COUNTS");
  lines.push("-".repeat(72));
  lines.push(`Source total rows:        ${report.sourceCounts.totalRows}`);
  lines.push(`Source normalized:        ${report.sourceCounts.normalizedRows}`);
  lines.push(`Source aggregate hash:    ${report.sourceCounts.aggregateHash}`);
  lines.push(`Destination records:      ${report.destinationCounts.totalRecords}`);
  lines.push(`Destination w/ dedupeKey: ${report.destinationCounts.withDedupeKey}`);
  lines.push(`Destination aggregate:    ${report.destinationCounts.aggregateHash}`);
  lines.push("");

  lines.push("-".repeat(72));
  lines.push("RECONCILIATION SUMMARY");
  lines.push("-".repeat(72));
  lines.push(`Matched:               ${report.summary.matched}`);
  lines.push(`Content drift:         ${report.summary.contentDrift}`);
  lines.push(`Source only:           ${report.summary.sourceOnly}`);
  lines.push(`Destination only:      ${report.summary.destinationOnly}`);
  lines.push(`Hash missing:          ${report.summary.hashMissing}`);
  lines.push("");

  const integrity =
    report.summary.contentDrift === 0 &&
    report.summary.sourceOnly === 0 &&
    report.summary.destinationOnly === 0;

  lines.push(
    integrity
      ? "RESULT: PASS -- All records reconciled successfully."
      : "RESULT: DISCREPANCIES FOUND -- Review records below.",
  );
  lines.push("");

  if (!integrity && report.records.length > 0) {
    const issues = report.records.filter((r) => r.status !== "matched");

    if (issues.length > 0) {
      lines.push("-".repeat(72));
      lines.push("DISCREPANCY DETAILS");
      lines.push("-".repeat(72));

      for (const rec of issues) {
        const statusIcon =
          rec.status === "content_drift" ? "~" :
          rec.status === "source_only" ? "+" :
          rec.status === "destination_only" ? "-" :
          "?";

        lines.push(
          `  [${statusIcon}] ${rec.status.toUpperCase().padEnd(20)} ${rec.dedupeKey}`,
        );
        lines.push(`      Title: ${rec.title}`);
        if (rec.details) {
          lines.push(`      Detail: ${rec.details}`);
        }
      }

      lines.push("");
    }
  }

  lines.push("=".repeat(72));
  lines.push("END OF RECONCILIATION REPORT");
  lines.push("=".repeat(72));

  return lines.join("\n");
}

/**
 * Produce a JSON-serializable reconciliation artifact.
 * Suitable for saving alongside release assets.
 */
export function toReconciliationArtifact(
  report: ReconciliationReport,
): {
  version: string;
  report: ReconciliationReport;
  textReport: string;
} {
  return {
    version: "1.0.0",
    report,
    textReport: formatReconciliationReport(report),
  };
}
