import { describe, expect, it } from "vitest";
import {
  computeContentHash,
  buildMigrationDedupeKey,
  defaultColumnMap,
  defaultMigrationConfig,
  normalizeExportRows,
  resolveHierarchy,
  buildDryRunDiff,
  formatDryRunReport,
  generateRunId,
  type CodaExportRow,
} from "@/lib/migration/coda-import";
import {
  computeAggregateHash,
  buildReconciliationReport,
  formatReconciliationReport,
  toReconciliationArtifact,
  type DestinationRecord,
} from "@/lib/migration/reconciliation";
import {
  buildDuplicateFingerprint,
  detectWithinBatchDuplicates,
  detectOrphans,
  detectCrossBatchDuplicates,
  runDedupDetection,
  formatDedupReport,
} from "@/lib/migration/dedup-detection";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeRow(
  id: string,
  values: Record<string, unknown> = {},
  overrides: Partial<CodaExportRow> = {},
): CodaExportRow {
  return {
    id,
    values: {
      title: `Task ${id}`,
      notes: `Notes for ${id}`,
      status: "active",
      priority: "medium",
      due: "2025-06-01",
      owner: "user@example.com",
      parentId: null,
      project: "Project Alpha",
      tags: "tag1, tag2",
      ...values,
    },
    ...overrides,
  };
}

const FIXED_TIMESTAMP = "2025-01-01T00:00:00.000Z";

// ---------------------------------------------------------------------------
// coda-import.ts
// ---------------------------------------------------------------------------

describe("coda-import", () => {
  describe("defaultColumnMap", () => {
    it("returns expected defaults", () => {
      const map = defaultColumnMap();
      expect(map.title).toBe("title");
      expect(map.notes).toBe("notes");
      expect(map.status).toBe("status");
      expect(map.priority).toBe("priority");
      expect(map.dueDate).toBe("due");
      expect(map.owner).toBe("owner");
      expect(map.parentId).toBe("parentId");
      expect(map.projectName).toBe("project");
      expect(map.tags).toBe("tags");
    });
  });

  describe("defaultMigrationConfig", () => {
    it("returns safe defaults with dryRun true", () => {
      const config = defaultMigrationConfig();
      expect(config.dryRun).toBe(true);
      expect(config.defaultStatus).toBe("BACKLOG");
      expect(config.defaultPriority).toBe("P2");
      expect(config.sourceLabel).toBe("coda-export");
    });

    it("accepts overrides", () => {
      const config = defaultMigrationConfig({
        sourceLabel: "test-source",
        dryRun: false,
        defaultStatus: "QUEUED",
      });
      expect(config.sourceLabel).toBe("test-source");
      expect(config.dryRun).toBe(false);
      expect(config.defaultStatus).toBe("QUEUED");
    });
  });

  describe("computeContentHash", () => {
    it("produces a 16-char hex string", () => {
      const row = makeRow("row-1");
      const hash = computeContentHash(row, defaultColumnMap());
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it("is deterministic for the same input", () => {
      const row = makeRow("row-1");
      const map = defaultColumnMap();
      const hash1 = computeContentHash(row, map);
      const hash2 = computeContentHash(row, map);
      expect(hash1).toBe(hash2);
    });

    it("changes when content changes", () => {
      const row1 = makeRow("row-1", { title: "Task A" });
      const row2 = makeRow("row-1", { title: "Task B" });
      const map = defaultColumnMap();
      expect(computeContentHash(row1, map)).not.toBe(
        computeContentHash(row2, map),
      );
    });
  });

  describe("buildMigrationDedupeKey", () => {
    it("builds canonical key", () => {
      expect(buildMigrationDedupeKey("test-source", "row-123")).toBe(
        "migration:coda:test-source:row-123",
      );
    });
  });

  describe("generateRunId", () => {
    it("produces a deterministic run ID", () => {
      const ts = new Date("2025-01-15T10:30:00.000Z");
      const id = generateRunId("my-source", ts);
      expect(id).toContain("mig-my-source-");
      expect(id).toContain("2025-01-15");
    });
  });

  describe("normalizeExportRows", () => {
    it("normalizes basic rows", () => {
      const rows = [makeRow("row-1"), makeRow("row-2")];
      const config = defaultMigrationConfig();
      const result = normalizeExportRows(rows, config, FIXED_TIMESTAMP);

      expect(result).toHaveLength(2);
      expect(result[0].sourceRowId).toBe("row-1");
      expect(result[1].sourceRowId).toBe("row-2");
    });

    it("maps status text to enum values", () => {
      const rows = [
        makeRow("r1", { status: "in progress" }),
        makeRow("r2", { status: "done" }),
        makeRow("r3", { status: "backlog" }),
        makeRow("r4", { status: "unknown-value" }),
      ];
      const config = defaultMigrationConfig();
      const result = normalizeExportRows(rows, config, FIXED_TIMESTAMP);

      expect(result.find((r) => r.sourceRowId === "r1")!.status).toBe("ACTIVE");
      expect(result.find((r) => r.sourceRowId === "r2")!.status).toBe("DONE");
      expect(result.find((r) => r.sourceRowId === "r3")!.status).toBe("BACKLOG");
      expect(result.find((r) => r.sourceRowId === "r4")!.status).toBe("BACKLOG"); // default
    });

    it("maps priority text to enum values", () => {
      const rows = [
        makeRow("r1", { priority: "critical" }),
        makeRow("r2", { priority: "high" }),
        makeRow("r3", { priority: "low" }),
        makeRow("r4", { priority: "garbage" }),
      ];
      const config = defaultMigrationConfig();
      const result = normalizeExportRows(rows, config, FIXED_TIMESTAMP);

      expect(result.find((r) => r.sourceRowId === "r1")!.priority).toBe("P0");
      expect(result.find((r) => r.sourceRowId === "r2")!.priority).toBe("P1");
      expect(result.find((r) => r.sourceRowId === "r3")!.priority).toBe("P3");
      expect(result.find((r) => r.sourceRowId === "r4")!.priority).toBe("P2"); // default
    });

    it("extracts email from owner field", () => {
      const rows = [makeRow("r1", { owner: "alice@co.com" })];
      const config = defaultMigrationConfig();
      const result = normalizeExportRows(rows, config, FIXED_TIMESTAMP);
      expect(result[0].ownerEmail).toBe("alice@co.com");
    });

    it("extracts email from object with email field", () => {
      const rows = [makeRow("r1", { owner: { name: "Alice", email: "alice@co.com" } })];
      const config = defaultMigrationConfig();
      const result = normalizeExportRows(rows, config, FIXED_TIMESTAMP);
      expect(result[0].ownerEmail).toBe("alice@co.com");
    });

    it("returns null for non-email owner", () => {
      const rows = [makeRow("r1", { owner: "Just a name" })];
      const config = defaultMigrationConfig();
      const result = normalizeExportRows(rows, config, FIXED_TIMESTAMP);
      expect(result[0].ownerEmail).toBeNull();
    });

    it("extracts tags from comma-separated string", () => {
      const rows = [makeRow("r1", { tags: "frontend, backend, urgent" })];
      const config = defaultMigrationConfig();
      const result = normalizeExportRows(rows, config, FIXED_TIMESTAMP);
      expect(result[0].tags).toEqual(["frontend", "backend", "urgent"]);
    });

    it("extracts tags from array", () => {
      const rows = [makeRow("r1", { tags: ["frontend", "backend"] })];
      const config = defaultMigrationConfig();
      const result = normalizeExportRows(rows, config, FIXED_TIMESTAMP);
      expect(result[0].tags).toEqual(["frontend", "backend"]);
    });

    it("skips rows with no ID", () => {
      const rows = [
        makeRow("row-1"),
        { id: "", values: { title: "No ID row" } } as CodaExportRow,
      ];
      const config = defaultMigrationConfig();
      const result = normalizeExportRows(rows, config, FIXED_TIMESTAMP);
      expect(result).toHaveLength(1);
    });

    it("uses row.name as fallback title", () => {
      const rows = [makeRow("r1", { title: null }, { name: "Fallback Title" })];
      const config = defaultMigrationConfig();
      const result = normalizeExportRows(rows, config, FIXED_TIMESTAMP);
      expect(result[0].title).toBe("Fallback Title");
    });

    it("uses generic title when both title and name are missing", () => {
      const rows = [makeRow("r1", { title: null })];
      const config = defaultMigrationConfig();
      const result = normalizeExportRows(rows, config, FIXED_TIMESTAMP);
      expect(result[0].title).toBe("Coda row r1");
    });

    it("populates source metadata", () => {
      const rows = [
        makeRow("r1", {}, {
          browserLink: "https://coda.io/row/r1",
          createdAt: "2024-01-01",
          updatedAt: "2024-06-01",
        }),
      ];
      const config = defaultMigrationConfig({ sourceLabel: "test" });
      const result = normalizeExportRows(rows, config, FIXED_TIMESTAMP);
      const meta = result[0].sourceMetadata;

      expect(meta.sourceLabel).toBe("test");
      expect(meta.codaRowId).toBe("r1");
      expect(meta.codaBrowserLink).toBe("https://coda.io/row/r1");
      expect(meta.codaCreatedAt).toBe("2024-01-01");
      expect(meta.codaUpdatedAt).toBe("2024-06-01");
      expect(meta.importedAt).toBe(FIXED_TIMESTAMP);
    });

    it("sorts results deterministically by sourceRowId", () => {
      const rows = [makeRow("z-row"), makeRow("a-row"), makeRow("m-row")];
      const config = defaultMigrationConfig();
      const result = normalizeExportRows(rows, config, FIXED_TIMESTAMP);
      expect(result.map((r) => r.sourceRowId)).toEqual(["a-row", "m-row", "z-row"]);
    });
  });

  describe("resolveHierarchy", () => {
    it("orders parents before children", () => {
      const rows = [
        makeRow("child", { parentId: "parent" }),
        makeRow("parent", { parentId: null }),
      ];
      const config = defaultMigrationConfig();
      const normalized = normalizeExportRows(rows, config, FIXED_TIMESTAMP);
      const { ordered } = resolveHierarchy(normalized);

      const parentIdx = ordered.findIndex((r) => r.sourceRowId === "parent");
      const childIdx = ordered.findIndex((r) => r.sourceRowId === "child");
      expect(parentIdx).toBeLessThan(childIdx);
    });

    it("detects orphan parent references", () => {
      const rows = [
        makeRow("child", { parentId: "missing-parent" }),
      ];
      const config = defaultMigrationConfig();
      const normalized = normalizeExportRows(rows, config, FIXED_TIMESTAMP);
      const { orphanParentRefs } = resolveHierarchy(normalized);

      expect(orphanParentRefs).toContain("child");
    });

    it("builds parent map for resolved references", () => {
      const rows = [
        makeRow("parent"),
        makeRow("child", { parentId: "parent" }),
      ];
      const config = defaultMigrationConfig();
      const normalized = normalizeExportRows(rows, config, FIXED_TIMESTAMP);
      const { parentMap } = resolveHierarchy(normalized);

      expect(parentMap.get("child")).toBe("parent");
      expect(parentMap.has("parent")).toBe(false);
    });
  });

  describe("buildDryRunDiff", () => {
    it("marks new records as created", () => {
      const rows = [makeRow("new-1")];
      const config = defaultMigrationConfig({ sourceLabel: "test" });
      const normalized = normalizeExportRows(rows, config, FIXED_TIMESTAMP);

      const results = buildDryRunDiff(
        normalized,
        new Set(),
        new Map(),
        "test",
      );

      expect(results).toHaveLength(1);
      expect(results[0].operation).toBe("created");
    });

    it("marks identical records as skipped", () => {
      const rows = [makeRow("existing-1")];
      const config = defaultMigrationConfig({ sourceLabel: "test" });
      const normalized = normalizeExportRows(rows, config, FIXED_TIMESTAMP);

      const dedupeKey = buildMigrationDedupeKey("test", "existing-1");
      const existingDedupeKeys = new Set([dedupeKey]);
      const existingContentHashes = new Map([
        [dedupeKey, normalized[0].contentHash],
      ]);

      const results = buildDryRunDiff(
        normalized,
        existingDedupeKeys,
        existingContentHashes,
        "test",
      );

      expect(results[0].operation).toBe("skipped");
    });

    it("marks changed records as updated", () => {
      const rows = [makeRow("changed-1")];
      const config = defaultMigrationConfig({ sourceLabel: "test" });
      const normalized = normalizeExportRows(rows, config, FIXED_TIMESTAMP);

      const dedupeKey = buildMigrationDedupeKey("test", "changed-1");
      const existingDedupeKeys = new Set([dedupeKey]);
      const existingContentHashes = new Map([
        [dedupeKey, "different-hash-value"],
      ]);

      const results = buildDryRunDiff(
        normalized,
        existingDedupeKeys,
        existingContentHashes,
        "test",
      );

      expect(results[0].operation).toBe("updated");
    });
  });

  describe("formatDryRunReport", () => {
    it("produces a human-readable text report", () => {
      const report = formatDryRunReport({
        runId: "test-run",
        sourceLabel: "test",
        dryRun: true,
        startedAt: FIXED_TIMESTAMP,
        completedAt: FIXED_TIMESTAMP,
        totalSourceRows: 3,
        normalized: 3,
        created: 2,
        updated: 1,
        skipped: 0,
        failed: 0,
        records: [
          { sourceRowId: "r1", contentHash: "abc", operation: "created", targetId: null, title: "Task 1" },
          { sourceRowId: "r2", contentHash: "def", operation: "created", targetId: null, title: "Task 2" },
          { sourceRowId: "r3", contentHash: "ghi", operation: "updated", targetId: null, title: "Task 3", reason: "Changed" },
        ],
        errors: [],
      });

      expect(report).toContain("CODA MIGRATION DRY-RUN REPORT");
      expect(report).toContain("Would create:       2");
      expect(report).toContain("Would update:       1");
      expect(report).toContain("Task 1");
      expect(report).toContain("END OF REPORT");
    });
  });
});

// ---------------------------------------------------------------------------
// reconciliation.ts
// ---------------------------------------------------------------------------

describe("reconciliation", () => {
  describe("computeAggregateHash", () => {
    it("produces a 32-char hex string", () => {
      const hash = computeAggregateHash(["hash1", "hash2", "hash3"]);
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });

    it("is order-independent (sorts internally)", () => {
      const hash1 = computeAggregateHash(["z", "a", "m"]);
      const hash2 = computeAggregateHash(["a", "m", "z"]);
      expect(hash1).toBe(hash2);
    });

    it("changes when hashes change", () => {
      const hash1 = computeAggregateHash(["a", "b"]);
      const hash2 = computeAggregateHash(["a", "c"]);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("buildReconciliationReport", () => {
    const sourceLabel = "test";
    const columnMap = defaultColumnMap();

    function makeNormalized(id: string, contentHash: string) {
      return {
        sourceRowId: id,
        contentHash,
        title: `Task ${id}`,
        notes: null,
        status: "BACKLOG",
        priority: "P2",
        dueDate: null,
        ownerEmail: null,
        parentSourceId: null,
        projectName: null,
        tags: [],
        sourceMetadata: {
          sourceLabel: "test",
          codaRowId: id,
          codaBrowserLink: null,
          codaCreatedAt: null,
          codaUpdatedAt: null,
          rawValues: {},
          importedAt: FIXED_TIMESTAMP,
        },
      };
    }

    function makeDest(
      id: string,
      sourceRowId: string,
      contentHash: string | null,
    ): DestinationRecord {
      return {
        id: `dest-${id}`,
        dedupeKey: buildMigrationDedupeKey(sourceLabel, sourceRowId),
        contentHash,
        title: `Task ${sourceRowId}`,
        status: "BACKLOG",
        sourceRowId,
        createdAt: FIXED_TIMESTAMP,
        updatedAt: FIXED_TIMESTAMP,
      };
    }

    it("detects matched records", () => {
      const normalized = [makeNormalized("r1", "hash-abc")];
      const destinations = [makeDest("d1", "r1", "hash-abc")];

      const report = buildReconciliationReport({
        sourceLabel,
        sourceRows: [makeRow("r1")],
        normalizedRecords: normalized,
        destinationRecords: destinations,
        columnMap,
      });

      expect(report.summary.matched).toBe(1);
      expect(report.summary.contentDrift).toBe(0);
      expect(report.summary.sourceOnly).toBe(0);
      expect(report.summary.destinationOnly).toBe(0);
    });

    it("detects content drift", () => {
      const normalized = [makeNormalized("r1", "hash-new")];
      const destinations = [makeDest("d1", "r1", "hash-old")];

      const report = buildReconciliationReport({
        sourceLabel,
        sourceRows: [makeRow("r1")],
        normalizedRecords: normalized,
        destinationRecords: destinations,
        columnMap,
      });

      expect(report.summary.contentDrift).toBe(1);
    });

    it("detects source-only records", () => {
      const normalized = [makeNormalized("r1", "hash-abc")];

      const report = buildReconciliationReport({
        sourceLabel,
        sourceRows: [makeRow("r1")],
        normalizedRecords: normalized,
        destinationRecords: [],
        columnMap,
      });

      expect(report.summary.sourceOnly).toBe(1);
    });

    it("detects destination-only records", () => {
      const destinations = [makeDest("d1", "orphan", "hash-abc")];

      const report = buildReconciliationReport({
        sourceLabel,
        sourceRows: [],
        normalizedRecords: [],
        destinationRecords: destinations,
        columnMap,
      });

      expect(report.summary.destinationOnly).toBe(1);
    });

    it("detects hash-missing records", () => {
      const normalized = [makeNormalized("r1", "hash-abc")];
      const destinations = [makeDest("d1", "r1", null)];

      const report = buildReconciliationReport({
        sourceLabel,
        sourceRows: [makeRow("r1")],
        normalizedRecords: normalized,
        destinationRecords: destinations,
        columnMap,
      });

      expect(report.summary.hashMissing).toBe(1);
    });

    it("generates aggregate hashes", () => {
      const normalized = [makeNormalized("r1", "hash1"), makeNormalized("r2", "hash2")];

      const report = buildReconciliationReport({
        sourceLabel,
        sourceRows: [makeRow("r1"), makeRow("r2")],
        normalizedRecords: normalized,
        destinationRecords: [],
        columnMap,
      });

      expect(report.sourceCounts.aggregateHash).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  describe("formatReconciliationReport", () => {
    it("produces PASS result when clean", () => {
      const report = buildReconciliationReport({
        sourceLabel: "test",
        sourceRows: [],
        normalizedRecords: [],
        destinationRecords: [],
        columnMap: defaultColumnMap(),
      });

      const text = formatReconciliationReport(report);
      expect(text).toContain("PASS");
      expect(text).toContain("END OF RECONCILIATION REPORT");
    });
  });

  describe("toReconciliationArtifact", () => {
    it("wraps report with version and text", () => {
      const report = buildReconciliationReport({
        sourceLabel: "test",
        sourceRows: [],
        normalizedRecords: [],
        destinationRecords: [],
        columnMap: defaultColumnMap(),
      });

      const artifact = toReconciliationArtifact(report);
      expect(artifact.version).toBe("1.0.0");
      expect(artifact.report).toBe(report);
      expect(artifact.textReport).toContain("RECONCILIATION REPORT");
    });
  });
});

// ---------------------------------------------------------------------------
// dedup-detection.ts
// ---------------------------------------------------------------------------

describe("dedup-detection", () => {
  function makeNormalized(
    id: string,
    overrides: {
      title?: string;
      projectName?: string | null;
      ownerEmail?: string | null;
      parentSourceId?: string | null;
      contentHash?: string;
    } = {},
  ) {
    return {
      sourceRowId: id,
      contentHash: overrides.contentHash ?? `hash-${id}`,
      title: overrides.title ?? `Task ${id}`,
      notes: null,
      status: "BACKLOG",
      priority: "P2",
      dueDate: null,
      ownerEmail: overrides.ownerEmail ?? null,
      parentSourceId: overrides.parentSourceId ?? null,
      projectName: overrides.projectName ?? null,
      tags: [],
      sourceMetadata: {
        sourceLabel: "test",
        codaRowId: id,
        codaBrowserLink: null,
        codaCreatedAt: null,
        codaUpdatedAt: null,
        rawValues: {},
        importedAt: FIXED_TIMESTAMP,
      },
    };
  }

  describe("buildDuplicateFingerprint", () => {
    it("combines title, project, and owner", () => {
      const fp = buildDuplicateFingerprint("My Task", "Project A", "user@co.com");
      expect(fp).toBe("my task||project a||user@co.com");
    });

    it("normalizes to lowercase and trims", () => {
      const fp = buildDuplicateFingerprint("  My Task  ", "  Project A  ", "  User@Co.com  ");
      expect(fp).toBe("my task||project a||user@co.com");
    });

    it("handles nulls", () => {
      const fp = buildDuplicateFingerprint("My Task", null, null);
      expect(fp).toBe("my task||||");
    });
  });

  describe("detectWithinBatchDuplicates", () => {
    it("detects duplicates with same fingerprint", () => {
      const records = [
        makeNormalized("r1", { title: "Task A", projectName: "P1", ownerEmail: "u@co.com" }),
        makeNormalized("r2", { title: "Task A", projectName: "P1", ownerEmail: "u@co.com" }),
      ];

      const groups = detectWithinBatchDuplicates(records);
      expect(groups).toHaveLength(1);
      expect(groups[0].records).toHaveLength(2);
    });

    it("does not flag unique records", () => {
      const records = [
        makeNormalized("r1", { title: "Task A" }),
        makeNormalized("r2", { title: "Task B" }),
      ];

      const groups = detectWithinBatchDuplicates(records);
      expect(groups).toHaveLength(0);
    });

    it("groups multiple duplicate sets independently", () => {
      const records = [
        makeNormalized("r1", { title: "Dup1" }),
        makeNormalized("r2", { title: "Dup1" }),
        makeNormalized("r3", { title: "Dup2" }),
        makeNormalized("r4", { title: "Dup2" }),
        makeNormalized("r5", { title: "Unique" }),
      ];

      const groups = detectWithinBatchDuplicates(records);
      expect(groups).toHaveLength(2);
    });
  });

  describe("detectOrphans", () => {
    it("detects orphan records with missing parents", () => {
      const records = [
        makeNormalized("child", { parentSourceId: "missing-parent" }),
      ];

      const orphans = detectOrphans(records);
      expect(orphans).toHaveLength(1);
      expect(orphans[0].sourceRowId).toBe("child");
      expect(orphans[0].parentSourceId).toBe("missing-parent");
    });

    it("does not flag records with parents in the batch", () => {
      const records = [
        makeNormalized("parent"),
        makeNormalized("child", { parentSourceId: "parent" }),
      ];

      const orphans = detectOrphans(records);
      expect(orphans).toHaveLength(0);
    });

    it("does not flag records with parents in existing set", () => {
      const records = [
        makeNormalized("child", { parentSourceId: "existing-parent" }),
      ];

      const orphans = detectOrphans(records, new Set(["existing-parent"]));
      expect(orphans).toHaveLength(0);
    });

    it("skips records without parent references", () => {
      const records = [makeNormalized("standalone")];
      const orphans = detectOrphans(records);
      expect(orphans).toHaveLength(0);
    });
  });

  describe("detectCrossBatchDuplicates", () => {
    it("detects records that exist in the destination", () => {
      const records = [makeNormalized("r1")];
      const dedupeKey = buildMigrationDedupeKey("test", "r1");
      const existingKeys = new Set([dedupeKey]);
      const existingHashes = new Map([[dedupeKey, "hash-r1"]]);

      const crossBatch = detectCrossBatchDuplicates(
        records,
        "test",
        existingKeys,
        existingHashes,
      );

      expect(crossBatch).toHaveLength(1);
      expect(crossBatch[0].isDifferent).toBe(false);
    });

    it("flags records with different content hash", () => {
      const records = [makeNormalized("r1", { contentHash: "new-hash" })];
      const dedupeKey = buildMigrationDedupeKey("test", "r1");
      const existingKeys = new Set([dedupeKey]);
      const existingHashes = new Map([[dedupeKey, "old-hash"]]);

      const crossBatch = detectCrossBatchDuplicates(
        records,
        "test",
        existingKeys,
        existingHashes,
      );

      expect(crossBatch).toHaveLength(1);
      expect(crossBatch[0].isDifferent).toBe(true);
    });

    it("does not flag new records", () => {
      const records = [makeNormalized("new-r1")];

      const crossBatch = detectCrossBatchDuplicates(
        records,
        "test",
        new Set(),
        new Map(),
      );

      expect(crossBatch).toHaveLength(0);
    });
  });

  describe("runDedupDetection", () => {
    it("produces a complete summary", () => {
      const records = [
        makeNormalized("r1", { title: "Dup", projectName: "P1" }),
        makeNormalized("r2", { title: "Dup", projectName: "P1" }),
        makeNormalized("orphan", { parentSourceId: "missing" }),
      ];

      const dedupeKey = buildMigrationDedupeKey("test", "r1");

      const result = runDedupDetection({
        records,
        sourceLabel: "test",
        existingDedupeKeys: new Set([dedupeKey]),
        existingContentHashes: new Map([[dedupeKey, "hash-r1"]]),
      });

      expect(result.summary.totalRecords).toBe(3);
      expect(result.summary.duplicateGroups).toBe(1);
      expect(result.summary.duplicateRecords).toBe(2);
      expect(result.summary.orphanCount).toBe(1);
      expect(result.summary.crossBatchCount).toBe(1);
    });
  });

  describe("formatDedupReport", () => {
    it("produces report text", () => {
      const result = runDedupDetection({
        records: [makeNormalized("r1")],
        sourceLabel: "test",
        existingDedupeKeys: new Set(),
        existingContentHashes: new Map(),
      });

      const text = formatDedupReport(result);
      expect(text).toContain("DUPLICATE & ORPHAN DETECTION REPORT");
      expect(text).toContain("CLEAN");
      expect(text).toContain("END OF DETECTION REPORT");
    });

    it("shows issues when they exist", () => {
      const records = [
        makeNormalized("r1", { title: "Same" }),
        makeNormalized("r2", { title: "Same" }),
      ];

      const result = runDedupDetection({
        records,
        sourceLabel: "test",
        existingDedupeKeys: new Set(),
        existingContentHashes: new Map(),
      });

      const text = formatDedupReport(result);
      expect(text).toContain("ISSUES FOUND");
      expect(text).toContain("WITHIN-BATCH DUPLICATES");
    });
  });
});
