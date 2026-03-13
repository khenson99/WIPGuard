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

export interface RetentionIdentityGapsReport {
  generatedAt: string;
  organizationId: string;
  summary: {
    unresolvedRecords: number;
    unresolvedBuckets: number;
    sourcesImpacted: number;
  };
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

  return {
    generatedAt: new Date().toISOString(),
    organizationId: actor.organizationId,
    summary: {
      unresolvedRecords: buckets.reduce((sum, bucket) => sum + bucket.unresolvedRecords, 0),
      unresolvedBuckets: buckets.length,
      sourcesImpacted: new Set(buckets.map((bucket) => bucket.source)).size,
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
