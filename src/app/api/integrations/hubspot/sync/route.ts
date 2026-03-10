export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import { enforcePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  getOrCreateHubSpotBidirectionalRule,
  serializeHubSpotBidirectionalRule,
  HUBSPOT_BIDIRECTIONAL_RULE_KEY,
  __private__ as bidirectionalPrivate,
} from "@/lib/integrations/hubspot-bidirectional-sync";
import {
  detectDrift,
  validateMappingConfig,
  type DriftReport,
} from "@/lib/integrations/hubspot-sync";

interface SyncStatusResponse {
  rule: ReturnType<typeof serializeHubSpotBidirectionalRule>;
  connection: {
    status: string;
    lastSyncedAt: string | null;
    lastError: string | null;
  } | null;
  mappingValidation: string[];
  recentReceipts: Array<{
    id: string;
    direction: string;
    dealId: string;
    taskId: string | null;
    createdAt: string;
  }>;
}

/**
 * GET /api/integrations/hubspot/sync
 *
 * Returns the current sync status including:
 * - Rule configuration and state
 * - Connection status
 * - Mapping validation issues
 * - Recent sync receipts for audit trail
 */
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
      targetId: IntegrationProvider.HUBSPOT,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);
    const rule = await getOrCreateHubSpotBidirectionalRule(ownerUserId);
    const config = bidirectionalPrivate.normalizeConfig(rule.config);
    const mappingValidation = validateMappingConfig(config);

    const connection = await prisma.integrationConnection.findUnique({
      where: {
        userId_provider: {
          userId: ownerUserId,
          provider: IntegrationProvider.HUBSPOT,
        },
      },
      select: {
        status: true,
        lastSyncedAt: true,
        lastError: true,
      },
    });

    // Fetch recent receipts for audit trail
    const recentReceipts = await prisma.integrationReceipt.findMany({
      where: {
        rule: {
          userId: ownerUserId,
          provider: IntegrationProvider.HUBSPOT,
          key: HUBSPOT_BIDIRECTIONAL_RULE_KEY,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        externalObjectType: true,
        externalObjectId: true,
        taskId: true,
        createdAt: true,
        metadata: true,
      },
    });

    const formattedReceipts = recentReceipts.map((receipt) => {
      const metadata = receipt.metadata as Record<string, unknown> | null;
      const direction =
        typeof metadata?.direction === "string"
          ? metadata.direction
          : receipt.externalObjectType.includes("deal_to_task")
            ? "inbound"
            : "outbound";

      const parts = receipt.externalObjectId.split(":");
      const dealId = parts[0] ?? "unknown";

      return {
        id: receipt.id,
        direction,
        dealId,
        taskId: receipt.taskId,
        createdAt: receipt.createdAt.toISOString(),
      };
    });

    const response: SyncStatusResponse = {
      rule: serializeHubSpotBidirectionalRule(rule),
      connection: connection
        ? {
            status: connection.status,
            lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
            lastError: connection.lastError,
          }
        : null,
      mappingValidation,
      recentReceipts: formattedReceipts,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("GET /api/integrations/hubspot/sync error:", error);
    return NextResponse.json(
      { error: "Failed to load sync status" },
      { status: 500 }
    );
  }
}

interface DriftRequestBody {
  action: "drift_report";
}

/**
 * POST /api/integrations/hubspot/sync
 *
 * Actions:
 * - drift_report: Generate a drift detection report comparing HubSpot and local state
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as DriftRequestBody;
    if (body.action !== "drift_report") {
      return NextResponse.json(
        { error: "Invalid action. Supported: drift_report" },
        { status: 400 }
      );
    }

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "profile.write",
      request,
      targetType: "integration",
      targetId: IntegrationProvider.HUBSPOT,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);
    // Load rule config
    const rule = await getOrCreateHubSpotBidirectionalRule(ownerUserId);
    if (!rule.enabled) {
      return NextResponse.json(
        { error: "Bidirectional sync is disabled" },
        { status: 400 }
      );
    }

    const config = bidirectionalPrivate.normalizeConfig(rule.config);

    // Fetch all linked tasks via receipts
    const receipts = await prisma.integrationReceipt.findMany({
      where: {
        rule: {
          userId: ownerUserId,
          provider: IntegrationProvider.HUBSPOT,
        },
        taskId: { not: null },
      },
      select: {
        externalObjectId: true,
        task: {
          select: {
            id: true,
            status: true,
            updatedAt: true,
          },
        },
      },
    });

    // Build linked tasks map
    const linkedTasks = new Map<
      string,
      Array<{ id: string; status: typeof receipts[0]["task"] extends infer T ? T extends { status: infer S } ? S : never : never; updatedAt: Date }>
    >();

    for (const receipt of receipts) {
      if (!receipt.task) continue;
      const parts = receipt.externalObjectId.split(":");
      const dealId = parts[0];
      if (!dealId) continue;

      const bucket = linkedTasks.get(dealId) ?? [];
      // Avoid duplicate task entries
      if (!bucket.some((t) => t.id === receipt.task!.id)) {
        bucket.push({
          id: receipt.task.id,
          status: receipt.task.status,
          updatedAt: receipt.task.updatedAt,
        });
      }
      linkedTasks.set(dealId, bucket);
    }

    // For a drift report without live HubSpot API calls, we report
    // based on known linked tasks. Real deals would require API access.
    // We create synthetic deal entries from our receipt data.
    const dealIds = new Set<string>();
    for (const receipt of receipts) {
      const parts = receipt.externalObjectId.split(":");
      if (parts[0]) dealIds.add(parts[0]);
    }

    const syntheticDeals = Array.from(dealIds).map((dealId) => ({
      dealId,
      stage: "", // We don't have the current HubSpot stage without API call
      lastModified: null,
      pipeline: null,
    }));

    const report: DriftReport = detectDrift({
      deals: syntheticDeals,
      linkedTasks,
      config,
    });

    return NextResponse.json({
      ok: true,
      action: "drift_report",
      report,
    });
  } catch (error) {
    console.error("POST /api/integrations/hubspot/sync error:", error);
    return NextResponse.json(
      { error: "Failed to generate drift report" },
      { status: 500 }
    );
  }
}
