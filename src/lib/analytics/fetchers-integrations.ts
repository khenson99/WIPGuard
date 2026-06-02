import { IntegrationProvider } from "@/generated/prisma/client";
import type { IntegrationProviderKey, IntegrationTelemetryData } from "@/lib/analytics/types";
import { prisma } from "@/lib/prisma";

function toProviderKey(provider: IntegrationProvider): IntegrationProviderKey {
  switch (provider) {
    case IntegrationProvider.GOOGLE_WORKSPACE:
      return "google_workspace";
    case IntegrationProvider.HUBSPOT:
      return "hubspot";
    case IntegrationProvider.SLACK:
      return "slack";
    case IntegrationProvider.CODA:
      return "coda";
    case IntegrationProvider.REDDIT:
      return "reddit";
    case IntegrationProvider.STRIPE:
      return "stripe";
    case IntegrationProvider.MERCURY:
      return "mercury";
    case IntegrationProvider.WEBFLOW:
      return "webflow";
    default:
      throw new Error(`Unsupported integration provider: ${provider as string}`);
  }
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toSeries(from: Date, to: Date): Array<{ date: string; receipts: number; artifactsCreated: number; failures: number }> {
  const result: Array<{ date: string; receipts: number; artifactsCreated: number; failures: number }> = [];
  const cursor = new Date(`${toDateKey(from)}T00:00:00.000Z`);
  const end = new Date(`${toDateKey(to)}T00:00:00.000Z`);

  while (cursor <= end) {
    result.push({ date: toDateKey(cursor), receipts: 0, artifactsCreated: 0, failures: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return result;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function positiveInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function countStringArray(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.filter((item) => typeof item === "string" && item.trim().length > 0).length;
}

function artifactCountFromReceiptMetadata(metadata: unknown): number {
  const record = asRecord(metadata);
  const explicit =
    positiveInteger(record.artifactsCreated) ||
    positiveInteger(record.artifactCount) ||
    positiveInteger(record.createdArtifactsCount);
  if (explicit > 0) return explicit;

  const arrayCount =
    countStringArray(record.artifactIds) ||
    countStringArray(record.createdArtifactIds);
  if (arrayCount > 0) return arrayCount;

  return typeof record.artifactId === "string" && record.artifactId.trim().length > 0
    ? 1
    : 0;
}

function getFailurePrefix(provider: IntegrationProvider): string {
  if (provider === IntegrationProvider.GOOGLE_WORKSPACE) return "integration.google";
  if (provider === IntegrationProvider.HUBSPOT) return "integration.hubspot";
  if (provider === IntegrationProvider.SLACK) return "integration.slack";
  if (provider === IntegrationProvider.CODA) return "integration.coda";
  if (provider === IntegrationProvider.STRIPE) return "integration.stripe";
  if (provider === IntegrationProvider.MERCURY) return "integration.mercury";
  if (provider === IntegrationProvider.WEBFLOW) return "integration.webflow";
  return "integration.reddit";
}

export async function fetchIntegrationTelemetryData(input: {
  userId: string;
  provider: IntegrationProvider;
  from: Date;
  to: Date;
}): Promise<IntegrationTelemetryData> {
  const [rules, receipts, outboxEvents] = await Promise.all([
    prisma.integrationRule.findMany({
      where: { userId: input.userId, provider: input.provider },
      select: {
        id: true,
        enabled: true,
        lastError: true,
      },
    }),
    prisma.integrationReceipt.findMany({
      where: {
        rule: {
          userId: input.userId,
          provider: input.provider,
        },
        lastObservedAt: {
          gte: input.from,
          lte: input.to,
        },
      },
      select: {
        lastObservedAt: true,
        metadata: true,
      },
    }),
    prisma.outboxEvent.findMany({
      where: {
        aggregateType: "integration_rule",
        eventType: {
          startsWith: getFailurePrefix(input.provider),
        },
        createdAt: {
          gte: input.from,
          lte: input.to,
        },
      },
      select: {
        eventType: true,
        error: true,
        createdAt: true,
      },
    }),
  ]);

  const trend = toSeries(input.from, input.to);
  const index = new Map(trend.map((row) => [row.date, row]));

  for (const receipt of receipts) {
    const key = toDateKey(receipt.lastObservedAt);
    const bucket = index.get(key);
    if (!bucket) continue;
    bucket.receipts += 1;
    bucket.artifactsCreated += artifactCountFromReceiptMetadata(receipt.metadata);
  }

  const topFailureCounter = new Map<string, number>();
  for (const event of outboxEvents) {
    const key = toDateKey(event.createdAt);
    const bucket = index.get(key);
    if (!bucket) continue;

    if (event.eventType.endsWith(".failed") || event.error) {
      bucket.failures += 1;
      const reason = event.error?.trim() || event.eventType;
      topFailureCounter.set(reason, (topFailureCounter.get(reason) ?? 0) + 1);
    }
  }

  const now = new Date().toISOString();

  return {
    provider: toProviderKey(input.provider),
    totalRules: rules.length,
    enabledRules: rules.filter((rule) => rule.enabled).length,
    erroredRules: rules.filter((rule) => Boolean(rule.lastError)).length,
    receiptsInRange: receipts.length,
    artifactsCreatedInRange: trend.reduce((sum, item) => sum + item.artifactsCreated, 0),
    eventsInRange: outboxEvents.length,
    failuresInRange: trend.reduce((sum, item) => sum + item.failures, 0),
    trend,
    topFailureReasons: Array.from(topFailureCounter.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    _meta: {
      fetchedAt: now,
      nextRefresh: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      source: "live",
    },
  };
}
