export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { enforcePermission } from "@/lib/permissions";
import {
  defaultMigrationConfig,
  normalizeExportRows,
  runCodaMigration,
  formatDryRunReport,
  buildMigrationDedupeKey,
  type CodaExportRow,
  type CodaMigrationConfig,
} from "@/lib/migration/coda-import";
import {
  buildReconciliationReport,
  toReconciliationArtifact,
  type DestinationRecord,
} from "@/lib/migration/reconciliation";
import {
  runDedupDetection,
  formatDedupReport,
} from "@/lib/migration/dedup-detection";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIGRATION_RULE_KEY = "coda-migration";

// ---------------------------------------------------------------------------
// Request body types
// ---------------------------------------------------------------------------

interface MigrationRequestBody {
  action?: "dry-run" | "migrate" | "reconcile" | "dedup-check";
  sourceLabel?: string;
  rows?: CodaExportRow[];
  config?: Partial<CodaMigrationConfig>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get or create the IntegrationRule used for migration receipts.
 * Each user gets one migration rule that holds all migration receipts.
 */
async function getOrCreateMigrationRule(userId: string) {
  const existing = await prisma.integrationRule.findUnique({
    where: {
      userId_provider_key: {
        userId,
        provider: IntegrationProvider.CODA,
        key: MIGRATION_RULE_KEY,
      },
    },
  });

  if (existing) return existing;

  return prisma.integrationRule.create({
    data: {
      userId,
      provider: IntegrationProvider.CODA,
      key: MIGRATION_RULE_KEY,
      enabled: true,
      config: { type: "migration" },
    },
  });
}

/**
 * Lookup existing migration receipts for a set of dedupe keys.
 * Content hash is stored in the metadata JSON field.
 */
async function lookupExistingReceipts(dedupeKeys: string[]): Promise<{
  existingDedupeKeys: Set<string>;
  existingContentHashes: Map<string, string>;
}> {
  const receipts = await prisma.integrationReceipt.findMany({
    where: {
      dedupeKey: { in: dedupeKeys },
    },
    select: {
      dedupeKey: true,
      metadata: true,
    },
  });

  const existingDedupeKeys = new Set(receipts.map((r) => r.dedupeKey));
  const existingContentHashes = new Map<string, string>();
  for (const receipt of receipts) {
    const meta = receipt.metadata as Record<string, unknown> | null;
    const hash = meta?.contentHash;
    if (typeof hash === "string") {
      existingContentHashes.set(receipt.dedupeKey, hash);
    }
  }

  return { existingDedupeKeys, existingContentHashes };
}

/**
 * Fetch destination records for reconciliation.
 */
async function fetchDestinationRecords(
  userId: string,
  sourceLabel: string,
): Promise<DestinationRecord[]> {
  const rule = await prisma.integrationRule.findUnique({
    where: {
      userId_provider_key: {
        userId,
        provider: IntegrationProvider.CODA,
        key: MIGRATION_RULE_KEY,
      },
    },
  });

  if (!rule) return [];

  const prefix = `migration:coda:${sourceLabel}:`;
  const receipts = await prisma.integrationReceipt.findMany({
    where: {
      ruleId: rule.id,
      dedupeKey: { startsWith: prefix },
    },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  return receipts
    .filter((r) => r.task)
    .map((r) => {
      const meta = r.metadata as Record<string, unknown> | null;
      const contentHash = typeof meta?.contentHash === "string"
        ? meta.contentHash
        : null;

      return {
        id: r.task!.id,
        dedupeKey: r.dedupeKey,
        contentHash,
        title: r.task!.title,
        status: r.task!.status,
        sourceRowId: r.externalObjectId,
        createdAt: r.task!.createdAt.toISOString(),
        updatedAt: r.task!.updatedAt.toISOString(),
      };
    });
}

// ---------------------------------------------------------------------------
// GET: Migration status
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "profile.write",
      request,
      targetType: "integration",
      targetId: IntegrationProvider.CODA,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const rule = await prisma.integrationRule.findUnique({
      where: {
        userId_provider_key: {
          userId: session.user.id,
          provider: IntegrationProvider.CODA,
          key: MIGRATION_RULE_KEY,
        },
      },
      include: {
        _count: { select: { receipts: true } },
      },
    });

    if (!rule) {
      return NextResponse.json({
        totalMigrationReceipts: 0,
        sources: {},
      });
    }

    // Count receipts grouped by source label
    const receipts = await prisma.integrationReceipt.findMany({
      where: {
        ruleId: rule.id,
        dedupeKey: { startsWith: "migration:coda:" },
      },
      select: {
        dedupeKey: true,
      },
    });

    const bySource = new Map<string, number>();
    for (const receipt of receipts) {
      // Extract source label from dedupe key: migration:coda:<label>:<rowId>
      const parts = receipt.dedupeKey.split(":");
      const label = parts[2] ?? "unknown";
      bySource.set(label, (bySource.get(label) ?? 0) + 1);
    }

    return NextResponse.json({
      totalMigrationReceipts: receipts.length,
      sources: Object.fromEntries(bySource),
    });
  } catch (error) {
    console.error("GET /api/migration/coda error:", error);
    return NextResponse.json(
      { error: "Failed to fetch migration status" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST: Run migration actions
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as MigrationRequestBody;
    const action = body.action ?? "dry-run";

    const permission = await enforcePermission({
      userId: session.user.id,
      action: action === "dry-run" || action === "dedup-check" || action === "reconcile"
        ? "profile.write"
        : "task.write",
      request,
      targetType: "integration",
      targetId: IntegrationProvider.CODA,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    if (!body.rows || !Array.isArray(body.rows)) {
      return NextResponse.json(
        { error: "Request body must include a 'rows' array of Coda export rows" },
        { status: 400 },
      );
    }

    const sourceLabel = body.sourceLabel ?? "coda-export";
    const migrationConfig = defaultMigrationConfig({
      sourceLabel,
      dryRun: action === "dry-run",
      ...body.config,
    });

    // -----------------------------------------------------------------------
    // Dedup Check
    // -----------------------------------------------------------------------

    if (action === "dedup-check") {
      const normalized = normalizeExportRows(
        body.rows,
        migrationConfig,
        new Date().toISOString(),
      );

      const dedupeKeys = normalized.map((r) =>
        buildMigrationDedupeKey(sourceLabel, r.sourceRowId),
      );
      const { existingDedupeKeys, existingContentHashes } =
        await lookupExistingReceipts(dedupeKeys);

      const existingSourceIds = new Set(
        normalized
          .filter((r) => existingDedupeKeys.has(
            buildMigrationDedupeKey(sourceLabel, r.sourceRowId),
          ))
          .map((r) => r.sourceRowId),
      );

      const result = runDedupDetection({
        records: normalized,
        sourceLabel,
        existingDedupeKeys,
        existingContentHashes,
        existingSourceIds,
      });

      return NextResponse.json({
        ok: true,
        action: "dedup-check",
        result: result.summary,
        textReport: formatDedupReport(result),
        details: result,
      });
    }

    // -----------------------------------------------------------------------
    // Reconcile
    // -----------------------------------------------------------------------

    if (action === "reconcile") {
      const normalized = normalizeExportRows(
        body.rows,
        migrationConfig,
        new Date().toISOString(),
      );

      const destinationRecords = await fetchDestinationRecords(
        session.user.id,
        sourceLabel,
      );

      const report = buildReconciliationReport({
        sourceLabel,
        sourceRows: body.rows,
        normalizedRecords: normalized,
        destinationRecords,
        columnMap: migrationConfig.columnMap,
      });

      const artifact = toReconciliationArtifact(report);

      return NextResponse.json({
        ok: true,
        action: "reconcile",
        summary: report.summary,
        textReport: artifact.textReport,
        artifact,
      });
    }

    // -----------------------------------------------------------------------
    // Dry-Run / Migrate
    // -----------------------------------------------------------------------

    // For actual migration, ensure we have a migration rule
    const migrationRule = action === "migrate"
      ? await getOrCreateMigrationRule(session.user.id)
      : null;

    const result = await runCodaMigration({
      rows: body.rows,
      config: migrationConfig,
      lookupExistingFn: lookupExistingReceipts,
      persistFn: action === "migrate" && migrationRule
        ? async (record, parentTargetId, dedupeKey) => {
            return await prisma.$transaction(async (tx) => {
              const existingReceipt = await tx.integrationReceipt.findUnique({
                where: { dedupeKey },
                select: { id: true, taskId: true },
              });

              if (existingReceipt?.taskId) {
                // Update existing task
                await tx.task.update({
                  where: { id: existingReceipt.taskId },
                  data: {
                    title: record.title,
                    notes: record.notes,
                    status: record.status as "BACKLOG" | "QUEUED" | "ACTIVE" | "WORKING_ON_TODAY" | "DONE" | "NOT_DONE",
                    priority: record.priority as "P0" | "P1" | "P2" | "P3",
                    dueDate: record.dueDate,
                    parentId: parentTargetId,
                    metadata: record.sourceMetadata as Record<string, unknown>,
                  },
                });

                await tx.integrationReceipt.update({
                  where: { id: existingReceipt.id },
                  data: {
                    lastObservedAt: new Date(),
                    metadata: {
                      contentHash: record.contentHash,
                      ...record.sourceMetadata,
                    },
                  },
                });

                return { id: existingReceipt.taskId, operation: "updated" as const };
              }

              // Create new task
              const task = await tx.task.create({
                data: {
                  title: record.title,
                  notes: record.notes,
                  status: record.status as "BACKLOG" | "QUEUED" | "ACTIVE" | "WORKING_ON_TODAY" | "DONE" | "NOT_DONE",
                  priority: record.priority as "P0" | "P1" | "P2" | "P3",
                  dueDate: record.dueDate,
                  parentId: parentTargetId,
                  userId: session.user!.id,
                  metadata: record.sourceMetadata as Record<string, unknown>,
                },
              });

              // Create receipt linking the rule to the task
              await tx.integrationReceipt.create({
                data: {
                  ruleId: migrationRule!.id,
                  dedupeKey,
                  externalObjectType: "coda_migration_row",
                  externalObjectId: record.sourceRowId,
                  sourceUrl: record.sourceMetadata.codaBrowserLink,
                  lastObservedAt: new Date(),
                  taskId: task.id,
                  metadata: {
                    contentHash: record.contentHash,
                    ...record.sourceMetadata,
                  },
                },
              });

              return { id: task.id, operation: "created" as const };
            });
          }
        : undefined,
    });

    return NextResponse.json({
      ok: true,
      action,
      dryRun: migrationConfig.dryRun,
      summary: {
        totalSourceRows: result.totalSourceRows,
        normalized: result.normalized,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        failed: result.failed,
      },
      textReport: migrationConfig.dryRun
        ? formatDryRunReport(result)
        : undefined,
      result,
    });
  } catch (error) {
    console.error("POST /api/migration/coda error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to run Coda migration";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
