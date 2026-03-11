export const dynamic = "force-dynamic";

import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
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

      signals = await pullUnifySignalsFromApi({
        apiKey,
        objectName,
        updatedAfter: trimOrNull(typeof body.updatedAfter === "string" ? body.updatedAfter : null),
        maxRecords: typeof body.maxRecords === "number" ? body.maxRecords : null,
      });
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
          accepted: 0,
          dryRun: false,
          disabled: true,
          mode,
          provider,
          received: signals.length,
          stored: 0,
          reason: VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON,
        },
        { status: 202 },
      );
    }

    const result = await ingestVisitorEnrichmentSignals(
      funnelPrisma,
      provider,
      signals,
    );
    return NextResponse.json(
      {
        ...result,
        dryRun: false,
        mode,
        provider,
        received: signals.length,
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
