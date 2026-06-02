export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";
import { runRules, type IntegrationRunMode } from "@/lib/integrations/orchestrator";
import { parseIntegrationProvider } from "@/lib/integrations/rule-registry";
import { prisma } from "@/lib/prisma";
import { runSync, type SyncModules, type SyncResult } from "@/lib/sync/orchestrator";

interface SyncRequestBody {
  mode?: IntegrationRunMode;
  scope?: "all" | "rules";
  providers?: string[];
  userIds?: string[];
  dryRun?: boolean;
  pageBudget?: number;
}

interface NormalizedProviderFilter {
  providers?: IntegrationProvider[];
  invalidProviders: string[];
}

const MANUAL_FULL_SYNC_MODULES: SyncModules = {
  hubspot: false,
  slack: false,
  coda: false,
  google: false,
  providerRules: true,
  visitorFunnelEnrichment: true,
  analytics: true,
  automations: true,
  healthChecks: true,
};

function isSyncRequestAuthorized(request: NextRequest): boolean {
  const expected = process.env.INTEGRATION_SYNC_SECRET?.trim();
  if (!expected) {
    return false;
  }

  const provided = request.headers.get("x-integration-sync-secret")?.trim();
  return Boolean(provided && provided === expected);
}

function normalizeMode(value: unknown): IntegrationRunMode {
  return value === "backfill" ? "backfill" : "incremental";
}

function describeInvalidProvider(value: unknown): string {
  if (typeof value === "string") {
    return value.trim() || "<empty>";
  }

  if (value == null) {
    return String(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "<non-string>";
}

function normalizeProviders(value: unknown): NormalizedProviderFilter {
  if (!Array.isArray(value) || value.length === 0) {
    return { providers: undefined, invalidProviders: [] };
  }

  const providers: IntegrationProvider[] = [];
  const invalidProviders: string[] = [];

  for (const entry of value) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      invalidProviders.push(describeInvalidProvider(entry));
      continue;
    }

    const provider = parseIntegrationProvider(entry);
    if (!provider) {
      invalidProviders.push(entry.trim());
      continue;
    }

    providers.push(provider);
  }

  return {
    providers: providers.length > 0 ? Array.from(new Set(providers)) : undefined,
    invalidProviders: Array.from(new Set(invalidProviders)),
  };
}

function normalizeUserIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const userIds = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (userIds.length === 0) {
    return undefined;
  }

  return Array.from(new Set(userIds));
}

function normalizePageBudget(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const pageBudget = Math.floor(value);
  if (pageBudget < 1) {
    return undefined;
  }

  return pageBudget;
}

function asPositiveNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function formatRuleFailureDetails(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.map((entry) => {
    const record = entry && typeof entry === "object"
      ? (entry as Record<string, unknown>)
      : {};
    const ruleKey =
      typeof record.ruleKey === "string" && record.ruleKey.trim()
        ? record.ruleKey
        : "unknown_rule";
    const error =
      typeof record.error === "string" && record.error.trim()
        ? record.error
        : "failed without error detail";
    return `${ruleKey}: ${error}`;
  });
}

function hasRuleScopedOptions(
  body: SyncRequestBody,
  providerFilter: NormalizedProviderFilter,
): boolean {
  return (
    body.scope === "rules" ||
    body.dryRun === true ||
    body.mode === "backfill" ||
    body.pageBudget != null ||
    providerFilter.providers != null
  );
}

async function resolveImladrisContextFromUserIds(userIds: string[] | undefined): Promise<{
  userId: string | null;
  organizationId: string | null;
} | undefined> {
  if (userIds?.length !== 1) {
    return undefined;
  }

  let organizationId: string | null = null;
  try {
    organizationId =
      (
        await prisma.user.findUnique({
          where: { id: userIds[0] },
          select: { organizationId: true },
        })
      )?.organizationId ?? null;
  } catch (error) {
    console.error("POST /api/integrations/sync organization lookup failed:", error);
  }

  return {
    userId: userIds[0],
    organizationId,
  };
}

function formatModuleFailures(results: SyncResult[]): string[] {
  return results
    .filter((result) => !result.success)
    .map((result) => `${result.module}: ${result.error ?? "failed"}`);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSyncRequestAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as SyncRequestBody;
    const providerFilter = normalizeProviders(body.providers);
    if (providerFilter.invalidProviders.length > 0) {
      return NextResponse.json(
        {
          error: "Invalid provider filter",
          invalidProviders: providerFilter.invalidProviders,
        },
        { status: 400 },
      );
    }

    const userIds = normalizeUserIds(body.userIds);
    if (!hasRuleScopedOptions(body, providerFilter)) {
      const moduleResults = await runSync(prisma, MANUAL_FULL_SYNC_MODULES, {
        userIds,
        imladrisContext: await resolveImladrisContextFromUserIds(userIds),
      });
      const failures = formatModuleFailures(moduleResults);
      const degraded = failures.length > 0;

      return NextResponse.json({
        ok: !degraded,
        degraded,
        failures,
        modules: moduleResults,
      });
    }

    const result = await runRules({
      mode: normalizeMode(body.mode),
      providers: providerFilter.providers,
      userIds,
      dryRun: body.dryRun === true,
      pageBudget: normalizePageBudget(body.pageBudget),
      startedAt: new Date().toISOString(),
    });
    const failedRules = asPositiveNumber(result.failedRules);
    const failedUserRuns = asPositiveNumber(result.failedUserRuns);
    const degraded = failedRules > 0 || failedUserRuns > 0;
    const failures = [
      ...formatRuleFailureDetails(result.failedRuleErrors),
      ...(failedUserRuns > 0 ? [`${failedUserRuns} user run failed`] : []),
    ];

    return NextResponse.json({
      ok: !degraded,
      degraded,
      failures,
      ...result,
      failedRules,
      failedUserRuns,
    });
  } catch (error) {
    console.error("POST /api/integrations/sync error:", error);
    const message = error instanceof Error ? error.message : "Failed to execute integration sync";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
