import { prisma } from "@/lib/prisma";
import { resolveRetentionActor } from "./_shared";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

async function main() {
  const actor = await resolveRetentionActor();

  const existing = await prisma.customerRecord.findMany({
    where: { organizationId: actor.organizationId },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((record) => normalizeName(record.name)));

  const unresolved = await prisma.retentionSourceRecord.findMany({
    where: {
      organizationId: actor.organizationId,
      customerRecordId: null,
      source: { in: ["CODA", "STRIPE"] },
    },
    select: {
      source: true,
      payload: true,
    },
  });

  const candidates = new Map<string, { name: string; sources: Set<string> }>();
  for (const record of unresolved) {
    const payload = asRecord(record.payload);
    const name =
      asString(payload.companyName) ??
      asString(payload.accountName) ??
      asString(payload.tenantName) ??
      asString(payload.customerName);
    if (!name) continue;
    const normalized = normalizeName(name);
    if (!normalized || existingNames.has(normalized)) continue;
    const current = candidates.get(normalized) ?? { name, sources: new Set<string>() };
    current.sources.add(record.source);
    candidates.set(normalized, current);
  }

  const inserts = [...candidates.values()].map((candidate) => ({
    name: candidate.name,
    organizationId: actor.organizationId,
    metadata: {
      bootstrapSource: "retention-bootstrap",
      inferredFromSources: [...candidate.sources],
    },
  }));

  for (const record of inserts) {
    await prisma.customerRecord.create({ data: record });
  }

  console.info(
    `[retention] bootstrapped ${inserts.length} customer records for organization ${actor.organizationId}`
  );
}

main().catch((error) => {
  console.error("[retention] customer bootstrap failed", error);
  process.exitCode = 1;
});
