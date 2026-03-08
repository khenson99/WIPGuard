import { EnrichmentProvider as PrismaEnrichmentProvider } from "@/generated/prisma/enums";
import {
  pullUnifySignalsFromApi,
  type UnifyPullRequest,
} from "@/lib/analytics/provider-enrichment-adapters";
import {
  ingestVisitorEnrichmentSignals,
  type VisitorEnrichmentSignalInput,
} from "@/lib/analytics/visitor-funnel";
import type { PrismaClientType } from "@/lib/prisma";

export type ProviderEnrichmentSyncResult = {
  provider: "unify" | "clay" | "rb2b";
  mode: "pull" | "push_only";
  ok: boolean;
  skipped: boolean;
  reason: string | null;
  pulled: number;
  stored: number;
  accepted: number;
  updatedAfter: string | null;
};

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function parsePositiveInt(value: string | null | undefined, fallback: number): number {
  const trimmed = trimOrNull(value);
  if (!trimmed) return fallback;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseEnabled(value: string | null | undefined, fallback: boolean): boolean {
  const trimmed = trimOrNull(value)?.toLowerCase();
  if (!trimmed) return fallback;
  if (["1", "true", "yes", "on"].includes(trimmed)) return true;
  if (["0", "false", "no", "off"].includes(trimmed)) return false;
  return fallback;
}

function isoOrNull(date: Date | null | undefined): string | null {
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function computeInitialLookbackCursor(now: Date, hours: number): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

export function computeIncrementalCursor(
  latestSeenAt: Date | null,
  now: Date,
  initialLookbackHours: number,
  overlapMinutes: number,
): string {
  if (!latestSeenAt) {
    return computeInitialLookbackCursor(now, initialLookbackHours);
  }

  return new Date(latestSeenAt.getTime() - overlapMinutes * 60 * 1000).toISOString();
}

export function resolveUnifyPullRequest(now: Date): (UnifyPullRequest & {
  apiKey: string | null;
  objectName: string | null;
  enabled: boolean;
}) {
  const apiKey =
    trimOrNull(process.env.UNIFY_DATA_API_KEY) ??
    trimOrNull(process.env.UNIFY_API_KEY);
  const objectName = trimOrNull(process.env.UNIFY_FUNNEL_OBJECT_NAME);
  const enabled = parseEnabled(process.env.UNIFY_FUNNEL_SYNC_ENABLED, Boolean(apiKey && objectName));

  return {
    mode: "pull",
    apiKey,
    objectName,
    updatedAfter: computeInitialLookbackCursor(
      now,
      parsePositiveInt(process.env.UNIFY_FUNNEL_INITIAL_LOOKBACK_HOURS, 24 * 7),
    ),
    maxRecords: parsePositiveInt(process.env.UNIFY_FUNNEL_MAX_RECORDS, 500),
    enabled,
  };
}

async function latestUnifySignalCursor(prisma: PrismaClientType): Promise<Date | null> {
  const latest = await prisma.funnelEnrichmentSignal.findFirst({
    where: {
      provider: PrismaEnrichmentProvider.UNIFY,
    },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    select: {
      occurredAt: true,
      createdAt: true,
    },
  });

  return latest?.occurredAt ?? latest?.createdAt ?? null;
}

export async function runVisitorFunnelEnrichmentSyncs(input: {
  prisma: PrismaClientType;
  now?: Date;
  pullUnify?: typeof pullUnifySignalsFromApi;
  ingestSignals?: (
    prisma: PrismaClientType,
    provider: "unify",
    signals: VisitorEnrichmentSignalInput[],
  ) => Promise<{ accepted: number; stored: number }>;
}): Promise<ProviderEnrichmentSyncResult[]> {
  const results: ProviderEnrichmentSyncResult[] = [
    {
      provider: "clay",
      mode: "push_only",
      ok: true,
      skipped: true,
      reason: "Push-only provider; send payloads to /api/v1/analytics/funnel/enrich/clay.",
      pulled: 0,
      stored: 0,
      accepted: 0,
      updatedAfter: null,
    },
    {
      provider: "rb2b",
      mode: "push_only",
      ok: true,
      skipped: true,
      reason: "Push-only provider; send payloads to /api/v1/analytics/funnel/enrich/rb2b.",
      pulled: 0,
      stored: 0,
      accepted: 0,
      updatedAfter: null,
    },
  ];

  const now = input.now ?? new Date();
  const config = resolveUnifyPullRequest(now);
  if (!config.enabled) {
    return [
      {
        provider: "unify",
        mode: "pull",
        ok: true,
        skipped: true,
        reason: "UNIFY_FUNNEL_SYNC_ENABLED is disabled or missing required configuration.",
        pulled: 0,
        stored: 0,
        accepted: 0,
        updatedAfter: null,
      },
      ...results,
    ];
  }

  if (!config.apiKey || !config.objectName) {
    return [
      {
        provider: "unify",
        mode: "pull",
        ok: false,
        skipped: true,
        reason: "Missing UNIFY_DATA_API_KEY/UNIFY_API_KEY or UNIFY_FUNNEL_OBJECT_NAME.",
        pulled: 0,
        stored: 0,
        accepted: 0,
        updatedAfter: null,
      },
      ...results,
    ];
  }

  const overlapMinutes = parsePositiveInt(process.env.UNIFY_FUNNEL_CURSOR_OVERLAP_MINUTES, 60);
  const initialLookbackHours = parsePositiveInt(
    process.env.UNIFY_FUNNEL_INITIAL_LOOKBACK_HOURS,
    24 * 7,
  );

  try {
    const latestCursor = await latestUnifySignalCursor(input.prisma);
    const updatedAfter = computeIncrementalCursor(
      latestCursor,
      now,
      initialLookbackHours,
      overlapMinutes,
    );
    const pullImpl = input.pullUnify ?? pullUnifySignalsFromApi;
    const signals = await pullImpl({
      apiKey: config.apiKey,
      objectName: config.objectName,
      updatedAfter,
      maxRecords: config.maxRecords,
    });
    const ingestImpl = input.ingestSignals ?? ingestVisitorEnrichmentSignals;
    const outcome = signals.length > 0
      ? await ingestImpl(input.prisma, "unify", signals)
      : { accepted: 0, stored: 0 };

    return [
      {
        provider: "unify",
        mode: "pull",
        ok: true,
        skipped: false,
        reason: null,
        pulled: signals.length,
        stored: outcome.stored,
        accepted: outcome.accepted,
        updatedAfter,
      },
      ...results,
    ];
  } catch (error) {
    return [
      {
        provider: "unify",
        mode: "pull",
        ok: false,
        skipped: false,
        reason: error instanceof Error ? error.message : "Failed to sync Unify enrichment signals.",
        pulled: 0,
        stored: 0,
        accepted: 0,
        updatedAfter: isoOrNull(now),
      },
      ...results,
    ];
  }
}
