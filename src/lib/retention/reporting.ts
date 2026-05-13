import { prisma } from "@/lib/prisma";
import type { RetentionActor } from "@/lib/retention/service";

interface RetentionIdentityGapExample {
  source: string;
  objectType: string;
  externalId: string;
  tenantKey: string | null;
  occurredAt: string | null;
  candidateName: string | null;
  candidateDomain: string | null;
}

interface RetentionIdentityGapBucket {
  source: string;
  objectType: string;
  unresolvedRecords: number;
  examples: RetentionIdentityGapExample[];
}

interface RetentionSyncRunSummary {
  status: string;
  startedAt: string;
  completedAt: string | null;
  recordCount: number;
  mappedCount: number;
  errorCount: number;
  lastError: string | null;
}

interface RetentionArdaDataQuality {
  latestSync: RetentionSyncRunSummary | null;
  tenantRecords: number;
  activityRecords: number;
  tenantsWithUserDetailsBreadth: number;
  adoptionBreadthSource: "ARDA_ACTIVITY" | "ARDA_USER_DETAILS" | "NONE";
  note: string;
}

interface RetentionDataQualityReport {
  arda: RetentionArdaDataQuality;
}

export interface RetentionIdentityGapsReport {
  generatedAt: string;
  organizationId: string;
  summary: {
    unresolvedRecords: number;
    unresolvedBuckets: number;
    sourcesImpacted: number;
  };
  dataQuality: RetentionDataQualityReport;
  buckets: RetentionIdentityGapBucket[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function exampleFromRecord(record: {
  source: string;
  objectType: string;
  externalId: string;
  tenantKey: string | null;
  occurredAt: Date | null;
  payload: unknown;
}): RetentionIdentityGapExample {
  const payload = asRecord(record.payload);
  return {
    source: record.source,
    objectType: record.objectType,
    externalId: record.externalId,
    tenantKey: record.tenantKey,
    occurredAt: record.occurredAt?.toISOString() ?? null,
    candidateName:
      asString(payload.tenantName) ??
      asString(payload.customerName) ??
      asString(payload.companyName) ??
      asString(payload.accountName),
    candidateDomain:
      asString(payload.domain) ??
      asString(payload.companyDomain) ??
      asString(payload.emailDomain) ??
      asString(payload.workspaceDomain),
  };
}

function buildArdaNote(summary: {
  activityRecords: number;
  tenantsWithUserDetailsBreadth: number;
}): RetentionArdaDataQuality["note"] {
  if (summary.activityRecords > 0) {
    return "Arda direct item/card/order history is available in the retention source records.";
  }
  if (summary.tenantsWithUserDetailsBreadth > 0) {
    return "Arda direct item/card/order history is unavailable; current adoption breadth falls back to User Details snapshot counts.";
  }
  return "No Arda activity history or User Details fallback breadth counts are currently available.";
}

export async function buildRetentionIdentityGapsReport(
  actor: RetentionActor
): Promise<RetentionIdentityGapsReport> {
  const unresolvedGroups = await prisma.retentionSourceRecord.groupBy({
    by: ["source", "objectType"],
    where: {
      organizationId: actor.organizationId,
      customerRecordId: null,
    },
    _count: {
      _all: true,
    },
    orderBy: [
      {
        _count: {
          source: "desc",
        },
      },
      { source: "asc" },
      { objectType: "asc" },
    ],
  });

  const buckets: RetentionIdentityGapBucket[] = [];
  for (const group of unresolvedGroups) {
    const examples = await prisma.retentionSourceRecord.findMany({
      where: {
        organizationId: actor.organizationId,
        customerRecordId: null,
        source: group.source,
        objectType: group.objectType,
      },
      orderBy: [{ occurredAt: "desc" }, { updatedAt: "desc" }],
      take: 5,
      select: {
        source: true,
        objectType: true,
        externalId: true,
        tenantKey: true,
        occurredAt: true,
        payload: true,
      },
    });

    buckets.push({
      source: group.source,
      objectType: group.objectType,
      unresolvedRecords: group._count._all,
      examples: examples.map(exampleFromRecord),
    });
  }

  const [latestArdaSync, ardaGroups, ardaTenantRecords] = await Promise.all([
    prisma.retentionSyncRun.findFirst({
      where: {
        organizationId: actor.organizationId,
        source: "ARDA",
      },
      orderBy: [{ startedAt: "desc" }],
      select: {
        status: true,
        startedAt: true,
        completedAt: true,
        recordCount: true,
        mappedCount: true,
        errorCount: true,
        lastError: true,
      },
    }),
    prisma.retentionSourceRecord.groupBy({
      by: ["objectType"],
      where: {
        organizationId: actor.organizationId,
        source: "ARDA",
      },
      _count: {
        _all: true,
      },
    }),
    prisma.retentionSourceRecord.findMany({
      where: {
        organizationId: actor.organizationId,
        source: "ARDA",
        objectType: "tenant",
      },
      select: {
        payload: true,
      },
    }),
  ]);

  const ardaCounts = new Map(ardaGroups.map((group) => [group.objectType, group._count._all]));
  const tenantsWithUserDetailsBreadth = ardaTenantRecords.reduce((count, record) => {
    const payload = asRecord(record.payload);
    const cards = asNumber(payload.userDetailsCardCount) ?? 0;
    const items = asNumber(payload.userDetailsItemCount) ?? 0;
    const orders = asNumber(payload.userDetailsOrderCount) ?? 0;
    return cards > 0 || items > 0 || orders > 0 ? count + 1 : count;
  }, 0);

  const activityRecords =
    (ardaCounts.get("order") ?? 0) + (ardaCounts.get("card") ?? 0) + (ardaCounts.get("item") ?? 0);
  const adoptionBreadthSource =
    activityRecords > 0
      ? "ARDA_ACTIVITY"
      : tenantsWithUserDetailsBreadth > 0
        ? "ARDA_USER_DETAILS"
        : "NONE";

  return {
    generatedAt: new Date().toISOString(),
    organizationId: actor.organizationId,
    summary: {
      unresolvedRecords: buckets.reduce((sum, bucket) => sum + bucket.unresolvedRecords, 0),
      unresolvedBuckets: buckets.length,
      sourcesImpacted: new Set(buckets.map((bucket) => bucket.source)).size,
    },
    dataQuality: {
      arda: {
        latestSync: latestArdaSync
          ? {
              status: latestArdaSync.status,
              startedAt: latestArdaSync.startedAt.toISOString(),
              completedAt: latestArdaSync.completedAt?.toISOString() ?? null,
              recordCount: latestArdaSync.recordCount,
              mappedCount: latestArdaSync.mappedCount,
              errorCount: latestArdaSync.errorCount,
              lastError: latestArdaSync.lastError,
            }
          : null,
        tenantRecords: ardaCounts.get("tenant") ?? 0,
        activityRecords,
        tenantsWithUserDetailsBreadth,
        adoptionBreadthSource,
        note: buildArdaNote({
          activityRecords,
          tenantsWithUserDetailsBreadth,
        }),
      },
    },
    buckets,
  };
}

export function renderRetentionIdentityGapsMarkdown(report: RetentionIdentityGapsReport): string {
  const lines: string[] = [
    "# Identity Gaps Report",
    "",
    `Generated at: ${report.generatedAt}`,
    `Organization: ${report.organizationId}`,
    "",
    "## Summary",
    `- Unresolved records: ${report.summary.unresolvedRecords}`,
    `- Unresolved source/object buckets: ${report.summary.unresolvedBuckets}`,
    `- Sources impacted: ${report.summary.sourcesImpacted}`,
    "",
    "## Data Quality",
    `- ARDA adoption breadth source: ${report.dataQuality.arda.adoptionBreadthSource}`,
    `- ARDA tenant records: ${report.dataQuality.arda.tenantRecords}`,
    `- ARDA activity records: ${report.dataQuality.arda.activityRecords}`,
    `- ARDA tenant snapshots with User Details breadth counts: ${report.dataQuality.arda.tenantsWithUserDetailsBreadth}`,
    `- ARDA note: ${report.dataQuality.arda.note}`,
    report.dataQuality.arda.latestSync
      ? `- Latest ARDA sync: ${report.dataQuality.arda.latestSync.status} | records=${report.dataQuality.arda.latestSync.recordCount} | mapped=${report.dataQuality.arda.latestSync.mappedCount} | startedAt=${report.dataQuality.arda.latestSync.startedAt}`
      : "- Latest ARDA sync: none",
    "",
  ];

  if (report.buckets.length === 0) {
    lines.push("No unresolved retention source records were found.");
    return `${lines.join("\n")}\n`;
  }

  lines.push("## Buckets", "");
  for (const bucket of report.buckets) {
    lines.push(`### ${bucket.source} / ${bucket.objectType}`);
    lines.push(`- Unresolved records: ${bucket.unresolvedRecords}`);
    if (bucket.examples.length === 0) {
      lines.push("- Examples: none");
      lines.push("");
      continue;
    }
    lines.push("- Sample unresolved records:");
    for (const example of bucket.examples) {
      const detailBits = [
        example.externalId,
        example.tenantKey ? `tenantKey=${example.tenantKey}` : null,
        example.candidateName ? `name=${example.candidateName}` : null,
        example.candidateDomain ? `domain=${example.candidateDomain}` : null,
        example.occurredAt ? `occurredAt=${example.occurredAt}` : null,
      ].filter(Boolean);
      lines.push(`  - ${detailBits.join(" | ")}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
