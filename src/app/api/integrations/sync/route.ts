export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";
import { runRules, type IntegrationRunMode } from "@/lib/integrations/orchestrator";
import { parseIntegrationProvider } from "@/lib/integrations/rule-registry";

interface SyncRequestBody {
  mode?: IntegrationRunMode;
  providers?: string[];
  userIds?: string[];
  dryRun?: boolean;
  pageBudget?: number;
}

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

function normalizeProviders(value: unknown): IntegrationProvider[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const parsed = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => parseIntegrationProvider(entry))
    .filter((provider): provider is IntegrationProvider => provider !== null);

  if (parsed.length === 0) {
    return undefined;
  }

  return Array.from(new Set(parsed));
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSyncRequestAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as SyncRequestBody;

    const result = await runRules({
      mode: normalizeMode(body.mode),
      providers: normalizeProviders(body.providers),
      userIds: normalizeUserIds(body.userIds),
      dryRun: body.dryRun === true,
      pageBudget: normalizePageBudget(body.pageBudget),
      startedAt: new Date().toISOString(),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/integrations/sync error:", error);
    const message = error instanceof Error ? error.message : "Failed to execute integration sync";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
