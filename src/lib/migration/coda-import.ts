/**
 * Coda Migration Import Pipeline
 *
 * Deterministic import from Coda export snapshots into The Mother Node.
 * Designed for initial migration of existing Coda data, not ongoing sync.
 *
 * Key properties:
 * - Deterministic: same input always produces same output
 * - Idempotent: safe to re-run without creating duplicates
 * - Traceable: every record has a migration receipt with source lineage
 * - Dry-run capable: preview all changes without writing to DB
 */

import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single row from a Coda export snapshot (JSON format). */
export interface CodaExportRow {
  id: string;
  name?: string;
  values: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  browserLink?: string;
}

/** Column mapping configuration for the import. */
export interface CodaImportColumnMap {
  title: string;
  notes: string;
  status: string;
  priority: string;
  dueDate: string;
  owner: string;
  parentId: string;
  projectName: string;
  tags: string;
}

/** Full configuration for a migration run. */
export interface CodaMigrationConfig {
  /** Source identifier for provenance tracking. */
  sourceLabel: string;
  /** Column mapping from Coda columns to The Mother Node fields. */
  columnMap: CodaImportColumnMap;
  /** Default status for imported tasks. */
  defaultStatus: "BACKLOG" | "QUEUED" | "ACTIVE";
  /** Default priority for imported tasks. */
  defaultPriority: "P0" | "P1" | "P2" | "P3";
  /** If true, preview changes without persisting. */
  dryRun: boolean;
}

/** Status mapping from Coda text to The Mother Node TaskStatus. */
const STATUS_MAP: Record<string, string> = {
  backlog: "BACKLOG",
  queued: "QUEUED",
  todo: "QUEUED",
  "to do": "QUEUED",
  "in progress": "ACTIVE",
  active: "ACTIVE",
  working: "WORKING_ON_TODAY",
  "working on today": "WORKING_ON_TODAY",
  done: "DONE",
  completed: "DONE",
  complete: "DONE",
  "not done": "NOT_DONE",
  blocked: "NOT_DONE",
  cancelled: "NOT_DONE",
  canceled: "NOT_DONE",
};

/** Priority mapping from Coda text to The Mother Node Priority. */
const PRIORITY_MAP: Record<string, string> = {
  critical: "P0",
  urgent: "P0",
  p0: "P0",
  high: "P1",
  p1: "P1",
  medium: "P2",
  normal: "P2",
  p2: "P2",
  low: "P3",
  p3: "P3",
};

/** A normalized record ready for import. */
export interface NormalizedImportRecord {
  /** The source Coda row ID. */
  sourceRowId: string;
  /** Content hash for reconciliation. */
  contentHash: string;
  /** Mapped The Mother Node fields. */
  title: string;
  notes: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  ownerEmail: string | null;
  parentSourceId: string | null;
  projectName: string | null;
  tags: string[];
  /** Full source metadata for traceability. */
  sourceMetadata: {
    sourceLabel: string;
    codaRowId: string;
    codaBrowserLink: string | null;
    codaCreatedAt: string | null;
    codaUpdatedAt: string | null;
    rawValues: Record<string, unknown>;
    importedAt: string;
  };
}

/** Result of a single record import. */
export interface ImportRecordResult {
  sourceRowId: string;
  contentHash: string;
  operation: "created" | "updated" | "skipped" | "failed";
  targetId: string | null;
  title: string;
  reason?: string;
}

/** Aggregate result of a full migration run. */
export interface CodaMigrationResult {
  runId: string;
  sourceLabel: string;
  dryRun: boolean;
  startedAt: string;
  completedAt: string;
  totalSourceRows: number;
  normalized: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  records: ImportRecordResult[];
  errors: Array<{ sourceRowId: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function defaultColumnMap(): CodaImportColumnMap {
  return {
    title: "title",
    notes: "notes",
    status: "status",
    priority: "priority",
    dueDate: "due",
    owner: "owner",
    parentId: "parentId",
    projectName: "project",
    tags: "tags",
  };
}

export function defaultMigrationConfig(
  overrides?: Partial<CodaMigrationConfig>,
): CodaMigrationConfig {
  return {
    sourceLabel: overrides?.sourceLabel ?? "coda-export",
    columnMap: overrides?.columnMap ?? defaultColumnMap(),
    defaultStatus: overrides?.defaultStatus ?? "BACKLOG",
    defaultPriority: overrides?.defaultPriority ?? "P2",
    dryRun: overrides?.dryRun ?? true,
  };
}

function extractString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const candidate =
      (typeof record.name === "string" && record.name) ||
      (typeof record.title === "string" && record.title) ||
      (typeof record.value === "string" && record.value) ||
      null;
    return candidate ? candidate.trim() : null;
  }
  return null;
}

function extractEmail(value: unknown): string | null {
  const text = extractString(value);
  if (text && text.includes("@")) return text;

  if (Array.isArray(value)) {
    for (const item of value) {
      const itemText = extractString(item);
      if (itemText && itemText.includes("@")) return itemText;
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.email === "string" && record.email.includes("@")) {
      return record.email.trim();
    }
  }

  return null;
}

function extractDate(value: unknown): Date | null {
  if (!value) return null;
  const text = extractString(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function extractTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => extractString(item))
      .filter((item): item is string => item !== null);
  }
  const text = extractString(value);
  if (!text) return [];
  return text
    .split(/[,;]/g)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function mapStatus(value: unknown, defaultStatus: string): string {
  const text = extractString(value);
  if (!text) return defaultStatus;
  const normalized = text.toLowerCase().trim();
  return STATUS_MAP[normalized] ?? defaultStatus;
}

function mapPriority(value: unknown, defaultPriority: string): string {
  const text = extractString(value);
  if (!text) return defaultPriority;
  const normalized = text.toLowerCase().trim();
  return PRIORITY_MAP[normalized] ?? defaultPriority;
}

/**
 * Compute a deterministic content hash for a record.
 * Used for reconciliation and change detection across runs.
 */
export function computeContentHash(
  row: CodaExportRow,
  columnMap: CodaImportColumnMap,
): string {
  const fields = [
    row.id,
    extractString(row.values[columnMap.title]) ?? "",
    extractString(row.values[columnMap.notes]) ?? "",
    extractString(row.values[columnMap.status]) ?? "",
    extractString(row.values[columnMap.priority]) ?? "",
    extractString(row.values[columnMap.dueDate]) ?? "",
    extractString(row.values[columnMap.owner]) ?? "",
    extractString(row.values[columnMap.parentId]) ?? "",
    extractString(row.values[columnMap.projectName]) ?? "",
  ];

  return createHash("sha256")
    .update(fields.join("\x1f"))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Build a deterministic migration dedupe key for a Coda row.
 * Prevents duplicate imports across repeated runs.
 */
export function buildMigrationDedupeKey(
  sourceLabel: string,
  codaRowId: string,
): string {
  return ["migration", "coda", sourceLabel, codaRowId].join(":");
}

/**
 * Generate a deterministic run ID from the source label and timestamp.
 */
export function generateRunId(sourceLabel: string, timestamp: Date): string {
  const ts = timestamp.toISOString().replace(/[:.]/g, "-");
  return `mig-${sourceLabel}-${ts}`;
}

// ---------------------------------------------------------------------------
// Core Pipeline
// ---------------------------------------------------------------------------

/**
 * Normalize a batch of Coda export rows into import records.
 * This is a pure function with no side effects.
 */
export function normalizeExportRows(
  rows: CodaExportRow[],
  config: CodaMigrationConfig,
  importTimestamp: string,
): NormalizedImportRecord[] {
  const results: NormalizedImportRecord[] = [];

  for (const row of rows) {
    if (!row.id) continue;

    const title = extractString(row.values[config.columnMap.title])
      ?? extractString(row.name)
      ?? `Coda row ${row.id}`;

    const notes = extractString(row.values[config.columnMap.notes]);
    const status = mapStatus(row.values[config.columnMap.status], config.defaultStatus);
    const priority = mapPriority(row.values[config.columnMap.priority], config.defaultPriority);
    const dueDate = extractDate(row.values[config.columnMap.dueDate]);
    const ownerEmail = extractEmail(row.values[config.columnMap.owner]);
    const parentSourceId = extractString(row.values[config.columnMap.parentId]);
    const projectName = extractString(row.values[config.columnMap.projectName]);
    const tags = extractTags(row.values[config.columnMap.tags]);
    const contentHash = computeContentHash(row, config.columnMap);

    results.push({
      sourceRowId: row.id,
      contentHash,
      title,
      notes,
      status,
      priority,
      dueDate,
      ownerEmail,
      parentSourceId,
      projectName,
      tags,
      sourceMetadata: {
        sourceLabel: config.sourceLabel,
        codaRowId: row.id,
        codaBrowserLink: row.browserLink ?? null,
        codaCreatedAt: row.createdAt ?? null,
        codaUpdatedAt: row.updatedAt ?? null,
        rawValues: row.values,
        importedAt: importTimestamp,
      },
    });
  }

  // Sort deterministically by source row ID for repeatability
  results.sort((a, b) => a.sourceRowId.localeCompare(b.sourceRowId));

  return results;
}

/**
 * Resolve parent-child relationships within a batch of normalized records.
 * Returns a map from sourceRowId to the index in the records array of its parent.
 * Records are ordered so parents come before children (topological sort).
 */
export function resolveHierarchy(
  records: NormalizedImportRecord[],
): {
  ordered: NormalizedImportRecord[];
  parentMap: Map<string, string>;
  orphanParentRefs: string[];
} {
  const bySourceId = new Map<string, NormalizedImportRecord>();
  for (const record of records) {
    bySourceId.set(record.sourceRowId, record);
  }

  const parentMap = new Map<string, string>();
  const orphanParentRefs: string[] = [];

  for (const record of records) {
    if (record.parentSourceId) {
      if (bySourceId.has(record.parentSourceId)) {
        parentMap.set(record.sourceRowId, record.parentSourceId);
      } else {
        orphanParentRefs.push(record.sourceRowId);
      }
    }
  }

  // Topological sort: parents first
  const visited = new Set<string>();
  const ordered: NormalizedImportRecord[] = [];

  function visit(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);

    const parentId = parentMap.get(id);
    if (parentId && bySourceId.has(parentId)) {
      visit(parentId);
    }

    const record = bySourceId.get(id);
    if (record) {
      ordered.push(record);
    }
  }

  for (const record of records) {
    visit(record.sourceRowId);
  }

  return { ordered, parentMap, orphanParentRefs };
}

/**
 * Build a human-readable diff for dry-run output.
 * Shows exactly what would be created/updated/skipped for each record.
 */
export function buildDryRunDiff(
  records: NormalizedImportRecord[],
  existingDedupeKeys: Set<string>,
  existingContentHashes: Map<string, string>,
  sourceLabel: string,
): ImportRecordResult[] {
  const results: ImportRecordResult[] = [];

  for (const record of records) {
    const dedupeKey = buildMigrationDedupeKey(sourceLabel, record.sourceRowId);
    const existingHash = existingContentHashes.get(dedupeKey);

    if (existingHash) {
      if (existingHash === record.contentHash) {
        results.push({
          sourceRowId: record.sourceRowId,
          contentHash: record.contentHash,
          operation: "skipped",
          targetId: null,
          title: record.title,
          reason: "Identical content hash -- no changes detected",
        });
      } else {
        results.push({
          sourceRowId: record.sourceRowId,
          contentHash: record.contentHash,
          operation: "updated",
          targetId: null,
          title: record.title,
          reason: `Content changed: hash ${existingHash} -> ${record.contentHash}`,
        });
      }
    } else if (existingDedupeKeys.has(dedupeKey)) {
      results.push({
        sourceRowId: record.sourceRowId,
        contentHash: record.contentHash,
        operation: "skipped",
        targetId: null,
        title: record.title,
        reason: "Dedupe key exists but no hash stored",
      });
    } else {
      results.push({
        sourceRowId: record.sourceRowId,
        contentHash: record.contentHash,
        operation: "created",
        targetId: null,
        title: record.title,
      });
    }
  }

  return results;
}

/**
 * Format dry-run results as a human-readable text report.
 */
export function formatDryRunReport(
  result: CodaMigrationResult,
): string {
  const lines: string[] = [];

  lines.push("=".repeat(72));
  lines.push("CODA MIGRATION DRY-RUN REPORT");
  lines.push("=".repeat(72));
  lines.push("");
  lines.push(`Run ID:        ${result.runId}`);
  lines.push(`Source:        ${result.sourceLabel}`);
  lines.push(`Started:       ${result.startedAt}`);
  lines.push(`Completed:     ${result.completedAt}`);
  lines.push("");
  lines.push("-".repeat(72));
  lines.push("SUMMARY");
  lines.push("-".repeat(72));
  lines.push(`Total source rows:  ${result.totalSourceRows}`);
  lines.push(`Normalized:         ${result.normalized}`);
  lines.push(`Would create:       ${result.created}`);
  lines.push(`Would update:       ${result.updated}`);
  lines.push(`Would skip:         ${result.skipped}`);
  lines.push(`Errors:             ${result.failed}`);
  lines.push("");

  if (result.records.length > 0) {
    lines.push("-".repeat(72));
    lines.push("RECORD DETAILS");
    lines.push("-".repeat(72));

    for (const rec of result.records) {
      const icon =
        rec.operation === "created" ? "+" :
        rec.operation === "updated" ? "~" :
        rec.operation === "skipped" ? "-" :
        "!";

      lines.push(
        `  [${icon}] ${rec.operation.toUpperCase().padEnd(8)} ${rec.sourceRowId.padEnd(20)} ${rec.title}`,
      );
      if (rec.reason) {
        lines.push(`      Reason: ${rec.reason}`);
      }
    }

    lines.push("");
  }

  if (result.errors.length > 0) {
    lines.push("-".repeat(72));
    lines.push("ERRORS");
    lines.push("-".repeat(72));
    for (const err of result.errors) {
      lines.push(`  [!] ${err.sourceRowId}: ${err.error}`);
    }
    lines.push("");
  }

  lines.push("=".repeat(72));
  lines.push("END OF REPORT");
  lines.push("=".repeat(72));

  return lines.join("\n");
}

/**
 * Execute the full migration pipeline.
 *
 * When dryRun is true, no database writes occur.
 * When dryRun is false, the `persistFn` callback is invoked for each record.
 */
export async function runCodaMigration(input: {
  rows: CodaExportRow[];
  config: CodaMigrationConfig;
  /** Lookup existing dedupe keys to detect previously imported rows. */
  lookupExistingFn: (dedupeKeys: string[]) => Promise<{
    existingDedupeKeys: Set<string>;
    existingContentHashes: Map<string, string>;
  }>;
  /** Persist a single normalized record. Returns the created/updated entity ID. */
  persistFn?: (
    record: NormalizedImportRecord,
    parentTargetId: string | null,
    dedupeKey: string,
  ) => Promise<{ id: string; operation: "created" | "updated" }>;
}): Promise<CodaMigrationResult> {
  const now = new Date();
  const runId = generateRunId(input.config.sourceLabel, now);
  const importTimestamp = now.toISOString();

  // Step 1: Normalize all rows
  const normalized = normalizeExportRows(
    input.rows,
    input.config,
    importTimestamp,
  );

  // Step 2: Resolve hierarchy
  const { ordered, parentMap, orphanParentRefs } = resolveHierarchy(normalized);

  // Step 3: Look up existing records for dedup
  const dedupeKeys = ordered.map((r) =>
    buildMigrationDedupeKey(input.config.sourceLabel, r.sourceRowId),
  );
  const { existingDedupeKeys, existingContentHashes } =
    await input.lookupExistingFn(dedupeKeys);

  // Step 4: Dry-run or persist
  const records: ImportRecordResult[] = [];
  const errors: Array<{ sourceRowId: string; error: string }> = [];

  if (input.config.dryRun) {
    const dryRunResults = buildDryRunDiff(
      ordered,
      existingDedupeKeys,
      existingContentHashes,
      input.config.sourceLabel,
    );
    records.push(...dryRunResults);
  } else if (input.persistFn) {
    // Map from sourceRowId -> created target ID for parent resolution
    const sourceToTargetId = new Map<string, string>();

    for (const record of ordered) {
      const dedupeKey = buildMigrationDedupeKey(
        input.config.sourceLabel,
        record.sourceRowId,
      );

      // Resolve parent target ID if this record has a parent in the batch
      const parentSourceId = parentMap.get(record.sourceRowId) ?? null;
      const parentTargetId = parentSourceId
        ? sourceToTargetId.get(parentSourceId) ?? null
        : null;

      try {
        const result = await input.persistFn(record, parentTargetId, dedupeKey);
        sourceToTargetId.set(record.sourceRowId, result.id);

        records.push({
          sourceRowId: record.sourceRowId,
          contentHash: record.contentHash,
          operation: result.operation,
          targetId: result.id,
          title: record.title,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ sourceRowId: record.sourceRowId, error: message });
        records.push({
          sourceRowId: record.sourceRowId,
          contentHash: record.contentHash,
          operation: "failed",
          targetId: null,
          title: record.title,
          reason: message,
        });
      }
    }
  }

  // Add orphan warnings
  for (const orphanId of orphanParentRefs) {
    const existing = records.find((r) => r.sourceRowId === orphanId);
    if (existing && !existing.reason) {
      existing.reason = "Parent reference points to a row not in this batch";
    }
  }

  const created = records.filter((r) => r.operation === "created").length;
  const updated = records.filter((r) => r.operation === "updated").length;
  const skipped = records.filter((r) => r.operation === "skipped").length;
  const failed = records.filter((r) => r.operation === "failed").length;

  return {
    runId,
    sourceLabel: input.config.sourceLabel,
    dryRun: input.config.dryRun,
    startedAt: importTimestamp,
    completedAt: new Date().toISOString(),
    totalSourceRows: input.rows.length,
    normalized: normalized.length,
    created,
    updated,
    skipped,
    failed,
    records,
    errors,
  };
}
