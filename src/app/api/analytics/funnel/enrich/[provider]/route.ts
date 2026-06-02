export const dynamic = "force-dynamic";

import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  IntegrationConnectionStatus,
  IntegrationProvider,
} from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/session-user";
import type { EnrichmentProvider } from "@/lib/analytics/types";
import {
  isUnifyPullRequest,
  normalizeNativeProviderSignals,
  pullUnifySignalsFromApi,
} from "@/lib/analytics/provider-enrichment-adapters";
import {
  ingestVisitorEnrichmentSignals,
  type VisitorEnrichmentSignalInput,
} from "@/lib/analytics/visitor-funnel";
import {
  VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON,
  getVisitorFunnelPrisma,
} from "@/lib/analytics/visitor-funnel-availability";
import { ingestImladrisRawRecords } from "@/lib/imladris/ingestion";
import { buildImladrisRawRecordsFromPayload } from "@/lib/imladris/raw-records";

const SUPPORTED_PROVIDERS = new Set<EnrichmentProvider>(["unify", "clay", "rb2b"]);

interface EnrichRequestBody {
  dryRun?: boolean;
  signals?: VisitorEnrichmentSignalInput[];
}

interface DryRunPreviewRow {
  signalKey: string | null;
  anonymousId: string | null;
  email: string | null;
  domain: string | null;
  fullName: string | null;
  companyName: string | null;
  confidence: number | null;
  occurredAt: string | null;
  provenance: string | null;
  capturedUrl: string | null;
  referrer: string | null;
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function coerceBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["1", "true", "yes", "y", "on"].includes(value.trim().toLowerCase());
  }
  return false;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function extractRequestSecret(request: NextRequest): string | null {
  const authorization = trimOrNull(request.headers.get("authorization"));
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return trimOrNull(authorization.slice(7));
  }

  return (
    trimOrNull(request.headers.get("x-webhook-secret")) ??
    trimOrNull(request.nextUrl.searchParams.get("token")) ??
    trimOrNull(request.nextUrl.searchParams.get("secret"))
  );
}

function providerSecrets(provider: EnrichmentProvider): string[] {
  const specificEnvName = `${provider.toUpperCase()}_FUNNEL_ENRICH_SECRET`;
  return [
    process.env.VISITOR_FUNNEL_ENRICH_SECRET,
    process.env[specificEnvName],
  ]
    .map((value) => trimOrNull(value))
    .filter((value): value is string => Boolean(value));
}

function authorizeRequest(request: NextRequest, provider: EnrichmentProvider, role: string | undefined): boolean {
  if (role === "admin") return true;

  const suppliedSecret = extractRequestSecret(request);
  if (!suppliedSecret) return false;

  return providerSecrets(provider).some((expected) => safeEqual(expected, suppliedSecret));
}

function metadataString(
  metadata: VisitorEnrichmentSignalInput["metadata"] | null | undefined,
  key: string,
): string | null {
  const record = asObject(metadata);
  const value = record?.[key];
  return typeof value === "string" ? trimOrNull(value) : null;
}

function buildDryRunPreview(
  signals: VisitorEnrichmentSignalInput[],
): DryRunPreviewRow[] {
  return signals.slice(0, 5).map((signal) => ({
    signalKey: trimOrNull(signal.signalKey),
    anonymousId: trimOrNull(signal.anonymousId),
    email: trimOrNull(signal.email),
    domain: trimOrNull(signal.domain),
    fullName: trimOrNull(signal.fullName),
    companyName: trimOrNull(signal.companyName),
    confidence:
      typeof signal.confidence === "number" && Number.isFinite(signal.confidence)
        ? signal.confidence
        : null,
    occurredAt: trimOrNull(signal.occurredAt),
    provenance: trimOrNull(signal.provenance),
    capturedUrl: metadataString(signal.metadata, "capturedUrl"),
    referrer: metadataString(signal.metadata, "referrer"),
  }));
}

function buildDisabledPreviewRows(signals: VisitorEnrichmentSignalInput[]): Record<string, unknown>[] {
  return signals.map((signal) => {
    const metadata = asObject(signal.metadata);
    return {
      row_id: trimOrNull(signal.signalKey),
      email: trimOrNull(signal.email),
      domain: trimOrNull(signal.domain),
      full_name: trimOrNull(signal.fullName),
      company: trimOrNull(signal.companyName),
      title: trimOrNull(typeof metadata?.title === "string" ? metadata.title : null),
      website: trimOrNull(typeof metadata?.website === "string" ? metadata.website : null),
      linkedin_url: trimOrNull(typeof metadata?.linkedinUrl === "string" ? metadata.linkedinUrl : null),
      captured_url: trimOrNull(typeof metadata?.capturedUrl === "string" ? metadata.capturedUrl : null),
      referrer: trimOrNull(typeof metadata?.referrer === "string" ? metadata.referrer : null),
      occurred_at: trimOrNull(signal.occurredAt),
      confidence:
        typeof signal.confidence === "number" && Number.isFinite(signal.confidence)
          ? signal.confidence
          : null,
    };
  });
}

function parsedSignalDate(signal: VisitorEnrichmentSignalInput): Date | null {
  const occurredAt = trimOrNull(signal.occurredAt);
  if (!occurredAt) return null;
  const parsed = new Date(occurredAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function signalWindow(signals: VisitorEnrichmentSignalInput[], now: Date): {
  windowStart: Date;
  windowEnd: Date;
} {
  const timestamps = signals
    .map(parsedSignalDate)
    .filter((date): date is Date => Boolean(date))
    .map((date) => date.getTime());
  if (timestamps.length === 0) {
    return {
      windowStart: now,
      windowEnd: now,
    };
  }

  return {
    windowStart: new Date(Math.min(...timestamps)),
    windowEnd: now,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unknown error";
}

async function persistEnrichmentConnectionFreshness(input: {
  userId: string | null | undefined;
  syncedAt: Date;
}): Promise<string[]> {
  const userId = trimOrNull(input.userId);
  if (!userId) return [];

  const data = {
    status: IntegrationConnectionStatus.CONNECTED,
    lastSyncedAt: input.syncedAt,
    lastError: null,
  };
  try {
    const updateResult = await prisma.integrationConnection.updateMany({
      where: {
        userId,
        provider: IntegrationProvider.UNIFY,
      },
      data,
    });
    if (updateResult?.count === 0) {
      await prisma.integrationConnection.upsert({
        where: {
          userId_provider: {
            userId,
            provider: IntegrationProvider.UNIFY,
          },
        },
        update: data,
        create: {
          userId,
          provider: IntegrationProvider.UNIFY,
          ...data,
        },
      });
    }
    return [];
  } catch (error) {
    return [
      `Integration connection freshness persistence failed: ${errorMessage(error)}`,
    ];
  }
}

async function persistEnrichmentConnectionFailure(input: {
  userId: string | null | undefined;
  message: string;
}): Promise<string[]> {
  const userId = trimOrNull(input.userId);
  if (!userId) return [];

  const data = {
    status: IntegrationConnectionStatus.ERROR,
    lastSyncedAt: null,
    lastError: input.message,
  };
  try {
    const updateResult = await prisma.integrationConnection.updateMany({
      where: {
        userId,
        provider: IntegrationProvider.UNIFY,
      },
      data,
    });
    if (updateResult?.count === 0) {
      await prisma.integrationConnection.upsert({
        where: {
          userId_provider: {
            userId,
            provider: IntegrationProvider.UNIFY,
          },
        },
        update: data,
        create: {
          userId,
          provider: IntegrationProvider.UNIFY,
          ...data,
        },
      });
    }
    return [];
  } catch (error) {
    return [
      `Integration connection failure persistence failed: ${errorMessage(error)}`,
    ];
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);

    const { provider: rawProvider } = await context.params;
    const provider = rawProvider.trim().toLowerCase() as EnrichmentProvider;
    if (!SUPPORTED_PROVIDERS.has(provider)) {
      return NextResponse.json({ error: "Unsupported enrichment provider" }, { status: 400 });
    }
    if (!authorizeRequest(request, provider, user?.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await request.text();
    let body: Record<string, unknown> = {};
    if (rawBody.length > 0) {
      try {
        body = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
      }
    }
    const dryRun =
      coerceBoolean(body.dryRun) ||
      coerceBoolean(request.nextUrl.searchParams.get("dryRun"));
    if (dryRun && user?.role !== "admin") {
      return NextResponse.json(
        { error: "Dry-run validation requires admin access" },
        { status: 403 },
      );
    }

    let signals: VisitorEnrichmentSignalInput[] = [];
    let mode: "normalized" | "native" | "pull" = "normalized";

    if (Array.isArray((body as EnrichRequestBody).signals)) {
      signals = (body as EnrichRequestBody).signals ?? [];
    } else if (provider === "unify" && isUnifyPullRequest(body)) {
      mode = "pull";
      const apiKey =
        trimOrNull(typeof body.apiKey === "string" ? body.apiKey : null) ??
        trimOrNull(process.env.UNIFY_DATA_API_KEY) ??
        trimOrNull(process.env.UNIFY_API_KEY);
      const objectName =
        trimOrNull(typeof body.objectName === "string" ? body.objectName : null) ??
        trimOrNull(process.env.UNIFY_FUNNEL_OBJECT_NAME);
      if (!apiKey || !objectName) {
        return NextResponse.json(
          { error: "Unify pull requires apiKey and objectName" },
          { status: 400 },
        );
      }

      const pullResult = await pullUnifySignalsFromApi({
        apiKey,
        objectName,
        updatedAfter: trimOrNull(typeof body.updatedAfter === "string" ? body.updatedAfter : null),
        maxRecords: typeof body.maxRecords === "number" ? body.maxRecords : null,
      });
      if (pullResult.truncated) {
        return NextResponse.json(
          {
            error: `Unify pull returned ${pullResult.returned}/${pullResult.totalFiltered} filtered records; no enrichment signals were stored.`,
            dryRun,
            mode,
            provider,
            received: pullResult.returned,
            totalFiltered: pullResult.totalFiltered,
            maxRecords: pullResult.maxRecords,
          },
          { status: 409 },
        );
      }
      signals = pullResult.signals;
    } else {
      mode = "native";
      signals = normalizeNativeProviderSignals(provider, body);
    }

    if (signals.length === 0 && (mode === "pull" || dryRun)) {
      return NextResponse.json(
        {
          accepted: 0,
          dryRun,
          preview: [] as DryRunPreviewRow[],
          stored: 0,
          mode,
          provider,
          received: 0,
          message:
            mode === "pull"
              ? "No enrichment signals found in the requested pull window."
              : "No enrichment signals were found after normalizing the sample payload.",
        },
        { status: 202 },
      );
    }

    if (signals.length === 0) {
      return NextResponse.json(
        { error: "No enrichment signals found in request payload" },
        { status: 400 },
      );
    }

    if (dryRun) {
      return NextResponse.json(
        {
          accepted: signals.length,
          dryRun: true,
          mode,
          preview: buildDryRunPreview(signals),
          provider,
          received: signals.length,
          stored: 0,
          message: `Validated ${signals.length} normalized signal${signals.length === 1 ? "" : "s"}. No records were stored.`,
        },
        { status: 202 },
      );
    }

    const funnelPrisma = getVisitorFunnelPrisma(prisma);
    if (!funnelPrisma) {
      return NextResponse.json(
        {
          accepted: signals.length,
          dryRun: false,
          disabled: true,
          mode,
          provider,
          rows: buildDisabledPreviewRows(signals),
          received: signals.length,
          stored: 0,
          reason: VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON,
        },
        { status: 202 },
      );
    }

    const now = new Date();
    const { windowStart, windowEnd } = signalWindow(signals, now);
    const deliveryMode = mode === "pull" ? "pull" : "push";
    const rawRecords = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.UNIFY,
      snapshotKey: "visitorFunnel",
      payload: {
        signals: signals.map((signal) => ({
          ...signal,
          enrichmentProvider: provider,
        })),
        enrichmentProvider: provider,
        deliveryMode,
        received: signals.length,
      },
      from: windowStart.toISOString(),
      to: windowEnd.toISOString(),
      capturedAt: now,
    });
    const rawResult = await ingestImladrisRawRecords({
      prisma,
      provider: IntegrationProvider.UNIFY,
      context: {
        userId: user?.id ?? null,
        organizationId: user?.organizationId ?? null,
      },
      records: rawRecords,
      mode: "incremental",
      windowStart,
      windowEnd,
      checkpoint: {
        providerKey: provider,
        deliveryMode,
        signalCount: signals.length,
      },
      now,
    });
    if (rawResult.status === "ERROR" || rawResult.status === "PARTIAL") {
      const ingestionMessage = `Imladris raw ingestion ${
        rawResult.status === "PARTIAL" ? "partially succeeded" : "failed"
      } for ${provider}; enrichment signals were not stored.`;
      const statusPersistenceErrors = await persistEnrichmentConnectionFailure({
        userId: user?.id,
        message: ingestionMessage,
      });
      return NextResponse.json(
        {
          error: ingestionMessage,
          dryRun: false,
          mode,
          provider,
          rawAccepted: rawResult.acceptedCount,
          rawErrors: rawResult.errorCount,
          rawRecordCount: rawResult.recordCount,
          received: signals.length,
          ...(statusPersistenceErrors.length > 0 ? { statusPersistenceErrors } : {}),
        },
        { status: 502 },
      );
    }

    const result = await ingestVisitorEnrichmentSignals(
      funnelPrisma,
      provider,
      signals,
    );
    const statusPersistenceErrors = await persistEnrichmentConnectionFreshness({
      userId: user?.id,
      syncedAt: now,
    });
    return NextResponse.json(
      {
        ...result,
        dryRun: false,
        mode,
        provider,
        received: signals.length,
        ...(statusPersistenceErrors.length > 0 ? { statusPersistenceErrors } : {}),
      },
      { status: 202 },
    );
  } catch (error) {
    console.error("POST /api/analytics/funnel/enrich/[provider] error:", error);
    return NextResponse.json(
      { error: "Failed to ingest enrichment signals" },
      { status: 500 },
    );
  }
}
